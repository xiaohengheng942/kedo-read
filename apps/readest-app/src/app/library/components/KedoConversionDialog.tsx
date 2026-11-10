'use client';
import { useEffect, useRef, useState } from 'react';
import Dialog from '@/components/Dialog';
import { useEnv } from '@/context/EnvContext';
import { getTranslators } from '@/services/translators';
import { extractPdfPages, isPrimarilyEnglish, pagesToEpub } from '@/services/kedo/pdfToEpub';
import { translateEpub } from '@/services/kedo/translateEpub';
import { assertChineseTranslation, translationError } from '@/services/kedo/translationError';
import { retryTranslation } from '@/services/kedo/retryTranslation';

type Props = { isOpen: boolean; onClose: () => void; onImport: (file: File) => Promise<void> };
export default function KedoConversionDialog({ isOpen, onClose, onImport }: Props) {
  const { appService } = useEnv();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'auto' | 'translate' | 'original'>('auto');
  const [provider, setProvider] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [output, setOutput] = useState<File | null>(null);
  const abort = useRef<AbortController | null>(null);
  const translators = getTranslators().filter((p) => !p.disabled && !p.authRequired);
  useEffect(() => {
    if (!isOpen) abort.current?.abort();
  }, [isOpen]);
  const run = async () => {
    if (!file) return;
    const controller = new AbortController();
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
          throw new Error(translationError(error));
        }
      };
      let bytes: Uint8Array;
      if (/\.pdf$/i.test(file.name)) {
        const pages = await extractPdfPages(file, controller.signal, (n, total) =>
          setStatus(`提取文字：${n}/${total} 页`),
        );
        const shouldTranslate =
          mode === 'translate' ||
          (mode === 'auto' && isPrimarilyEnglish(pages.join(' ').slice(0, 10000)));
        if (shouldTranslate) {
          for (let i = 0; i < pages.length; i++) {
            const segments = pages[i]!.match(/[\s\S]{1,1800}/g) || [];
            const translated: string[] = [];
            for (const segment of segments)
              if (segment.trim()) translated.push(await translate(segment, controller.signal));
            pages[i] = translated.join('\n');
            setStatus(`翻译：${i + 1}/${pages.length} 页`);
          }
        }
        bytes = new Uint8Array(
          await (
            await pagesToEpub(
              pages,
              file.name.replace(/\.pdf$/i, ''),
              shouldTranslate ? 'zh-CN' : 'und',
            )
          ).arrayBuffer(),
        );
      } else {
        if (mode === 'original')
          throw new Error('EPUB 已经是 EPUB 格式，请选择翻译或直接导入原文件。');
        bytes = await translateEpub(new Uint8Array(await file.arrayBuffer()), translate, {
          signal: controller.signal,
          onProgress: (n, total) => setStatus(`翻译：${n}/${total} 段`),
        });
      }
      controller.signal.throwIfAborted();
      const buffer = new Uint8Array(bytes).buffer;
      setOutput(
        new File([buffer], `${file.name.replace(/\.(pdf|epub)$/i, '')}-Kedo.epub`, {
          type: 'application/epub+zip',
        }),
      );
      setStatus('转换完成。可导入书库或导出。');
    } catch (e) {
      setStatus(
        controller.signal.aborted
          ? '任务已取消。'
          : `转换失败：${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
      abort.current = null;
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
        <input
          type='file'
          accept='.pdf,.epub,application/pdf,application/epub+zip'
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setOutput(null);
            setStatus('');
          }}
        />
        <label>
          处理方式{' '}
          <select
            className='select select-bordered w-full'
            value={mode}
            disabled={busy}
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
        <p>PDF 转换仅提取文字；复杂排版和图片可能丢失，扫描件暂不支持 OCR。</p>
        {status && <p role='status'>{status}</p>}
        <div className='flex flex-wrap gap-2'>
          <button className='btn btn-primary' disabled={!file || busy} onClick={() => void run()}>
            开始
          </button>
          {busy && (
            <button className='btn' onClick={() => abort.current?.abort()}>
              取消任务
            </button>
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
