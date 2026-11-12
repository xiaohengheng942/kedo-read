import { expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { createPartialEpub } from '@/services/kedo/partialEpub';
import type { TranslationTask } from '@/services/kedo/resumableTask';

const epub = () => zipSync({
 mimetype: strToU8('application/epub+zip'),
 'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'),
 'book.opf': strToU8('<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Original Title</dc:title><dc:language>en</dc:language></metadata><manifest><item href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest></package>'),
 'chapter.xhtml': strToU8('<html><body><h1>Heading</h1><p>First paragraph</p><p>Second paragraph</p><img src="cover.jpg"/></body></html>'),
 'cover.jpg': new Uint8Array([1, 2]),
});
it('exports only saved EPUB segments and marks missing content without altering the task', async () => {
 const task: TranslationTask = {version:1, filename:'book.epub', source:epub(), provider:'test', status:'paused', segments:{0:'章节', 2:'第二段'}};
 const before = structuredClone(task);
 const result = await createPartialEpub(task);
 const files = unzipSync(result.bytes);
 const content = strFromU8(files['chapter.xhtml']!);
 expect(result.percent).toBe(66);
 expect(content).toContain('章节'); expect(content).toContain('第二段');
 expect(content).toContain('尚未翻译'); expect(content).not.toContain('First paragraph');
 expect(files['cover.jpg']).toEqual(new Uint8Array([1,2]));
 expect(strFromU8(files['book.opf']!)).toContain('未完成');
 expect(task.segments).toEqual(before.segments); expect(task.status).toBe(before.status); expect(Array.from(task.source)).toEqual(Array.from(before.source));
});
it('exports PDF checkpoints with gaps and no English source', async () => {
 const task: TranslationTask = {version:1, filename:'book.pdf', source:new Uint8Array([1]), provider:'test', status:'paused', pdfComplete:true, pdfPages:['First page','Second page','Third page'], segments:{0:'第一页译文',2:'第三页译文'}};
 const result = await createPartialEpub(task);
 expect(result.percent).toBe(66);
 const files = unzipSync(result.bytes);
 const html = Object.keys(files).filter(n=>n.endsWith('.xhtml')).map(n=>strFromU8(files[n]!)).join(' ');
 expect(html).toContain('第一页译文'); expect(html).toContain('第三页译文');
 expect(html).toContain('尚未翻译'); expect(html).not.toContain('Second page');
 expect(strFromU8(files['content.opf']!)).toContain('未完成');
});
it('refuses to export without any finished translated content', async () => {
 await expect(createPartialEpub({version:1,filename:'book.epub',source:epub(),provider:'test',status:'paused',segments:{}})).rejects.toThrow(/译文/);
});
