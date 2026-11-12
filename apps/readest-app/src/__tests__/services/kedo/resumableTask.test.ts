import { describe, expect, it } from 'vitest';
import { createTask, runTask, type TaskStore, type TranslationTask } from '@/services/kedo/resumableTask';

const memoryStore = (): TaskStore => {
 let task: TranslationTask | null = null;
 return { read: async () => task && structuredClone(task), write: async value => { task = structuredClone(value); }, clear: async () => { task = null; } };
};

describe('resumable translation task', () => {
 it('persists segments, resumes after a failure, and never repeats completed segments', async () => {
  const store = memoryStore();
  const source = new TextEncoder().encode('source');
  await createTask(store, { filename: 'sample.epub', source, provider: 'google' });
  const first = async (_source: Uint8Array, translate: (s:string)=>Promise<string>, completed: Record<number,string>, save: (n:number,s:string)=>Promise<void>) => {
   for (const [i, text] of ['one','two','three'].entries()) if (!completed[i]) await save(i, await translate(text));
   return new Uint8Array([1]);
  };
  const calls: string[] = [];
  await expect(runTask(store, async text => { calls.push(text); if(text === 'two') throw new Error('offline'); return `译${text}`; }, first)).rejects.toThrow();
  expect((await store.read())?.segments[0]).toBe('译one');
  expect((await store.read())?.status).toBe('failed');
  const out = await runTask(store, async text => { calls.push(text); return `译${text}`; }, first);
  expect(calls).toEqual(['one','two','two','three']);
  expect(out).toEqual(new Uint8Array([1]));
  expect((await store.read())?.status).toBe('completed');
  expect(Array.from((await store.read())!.output!)).toEqual([1]);
 });
});
