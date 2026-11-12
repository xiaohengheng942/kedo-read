'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Dialog from '@/components/Dialog';
import { useEnv } from '@/context/EnvContext';
import { useSettingsStore } from '@/store/settingsStore';
import { getTranslators } from '@/services/translators';
import { extractPdfPages, isPrimarilyEnglish, pagesToEpub, segmentPdfPage } from '@/services/kedo/pdfToEpub';
import { translateEpub } from '@/services/kedo/translateEpub';
import { assertChineseTranslation, translationError } from '@/services/kedo/translationError';
import { retryTranslation } from '@/services/kedo/retryTranslation';
import { createIndexedTaskStore, createTask, runTask, type TranslationTask } from '@/services/kedo/resumableTask';
import { exportTaskBackup, importTaskBackup } from '@/services/kedo/taskBackup';
import { createPartialEpub } from '@/services/kedo/partialEpub';

type Props = { isOpen: boolean; onClose: () => void; onImport: (file: File) => Promise<void> };
export default function KedoConversionDialog({ isOpen, onClose, onImport }: Props) {
  const { appService } = useEnv();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'auto' | 'translate' | 'original'>('auto');
  const currentProvider = useSettingsStore((s) => s.settings.globalReadSettings?.translationProvider);
  const [provider, setProvider] = useState('');
  const fileInputId = useId();
  const backupInputId = useId();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [output, setOutput] = useState<File | null>(null);
  const abort = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const taskStore = useRef(createIndexedTaskStore());
  const [savedTask, setSavedTask] = useState<TranslationTask | null>(null);
  const [loadingTask, setLoadingTask] = useState(false);
  const [switchDecision, setSwitchDecision] = useState(false);
  const running = useRef<Promise<void> | null>(null);
  const translators = getTranslators().filter((p) => !p.disabled && !p.authRequired);
  useEffect(() => {
    if (isOpen) {
      setProvider(['azure', 'google', 'yandex'].includes(currentProvider || '') ? currentProvider! : 'google');
    }
    if (!isOpen) {
      requestId.current++;
      abort.current?.abort();
      abort.current = null;
      setFile(null);
      setOutput(null);
      setStatus('');
      setBusy(false);
      setMode('auto');
      setSwitchDecision(false);
    }
  }, [isOpen, currentProvider]);
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoadingTask(true);
    void (async () => { await running.current; return taskStore.current.read(); })().then((task) => {
      if (!active || !task) return;
      setSavedTask(task);
      setFile(new File([new Uint8Array(task.source).buffer], task.filename));
      setProvider(task.provider);
      if (task.mode) setMode(task.mode);
      if (task.status === 'completed' && task.output) {
        setOutput(new File([new Uint8Array(task.output).buffer], `${task.filename.replace(/\.(pdf|epub)$/i, '')}-Kedo.epub`, { type: 'application/epub+zip' }));
        setStatus('任务已完成，可加入书库或导出。');
      } else {
        const state = task.status === 'waiting_network' ? '等待联网' : task.status === 'failed' ? '上次失败' : '已暂停';
        setStatus(`${state}：${Object.keys(task.segments).length} 段已保存，可继续。`);
      }
    }).catch(() => { if (active) setStatus('无法读取本机任务，请检查存储空间和权限。'); }).finally(() => { if (active) setLoadingTask(false); });
    return () => { active = false; };
  }, [isOpen]);
  const run = async (restartTranslation = false) => {
    if (!file) return;
    if (savedTask && savedTask.provider !== provider && Object.keys(savedTask.segments).length && !switchDecision) { setSwitchDecision(true); return; }
    if (restartTranslation && savedTask) {
      const reset = { ...savedTask, provider, segments: {}, status: 'paused' as const };
      await taskStore.current.write(reset);
      setSavedTask(reset);
    }
    setSwitchDecision(false);
    const controller = new AbortController();
    const id = ++requestId.current;
    abort.current = controller;
    setBusy(true);
    setOutput(null);
    setStatus('正在读取文件…');
    try {
      const service = translators.find((p) => p.name === provider);
      const translate = async (text: string, signal?: AbortSignal) => {
        if (!service) throw new Error('请选择已配置的翻译服务，或关闭翻译。');
        try {
          const result = await retryTranslation(
            () => service.translate([text], 'en', 'zh-CN', null, false, signal),
            signal,
          );
          if (!result[0]?.trim()) throw new Error('翻译服务返回空结果');
          assertChineseTranslation(text, result[0]);
          return result[0];
        } catch (error) {
          if (signal?.aborted) throw error;
          throw new Error(translationError(error, navigator.onLine));
        }
      };
      let bytes: Uint8Array;
      if (/\.pdf$/i.test(file.name)) {
        let task = await taskStore.current.read();
        if (mode !== 'original' && !task) {
          task = await createTask(taskStore.current, { filename: file.name, source: new Uint8Array(await file.arrayBuffer()), provider });
          task.mode = mode;
          task.pdfPages = [];
          task.pdfComplete = false;
          await taskStore.current.write(task);
          setSavedTask(task);
        }
        if (task && task.filename !== file.name) throw new Error('已有其他本机任务，请先完成或取消。');
        if (task && !task.pdfPages) { task.pdfPages = []; task.pdfComplete = false; await taskStore.current.write(task); }
        let pages = task?.pdfPages;
        if (!pages || task?.pdfComplete === false) {
          pages = await extractPdfPages(file, controller.signal, (n, total) => {
            if (requestId.current === id) setStatus(`提取文字与识别：${n}/${total} 页`);
          }, task ? { pages: task.pdfPages ?? [], onPage: async (index, text) => {
            task!.pdfPages![index] = text;
            await taskStore.current.write(task!);
          } } : undefined);
          controller.signal.throwIfAborted();
          if (task) { task.pdfPages = pages; task.pdfComplete = true; await taskStore.current.write(task); }
        }
        const shouldTranslate = mode === 'translate' ||
          (mode === 'auto' && isPrimarilyEnglish(pages.join(' ').slice(0, 10000)));
        if (shouldTranslate) {
          if (!task) throw new Error('无法保存翻译任务。');
          if (task.provider !== provider) { task.provider = provider; await taskStore.current.write(task); }
          const pdfPages = pages;
          bytes = await runTask(taskStore.current, (text) => translate(text, controller.signal),
            async (_source, perform, completed, save) => {
              let index = 0;
              const result: string[] = [];
              const total = pdfPages.reduce((n, page) => n + segmentPdfPage(page).length, 0);
              for (const page of pdfPages) {
                const translated: string[] = [];
                for (const segment of segmentPdfPage(page)) {
                  controller.signal.throwIfAborted();
                  let text = completed[index];
                  if (text === undefined) { text = await perform(segment); controller.signal.throwIfAborted(); await save(index, text); }
                  translated.push(text);
                  index++;
                  if (requestId.current === id) setStatus(`翻译：${index}/${total} 段`);
                }
                result.push(translated.join('\n'));
              }
              controller.signal.throwIfAborted();
              return new Uint8Array(await (await pagesToEpub(result, file.name.replace(/\.pdf$/i, ''), 'zh-CN')).arrayBuffer());
            }, controller.signal);
        } else {
          if (task) { await taskStore.current.clear(); setSavedTask(null); }
          bytes = new Uint8Array(await (await pagesToEpub(pages, file.name.replace(/\.pdf$/i, ''), 'und')).arrayBuffer());
        }
      } else {
        if (mode === 'original')
          throw new Error('EPUB 已经是 EPUB 格式，请选择翻译或直接导入原文件。');
        let task = await taskStore.current.read();
        if (!task) task = await createTask(taskStore.current, { filename: file.name, source: new Uint8Array(await file.arrayBuffer()), provider });
        if (task.filename !== file.name) throw new Error('已有其他本机任务，请先完成或取消。');
        if (task.provider !== provider) { task.provider = provider; await taskStore.current.write(task); }
        setSavedTask(task);
        bytes = await runTask(taskStore.current, (text) => translate(text, controller.signal),
          (source, perform, completedSegments, onSegment) => translateEpub(source, perform, {
            signal: controller.signal, completedSegments, onSegment,
            onProgress: (n, total) => { if (requestId.current === id) setStatus(`翻译：${n}/${total} 段`); },
          }), controller.signal);
        setSavedTask(await taskStore.current.read());
      }
      controller.signal.throwIfAborted();
      if (requestId.current !== id) return;
      const buffer = new Uint8Array(bytes).buffer;
      setOutput(
        new File([buffer], `${file.name.replace(/\.(pdf|epub)$/i, '')}-Kedo.epub`, {
          type: 'application/epub+zip',
        }),
      );
      setStatus('转换完成。可导入书库或导出。');
    } catch (e) {
      if (/\.pdf$/i.test(file.name) && mode !== 'original') {
        try {
          const task = await taskStore.current.read();
          if (task && task.status === 'paused' && !controller.signal.aborted) {
            task.status = navigator.onLine ? 'failed' : 'waiting_network';
            await taskStore.current.write(task);
          }
        } catch { /* preserve the original error */ }
      }
      if (requestId.current === id)
        setStatus(
          controller.signal.aborted
            ? (mode !== 'original' ? '任务已暂停；已完成的分段保存在本机。' : '转换已取消。')
            : `转换失败：${e instanceof Error ? e.message : String(e)}`,
        );
    } finally {
      if (mode !== 'original') {
        try { const saved = await taskStore.current.read(); if (requestId.current === id) setSavedTask(saved); } catch { /* keep the existing visible error */ }
      }
      if (requestId.current === id) {
        setBusy(false);
        abort.current = null;
      }
    }
  };
  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        abort.current?.abort();
        onClose();
      }}
      title='转换或翻译书籍'
    >
      <div className='flex flex-col gap-3 p-4'>
        <label htmlFor={fileInputId} className='btn btn-primary w-full cursor-pointer'>
          {file ? '重新选择 PDF 或 EPUB 文件' : '选择 PDF 或 EPUB 文件'}
        </label>
        {file && <p className='break-all text-sm' aria-live='polite'>已选择：{file.name}</p>}
        <input
          id={fileInputId}
          aria-label='选择 PDF 或 EPUB 文件'
          className='sr-only focus:not-sr-only'
          type='file'
          disabled={busy || loadingTask || !!savedTask}
          onChange={(e) => {
            const selected = e.target.files?.[0] || null;
            const valid = !selected || /\.(pdf|epub)$/i.test(selected.name);
            setFile(valid ? selected : null);
            setOutput(null);
            setStatus(valid ? '' : '请选择 PDF 或 EPUB 文件。');
          }}
        />
        <label>
          处理方式{' '}
          <select
            className='select select-bordered w-full'
            value={mode}
            disabled={busy || !!savedTask}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value='auto'>自动：英文 PDF 翻译，其他 PDF 保留原文</option>
            <option value='translate'>翻译为简体中文</option>
            <option value='original'>只转换格式</option>
          </select>
        </label>
        <label>
          翻译服务{' '}
          <select
            className='select select-bordered w-full'
            value={provider}
            disabled={busy}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value=''>请选择服务</option>
            {translators.map((p) => (
              <option key={p.name} value={p.name}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <p>在线翻译会将书籍内容发送给所选服务，可能产生费用。可在设置中配置自定义翻译服务。</p>
        <p>翻译任务和已完成分段保存在本机；清理应用网页数据会删除任务。可导出任务备份到本机，备份包含书籍和译文，请妥善保管。任务云同步尚未提供。扫描页使用本机文字识别，复杂排版和图片可能丢失。</p>
        {!savedTask && !busy && <><label htmlFor={backupInputId} className='btn'>恢复本机任务备份</label><input id={backupInputId} aria-label='恢复本机任务备份' className='sr-only focus:not-sr-only' type='file' accept='.json,application/json' onChange={(e) => {
          const selected = e.target.files?.[0];
          if (!selected) return;
          void selected.text().then(importTaskBackup).then(async (task) => {
            if (await taskStore.current.read()) throw new Error('已有任务，请先处理该任务。');
            await taskStore.current.write(task);
            setSavedTask(task); setFile(new File([new Uint8Array(task.source).buffer], task.filename)); setProvider(task.provider);
            if (task.mode) setMode(task.mode);
            if (task.status === 'completed' && task.output) setOutput(new File([new Uint8Array(task.output).buffer], `${task.filename.replace(/\.(pdf|epub)$/i, '')}-Kedo.epub`, { type: 'application/epub+zip' }));
            setStatus('任务备份已恢复到本机。');
          }).catch(() => setStatus('无法恢复备份，请检查文件是否有效且本机没有其他任务。'));
          e.target.value = '';
        }} /></>}
        {savedTask && savedTask.status !== 'completed' && Object.keys(savedTask.segments).length > 0 && <p>可导出已完成的译文；未翻译处会标记缺失。此 EPUB 并非完整译本，导出后仍可继续任务。</p>}
        {status && <p role='status'>{status}</p>}
        {switchDecision && <div role='alert'>
          <p>切换服务后，译文可能混用不同服务。请选择保留已译内容，或重新翻译整本书。</p>
          <button className='btn' onClick={() => { const p = run(); running.current = p; void p.finally(() => { if (running.current === p) running.current = null; }); }}>保留已译内容并继续</button>
          <button className='btn' onClick={() => { const p = run(true); running.current = p; void p.finally(() => { if (running.current === p) running.current = null; }); }}>重新翻译整本书</button>
          <button className='btn' onClick={() => setSwitchDecision(false)}>返回</button>
        </div>}
        <div className='flex flex-wrap gap-2'>
          <button className='btn btn-primary' disabled={!file || busy || loadingTask || switchDecision || savedTask?.status === 'completed'} onClick={() => { const p = run(); running.current = p; void p.finally(() => { if (running.current === p) running.current = null; }); }}>
            {savedTask && savedTask.status !== 'completed' ? '继续任务' : '开始'}
          </button>
          {busy && (
            <button className='btn' onClick={() => abort.current?.abort()}>
              暂停任务
            </button>
          )}
          {savedTask && !busy && <button className='btn' onClick={() => {
            const backup = exportTaskBackup(savedTask);
            void appService?.saveFile('Kedo-任务备份.json', backup, { mimeType: 'application/json' }).then(ok => { if (ok) setStatus('任务备份已导出，请妥善保管。'); });
          }}>导出任务备份（JSON）</button>}
          {savedTask && savedTask.status !== 'completed' && !busy && Object.keys(savedTask.segments).length > 0 && <button className='btn' onClick={() => {
            setBusy(true);
            void (async () => {
              try {
                const { bytes, percent } = await createPartialEpub(savedTask);
                const name = `${savedTask.filename.replace(/\.(pdf|epub)$/i, '')}_中文译本_未完成_${percent}%.epub`;
                const ok = await appService?.saveFile(name, new Uint8Array(bytes).buffer, { mimeType: 'application/epub+zip' });
                if (ok) setStatus('已导出未完成译本；原任务仍可继续。');
              } catch (error) {
                setStatus(`未完成译本导出失败：${error instanceof Error ? error.message : String(error)}`);
              } finally { setBusy(false); }
            })();
          }}>导出已翻译内容（EPUB）</button>}
          {savedTask?.status === 'completed' && !busy && (
            <button className='btn' onClick={() => void taskStore.current.clear().then(() => { setSavedTask(null); setOutput(null); setFile(null); setStatus('请选择下一本书。'); }).catch(() => setStatus('无法清理已完成任务，请重试。'))}>开始处理下一本</button>
          )}
          {savedTask && savedTask.status !== 'completed' && !busy && (
            <button className='btn' onClick={() => void taskStore.current.clear().then(() => { setSavedTask(null); setOutput(null); setFile(null); setStatus('本机任务已取消。'); }).catch(() => setStatus('无法删除本机任务，请重试。'))}>取消并删除本机任务</button>
          )}
          {output && (
            <>
              <button className='btn' onClick={() => void onImport(output).then(onClose)}>
                加入书库
              </button>
              <button
                className='btn'
                onClick={() =>
                  void output
                    .arrayBuffer()
                    .then((data) =>
                      appService?.saveFile(output.name, data, { mimeType: output.type }),
                    )
                }
              >
                导出 EPUB
              </button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
