import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

type Options = {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  completedSegments?: Record<number, string>;
  onSegment?: (index: number, translation: string) => Promise<void>;
  partial?: { onCount: (done: number, total: number) => void };
};
type Translate = (text: string, signal?: AbortSignal) => Promise<string>;

function parseXml(bytes: Uint8Array, path: string): Document {
  const doc = new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`Invalid XML: ${path}`);
  return doc;
}

function resolvePath(base: string, href: string): string {
  const url = new URL(href, `https://epub.invalid/${base}`);
  if (url.origin !== 'https://epub.invalid')
    throw new Error('External EPUB content is unsupported');
  return decodeURIComponent(url.pathname.slice(1));
}

/** Returns a new EPUB; input bytes are never modified. The caller owns service configuration. */
export async function translateEpub(
  input: Uint8Array,
  translate: Translate,
  options: Options = {},
): Promise<Uint8Array> {
  const check = () => options.signal?.throwIfAborted();
  check();
  const files = unzipSync(input);
  const container = files['META-INF/container.xml'];
  if (!container) throw new Error('Invalid EPUB: container missing');
  const root = parseXml(container, 'container.xml').getElementsByTagNameNS('*', 'rootfile')[0];
  const opfPath = root?.getAttribute('full-path');
  if (!opfPath || !files[opfPath]) throw new Error('Invalid EPUB: package missing');
  const opf = parseXml(files[opfPath], opfPath);
  const contentPaths = Array.from(opf.getElementsByTagNameNS('*', 'item'))
    .filter((item) =>
      ['application/xhtml+xml', 'application/x-dtbncx+xml'].includes(
        item.getAttribute('media-type') || '',
      ),
    )
    .map((item) => resolvePath(opfPath, item.getAttribute('href') || ''));
  if (!contentPaths.length) throw new Error('EPUB contains no readable XHTML');
  const docs = contentPaths.map((path) => {
    if (!files[path]) throw new Error(`EPUB content missing: ${path}`);
    return { path, doc: parseXml(files[path], path) };
  });
  const nodes: Text[] = [];
  for (const { doc } of docs) {
    const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const parent = node.parentElement;
      if (node.data.trim() && parent && !parent.closest('script, style, code, pre, math, svg'))
        nodes.push(node);
    }
  }
  if (!nodes.length) throw new Error('EPUB contains no translatable text');
  const done = nodes.reduce((n, _node, index) => n + (options.completedSegments?.[index]?.trim() ? 1 : 0), 0);
  if (options.partial && !done) throw new Error('尚无已完成的译文可导出。');
  options.partial?.onCount(done, nodes.length);
  options.onProgress?.(0, nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    check();
    const node = nodes[i]!;
    const original = node.data;
    const cached = options.completedSegments?.[i];
    const result = cached ?? (options.partial ? '【此处内容尚未翻译】' : await translate(original.trim(), options.signal));
    check();
    if (!result?.trim()) throw new Error(`Empty translation response at segment ${i + 1}`);
    if (cached === undefined && !options.partial) await options.onSegment?.(i, result);
    node.data = original.match(/^\s*/)?.[0] + result.trim() + original.match(/\s*$/)?.[0];
    options.onProgress?.(i + 1, nodes.length);
  }
  for (const { path, doc } of docs)
    files[path] = strToU8(new XMLSerializer().serializeToString(doc));
  for (const language of Array.from(
    opf.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'language'),
  ))
    language.textContent = 'zh-CN';
  if (options.partial) {
    const percent = Math.min(99, Math.floor(done * 100 / nodes.length));
    const title = opf.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0];
    if (title) title.textContent = `中文译本（未完成 ${percent}%）`;
    else {
      const meta = opf.getElementsByTagNameNS('*', 'metadata')[0];
      if (!meta) throw new Error('EPUB 缺少书籍信息。');
      const element = opf.createElementNS('http://purl.org/dc/elements/1.1/', 'dc:title');
      element.textContent = `中文译本（未完成 ${percent}%）`;
      meta.appendChild(element);
    }
    for (const path of Object.keys(files)) {
      if (/\.(?:xhtml|html|htm|ncx)$/i.test(path) && !contentPaths.includes(path)) delete files[path];
    }
  }
  files[opfPath] = strToU8(new XMLSerializer().serializeToString(opf));
  const output: Zippable = {};
  if (files['mimetype']) output['mimetype'] = [files['mimetype'], { level: 0 }];
  for (const [path, bytes] of Object.entries(files)) if (path !== 'mimetype') output[path] = bytes;
  return zipSync(output);
}
