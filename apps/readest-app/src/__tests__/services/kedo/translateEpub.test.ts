import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { translateEpub } from '@/services/kedo/translateEpub';

const fixture = () =>
  zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(
      '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    'OPS/book.opf': strToU8(
      '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:language>en</dc:language></metadata><manifest><item id="c" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine><itemref idref="c"/></spine></package>',
    ),
    'OPS/toc.ncx': strToU8(
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint><navLabel><text>Hello</text></navLabel></navPoint></navMap></ncx>',
    ),
    'OPS/chapter.xhtml': strToU8(
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Title</title></head><body><h1>Hello</h1><p>World <a href="#x">friend</a></p><pre>code()</pre><img src="cover.jpg"/></body></html>',
    ),
    'OPS/cover.jpg': new Uint8Array([1, 2, 3]),
  });

describe('translateEpub', () => {
  it('translates book text while preserving links, code, and images', async () => {
    const input = fixture();
    const output = await translateEpub(
      input,
      async (text) =>
        ({ Title: '标题', Hello: '你好', World: '世界', friend: '朋友' })[text] ?? text,
    );
    const files = unzipSync(output);
    const html = strFromU8(files['OPS/chapter.xhtml']!);
    expect(html).toContain('你好');
    expect(strFromU8(files['OPS/toc.ncx']!)).toContain('你好');
    expect(html).toContain('世界');
    expect(html).toContain('朋友');
    expect(html).not.toContain('Hello');
    expect(html).toContain('href="#x"');
    expect(html).toContain('code()');
    expect(files['OPS/cover.jpg']).toEqual(new Uint8Array([1, 2, 3]));
    expect(strFromU8(files['OPS/book.opf']!)).toContain('zh-CN');
    expect(unzipSync(input)['OPS/chapter.xhtml']).not.toEqual(files['OPS/chapter.xhtml']);
  });

  it('fails when a translation is missing or cancellation occurs', async () => {
    await expect(translateEpub(fixture(), async () => '')).rejects.toThrow(/translation/i);
    const controller = new AbortController();
    controller.abort();
    await expect(
      translateEpub(fixture(), async () => '译文', { signal: controller.signal }),
    ).rejects.toThrow();
  });
});

it('resumes completed segments and persists each newly translated segment', async () => {
  const input = fixture();
  const saved: Record<number, string> = { 0: '已保存' };
  const calls: string[] = [];
  const output = await translateEpub(input, async (text) => {
    calls.push(text);
    return '新译文';
  }, { completedSegments: saved, onSegment: async (index, result) => { saved[index] = result; } });
  expect(calls.length).toBeGreaterThan(0);
  expect(Object.keys(saved).length).toBeGreaterThan(1);
  expect(strFromU8(unzipSync(output)['OPS/chapter.xhtml']!)).toContain('新译文');
});
