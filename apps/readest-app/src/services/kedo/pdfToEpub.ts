import { buildEpub } from '@/services/send/conversion/buildEpub';
import { franc } from 'franc-min';
import { invoke } from '@tauri-apps/api/core';

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
  if (!pages.some((page) => page.trim())) {
    throw new Error('PDF 没有可识别的文字（包括 OCR 结果），无法生成 EPUB。');
  }
}

export async function resolvePageText(
  extracted: string,
  isBlank: () => Promise<boolean>,
  ocr: () => Promise<string>,
): Promise<string> {
  if (extracted.trim()) return extracted;
  if (await isBlank()) return '';
  const recognized = (await ocr()).trim();
  if (!recognized) throw new Error('OCR 未能识别此页面的文字。');
  return recognized;
}

type PdfTextItem = { str?: string; hasEOL?: boolean };
type PdfTextStream = {
  getReader: () => {
    read: () => Promise<{ done: boolean; value?: { items: PdfTextItem[] } }>;
    releaseLock: () => void;
  };
};

/** WebKit versions without ReadableStream async iteration still support getReader(). */
export async function readPdfTextStream(
  stream: PdfTextStream,
  signal?: AbortSignal,
): Promise<string> {
  const reader = stream.getReader();
  const parts: string[] = [];
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || !Array.isArray(value.items)) throw new Error('PDF text stream is invalid');
      for (const item of value.items) parts.push((item.str || '') + (item.hasEOL ? '\n' : ' '));
    }
    return parts.join('').trim();
  } finally {
    reader.releaseLock();
  }
}

export function segmentPdfPage(page: string): string[] {
  return (page.match(/[\s\S]{1,1800}/g) || []).filter(segment => segment.trim());
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
  checkpoint?: { pages: string[]; onPage: (index: number, text: string) => Promise<void> },
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
              streamTextContent: () => PdfTextStream;
              getViewport: (options: { scale: number }) => { width: number; height: number };
              render: (options: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; background: string }) => { promise: Promise<void>; cancel: () => void };
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
    progress(0, pdf.numPages);
    for (let i = 1; i <= pdf.numPages; i++) {
      signal.throwIfAborted();
      if (checkpoint && typeof checkpoint.pages[i - 1] === 'string') {
        pages.push(checkpoint.pages[i - 1]!);
        progress(i, pdf.numPages);
        continue;
      }
      const page = await pdf.getPage(i);
      const extracted = await readPdfTextStream(page.streamTextContent(), signal);
      let canvas: HTMLCanvasElement | undefined;
      const renderPage = async () => {
        if (canvas) return canvas;
        const viewport = page.getViewport({ scale: 2 });
        if (viewport.width * viewport.height > 30_000_000) throw new Error(`第 ${i} 页尺寸过大，无法识别。`);
        const image = document.createElement('canvas');
        image.width = Math.ceil(viewport.width);
        image.height = Math.ceil(viewport.height);
        const context = image.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('无法创建页面识别图像。');
        const rendering = page.render({ canvas: image, canvasContext: context, viewport, background: 'white' });
        const cancelRender = () => rendering.cancel();
        signal.addEventListener('abort', cancelRender, { once: true });
        try { await rendering.promise; } finally { signal.removeEventListener('abort', cancelRender); }
        signal.throwIfAborted();
        canvas = image;
        return image;
      };
      pages.push(await resolvePageText(extracted, async () => {
        const image = await renderPage();
        const pixels = image.getContext('2d')!.getImageData(0, 0, image.width, image.height).data;
        let dark = 0;
        for (let p = 0; p < pixels.length; p += 4) {
          if (pixels[p]! < 235 || pixels[p + 1]! < 235 || pixels[p + 2]! < 235) dark++;
          if (dark > 5) return false;
        }
        return true;
      }, async () => {
        const image = await renderPage();
        const blob = await new Promise<Blob | null>((resolve) => image.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error(`无法生成第 ${i} 页识别图像。`);
        signal.throwIfAborted();
        try {
          const text = await invoke<string>('kedo_ocr', { image: Array.from(new Uint8Array(await blob.arrayBuffer())) });
          signal.throwIfAborted();
          return text;
        } catch (error) {
          signal.throwIfAborted();
          throw new Error(`第 ${i} 页无法完成本地文字识别：${String(error)}`);
        }
      }));
      if (checkpoint) await checkpoint.onPage(i - 1, pages[i - 1]!);
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
