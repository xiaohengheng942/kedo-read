import { expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { strFromU8, unzipSync } from 'fflate';
vi.mock('@/services/ai/utils/httpFetch', () => ({ getAIFetch: () => globalThis.fetch }));
import { createOpenAICompatibleTranslator } from '@/services/translators/custom/openaiCompatible';
import { extractPdfPages, pagesToEpub } from '@/services/kedo/pdfToEpub';

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
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'test',
        object: 'chat.completion',
        created: 1,
        model: 'test',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '这是一本用于转换测试的英文小书。' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No local port');
    const provider = createOpenAICompatibleTranslator({
      id: 'local',
      name: 'Local test',
      type: 'openai-compatible',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      apiKey: 'test-only',
      model: 'test',
      addedAt: 1,
      updatedAt: 1,
    });
    const translated = await provider.translate(pages, 'en', 'zh-CN');
    const epub = await pagesToEpub(translated, '测试', 'zh-CN');
    const body = strFromU8(
      unzipSync(new Uint8Array(await epub.arrayBuffer()))['OEBPS/chapter1.xhtml']!,
    );
    expect(body).toContain('这是一本');
    expect(body).not.toContain('small English book');
  } finally {
    server.close();
  }
}, 15000);
