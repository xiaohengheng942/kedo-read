import { expect, it } from 'vitest';
import { translationError } from '@/services/kedo/translationError';
it('explains rate limits and authorization without exposing the original error', () => {
  expect(translationError(new Error('HTTP 429'))).toContain('限流');
  expect(translationError(new Error('HTTP 401 secret-value'))).toContain('密钥');
  expect(translationError(new Error('HTTP 401 secret-value'))).not.toContain('secret-value');
});

it('detects a long English response that was returned without translation', async () => {
  const { assertChineseTranslation } = await import('@/services/kedo/translationError');
  expect(() =>
    assertChineseTranslation(
      'This is a long English sentence with several words.',
      'This is a long English sentence with several words.',
    ),
  ).toThrow();
  expect(() => assertChineseTranslation('Hello world', 'Hello world')).toThrow();
  expect(() => assertChineseTranslation('Alice', 'Alice')).not.toThrow();
  expect(() =>
    assertChineseTranslation(
      'This is a long English sentence with several words.',
      '这是包含几个词的英文句子。',
    ),
  ).not.toThrow();
});

it('explains loss of connectivity instead of blaming configuration', () => {
  expect(translationError(new Error('error sending request for url'), false)).toContain('网络已断开');
});

it('classifies native transport failures as connectivity problems without exposing URLs', () => {
  const message = translationError(new Error('error sending request for url https://private.invalid'));
  expect(message).toContain('无法连接');
  expect(message).not.toContain('private.invalid');
});
