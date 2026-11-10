import { buildEpub } from '@/services/send/conversion/buildEpub';
import { franc } from 'franc-min';

export function isPrimarilyEnglish(text: string): boolean {
  return franc(text.slice(0, 10000)) === 'eng';
}

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function pdfResourceOptions(base: string) {
  return {
    cMapUrl: new URL('/vendor/pdfjs/cmaps/', base).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('/vendor/pdfjs/standard_fonts/', base).href,
  };
}

function validatePages(pages: string[]): void {
  if (!pages.length || pages.some((page) => !page.trim())) {
    throw new Error('PDF 包含没有文字层的页面（可能是扫描页或空白页）；当前未配置 OCR。');
  }
}

export async function pagesToEpub(pages: string[], title: string, language = 'und'): Promise<Blob> {
  validatePages(pages);
  return buildEpub(
    pages.map((page, i) => ({
      title: `第 ${i + 1} 页`,
      html: page
        .split(/\n+/)
        .filter(Boolean)
        .map((line) => `<p>${escapeXml(line)}</p>`)
        .join(''),
    })),
    { title, author: '', language, identifier: `urn:uuid:${crypto.randomUUID()}` },
  );
}

export async function extractPdfPages(
  file: File,
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
): Promise<string[]> {
  await import('@pdfjs/pdf.min.mjs');
  const pdfjs = (
    globalThis as typeof globalThis & {
      pdfjsLib: {
        GlobalWorkerOptions: { workerSrc: string };
        getDocument: (options: { data: Uint8Array } & ReturnType<typeof pdfResourceOptions>) => {
          promise: Promise<{
            numPages: number;
            getPage: (n: number) => Promise<{
              getTextContent: () => Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>;
            }>;
            destroy: () => Promise<void>;
          }>;
          destroy: () => Promise<void>;
        };
      };
    }
  ).pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    '/vendor/pdfjs/pdf.worker.min.mjs',
    location.href,
  ).href;
  signal.throwIfAborted();
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    ...pdfResourceOptions(location.href),
  });
  const abort = () => {
    void task.destroy();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      signal.throwIfAborted();
      const content = await (await pdf.getPage(i)).getTextContent();
      pages.push(
        content.items
          .map((item) => (item.str || '') + (item.hasEOL ? '\n' : ' '))
          .join('')
          .trim(),
      );
      progress(i, pdf.numPages);
    }
    signal.throwIfAborted();
    validatePages(pages);
    return pages;
  } finally {
    signal.removeEventListener('abort', abort);
    await task.destroy();
  }
}
