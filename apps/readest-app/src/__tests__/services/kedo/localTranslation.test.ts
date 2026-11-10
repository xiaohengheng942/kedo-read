import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
vi.mock('@/services/ai/utils/httpFetch', () => ({ getAIFetch: () => globalThis.fetch }));
import { createOpenAICompatibleTranslator } from '@/services/translators/custom/openaiCompatible';
import { translateEpub } from '@/services/kedo/translateEpub';

describe('local OpenAI-compatible translation service', () => {
  it('translates an EPUB through HTTP into a new file', async () => {
    let requests = 0;
    const server = createServer((_req, res) => {
      requests++;
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
              message: { role: 'assistant', content: '这是中文译文。' },
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
      const service = createOpenAICompatibleTranslator({
        id: 'local',
        name: 'Local test',
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        apiKey: 'test-only',
        model: 'test',
        addedAt: 1,
        updatedAt: 1,
      });
      const original = zipSync({
        mimetype: strToU8('application/epub+zip'),
        'META-INF/container.xml': strToU8(
          '<container><rootfile full-path="book.opf"/></container>',
        ),
        'book.opf': strToU8(
          '<package><manifest><item href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest></package>',
        ),
        'chapter.xhtml': strToU8(
          '<html><body><p>Hello, this is a small test book.</p></body></html>',
        ),
      });
      const result = await translateEpub(
        original,
        async (text, signal) =>
          (await service.translate([text], 'en', 'zh-CN', null, false, signal))[0]!,
      );
      const content = strFromU8(unzipSync(result)['chapter.xhtml']!);
      expect(content).toContain('这是中文译文');
      expect(content).not.toContain('Hello');
      expect(requests).toBeGreaterThan(0);
    } finally {
      server.close();
    }
  }, 15000);
});
