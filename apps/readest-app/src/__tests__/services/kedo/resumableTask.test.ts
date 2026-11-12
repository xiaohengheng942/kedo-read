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

it('retains a paused checkpoint when interrupted and never publishes an incomplete output', async () => {
 const store = memoryStore();
 await createTask(store, {filename:'sample.epub',source:new Uint8Array([1]),provider:'google'});
 const controller = new AbortController();
 const work = async (_s:Uint8Array, _t:(s:string)=>Promise<string>, _c:Record<number,string>, save:(i:number,s:string)=>Promise<void>) => {
  await save(0,'已译'); controller.abort(); controller.signal.throwIfAborted(); return new Uint8Array([1]);
 };
 await expect(runTask(store, async ()=>'已译', work, controller.signal)).rejects.toThrow();
 const task = await store.read();
 expect(task?.status).toBe('paused');
 expect(task?.segments[0]).toBe('已译');
 expect(task?.output).toBeUndefined();
});


it('saves a waiting-for-network state without producing a book', async () => {
 const store = memoryStore();
 await createTask(store, {filename:'offline.epub',source:new Uint8Array([1]),provider:'azure'});
 const previous = Object.getOwnPropertyDescriptor(navigator, 'onLine');
 Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
 try {
  await expect(runTask(store, async () => { throw new Error('network'); }, async (_s,t,_c,save) => { await save(0, '已保存'); await t('next'); return new Uint8Array([1]); })).rejects.toThrow();
  const task = await store.read();
  expect(task?.status).toBe('waiting_network');
  expect(task?.segments[0]).toBe('已保存');
  expect(task?.output).toBeUndefined();
 } finally {
  if (previous) Object.defineProperty(navigator, 'onLine', previous);
  else Reflect.deleteProperty(navigator, 'onLine');
 }
});
