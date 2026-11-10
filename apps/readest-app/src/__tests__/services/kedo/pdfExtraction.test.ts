import { expect, it } from 'vitest';
import { extractPdfPages } from '@/services/kedo/pdfToEpub';

function syntheticPdf(): Uint8Array {
  const encoder = new TextEncoder();
  const stream =
    'BT /F1 16 Tf 72 720 Td (This is a small English book used for conversion testing.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let text = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(text.length);
    text += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = text.length;
  text += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    text += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  text += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return encoder.encode(text);
}

it('extracts text from a real synthetic PDF without changing its input', async () => {
  const worker = await import('@pdfjs/pdf.worker.min.mjs');
  (globalThis as Record<string, unknown>)['pdfjsWorker'] = worker;
  const bytes = syntheticPdf();
  const file = new File([new Uint8Array(bytes).buffer], 'sample.pdf');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array(bytes).buffer });
  const progress: number[] = [];
  const pages = await extractPdfPages(file, new AbortController().signal, (done) =>
    progress.push(done),
  );
  expect(pages).toHaveLength(1);
  expect(pages[0]).toContain('small English book');
  expect(progress).toEqual([1]);
}, 15000);
