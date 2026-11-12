import { translateEpub } from './translateEpub';
import { pagesToEpub, segmentPdfPage } from './pdfToEpub';
import type { TranslationTask } from './resumableTask';

export async function createPartialEpub(task: TranslationTask): Promise<{bytes: Uint8Array; percent: number}> {
  if (task.status === 'completed') throw new Error('任务已完成，请导出完整译本。');
  if (!Object.values(task.segments).some(text => text.trim())) throw new Error('尚无已完成的译文可导出。');
  if (/\.epub$/i.test(task.filename)) {
    let percent = 0;
    const bytes = await translateEpub(task.source, async () => { throw new Error('未完成译本不会请求翻译服务。'); }, {
      completedSegments: task.segments,
      partial: { onCount: (done, total) => { percent = Math.min(99, Math.floor(done * 100 / total)); } },
    });
    return { bytes, percent };
  }
  if (!/\.pdf$/i.test(task.filename) || !task.pdfPages || task.pdfComplete === false) throw new Error('PDF 页面识别尚未完成，无法生成未完成译本。');
  const total = task.pdfPages.reduce((count, page) => count + segmentPdfPage(page).length, 0);
  let index = 0;
  let done = 0;
  const pages = task.pdfPages.map(page => segmentPdfPage(page).map(() => {
    const text = task.segments[index++];
    if (text?.trim()) { done++; return text; }
    return '【此处内容尚未翻译】';
  }).join('\n'));
  if (!done || !total) throw new Error('尚无已完成的译文可导出。');
  const percent = Math.min(99, Math.floor(done * 100 / total));
  const title = `${task.filename.replace(/\.pdf$/i, '')} 中文译本（未完成 ${percent}%）`;
  const blob = await pagesToEpub(pages, title, 'zh-CN');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), percent };
}
