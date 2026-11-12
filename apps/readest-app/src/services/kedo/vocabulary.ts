export type VocabularyStatus = 'learning' | 'mastered';
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
const key = 'kedo-vocabulary-status-v1';
const normalize = (word: string) => word.trim().toLocaleLowerCase();

function load(storage: StorageAccess): Record<string, VocabularyStatus> {
  const value: unknown = JSON.parse(storage.getItem(key) || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无法读取本机词汇状态。');
  return value as Record<string, VocabularyStatus>;
}
export function getVocabularyStatus(word: string, storage: StorageAccess = localStorage): VocabularyStatus | null {
  const value = load(storage)[normalize(word)];
  return value === 'learning' || value === 'mastered' ? value : null;
}
export function setVocabularyStatus(word: string, status: VocabularyStatus, storage: StorageAccess = localStorage): void {
  const normalized = normalize(word);
  if (!normalized) throw new Error('词语为空。');
  const words = load(storage);
  words[normalized] = status;
  storage.setItem(key, JSON.stringify(words));
}
