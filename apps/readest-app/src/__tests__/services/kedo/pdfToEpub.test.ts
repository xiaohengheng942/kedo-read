import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { pagesToEpub, isPrimarilyEnglish, pdfResourceOptions } from '@/services/kedo/pdfToEpub';

describe('PDF text conversion', () => {
  it('provides bundled PDF fonts and CMaps for non-English text', () => {
    const options = pdfResourceOptions('https://example.test/library');
    expect(options.cMapUrl).toBe('https://example.test/vendor/pdfjs/cmaps/');
    expect(options.standardFontDataUrl).toBe('https://example.test/vendor/pdfjs/standard_fonts/');
  });
  it('detects English and avoids treating Chinese text as English', () => {
    expect(isPrimarilyEnglish('This is an English book with many words.')).toBe(true);
    expect(isPrimarilyEnglish('这是一本中文书，这是正文内容。')).toBe(false);
    expect(
      isPrimarilyEnglish('Ceci est un livre en français avec plusieurs chapitres et des images.'),
    ).toBe(false);
    expect(
      isPrimarilyEnglish('Este es un libro escrito en español con muchas palabras y capítulos.'),
    ).toBe(false);
  });
  it('builds a readable EPUB in page order without touching the source', async () => {
    const blob = await pagesToEpub(['First page', '第二页'], 'Example', 'zh-CN');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new DataView(bytes.buffer).getUint16(8, true)).toBe(0);
    const files = unzipSync(bytes);
    expect(strFromU8(files['OEBPS/chapter1.xhtml']!)).toContain('First page');
    expect(strFromU8(files['OEBPS/chapter2.xhtml']!)).toContain('第二页');
    expect(strFromU8(files['content.opf']!)).toContain('<dc:language>zh-CN</dc:language>');
  });
  it('rejects scanned or empty content', async () => {
    await expect(pagesToEpub(['', '  '], 'Empty')).rejects.toThrow(/文字层|OCR/);
    await expect(pagesToEpub(['Readable page', ''], 'Mixed')).rejects.toThrow(/文字层|OCR/);
  });
});
