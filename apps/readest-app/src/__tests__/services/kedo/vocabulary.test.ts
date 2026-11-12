import { expect, it } from 'vitest';
import { getVocabularyStatus, setVocabularyStatus } from '@/services/kedo/vocabulary';

it('retains a word status across lookups without changing other words', () => {
  const storage = new Map<string, string>();
  const access = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } };
  setVocabularyStatus('Example', 'learning', access);
  setVocabularyStatus('Another', 'mastered', access);
  expect(getVocabularyStatus(' example ', access)).toBe('learning');
  expect(getVocabularyStatus('another', access)).toBe('mastered');
  setVocabularyStatus('EXAMPLE', 'mastered', access);
  expect(getVocabularyStatus('example', access)).toBe('mastered');
});
