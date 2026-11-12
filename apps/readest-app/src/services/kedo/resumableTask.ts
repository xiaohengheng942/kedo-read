export type TaskStatus = 'paused' | 'running' | 'waiting_network' | 'failed' | 'completed';
export type TranslationTask = {
  version: 1;
  filename: string;
  source: Uint8Array;
  provider: string;
  segments: Record<number, string>;
  status: TaskStatus;
  output?: Uint8Array;
  mode?: 'auto' | 'translate';
  pdfPages?: string[];
};
export interface TaskStore {
  read(): Promise<TranslationTask | null>;
  write(task: TranslationTask): Promise<void>;
  clear(): Promise<void>;
}
type Translate = (text: string) => Promise<string>;
type Work = (source: Uint8Array, translate: Translate, completed: Record<number, string>, save: (index: number, text: string) => Promise<void>) => Promise<Uint8Array>;

export async function createTask(store: TaskStore, input: Pick<TranslationTask, 'filename' | 'source' | 'provider'>): Promise<TranslationTask> {
  if (await store.read()) throw new Error('已有任务，请先处理或取消该任务。');
  const task: TranslationTask = { version: 1, ...input, source: input.source.slice(), segments: {}, status: 'paused' };
  await store.write(task);
  return task;
}

export async function runTask(store: TaskStore, translate: Translate, work: Work, signal?: AbortSignal): Promise<Uint8Array> {
  const task = await store.read();
  if (!task) throw new Error('找不到已保存的任务。');
  if (task.status === 'completed') throw new Error('任务已完成。');
  task.status = 'running';
  await store.write(task);
  try {
    const out = await work(task.source.slice(), translate, task.segments, async (index, text) => {
      if (!text.trim()) throw new Error('翻译结果为空。');
      task.segments[index] = text;
      await store.write(task);
    });
    signal?.throwIfAborted();
    task.output = out.slice();
    task.status = 'completed';
    await store.write(task);
    return out;
  } catch (error) {
    task.status = signal?.aborted ? 'paused' : (typeof navigator !== 'undefined' && !navigator.onLine ? 'waiting_network' : 'failed');
    await store.write(task);
    throw error;
  }
}

/** One independent IndexedDB record; transactions commit the checkpoint atomically. */
export function createIndexedTaskStore(): TaskStore {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('kedo-translation-tasks', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('tasks');
    request.onerror = () => reject(request.error ?? new Error('无法打开本机任务存储。'));
    request.onsuccess = () => resolve(request.result);
  });
  const operation = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction('tasks', mode);
      const request = action(tx.objectStore('tasks'));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => { db.close(); resolve(result!); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? request.error ?? new Error('本机任务保存失败。')); };
    });
  };
  return {
    read: async () => (await operation('readonly', store => store.get('current'))) ?? null,
    write: async task => { await operation('readwrite', store => store.put(task, 'current')); },
    clear: async () => { await operation('readwrite', store => store.delete('current')); },
  };
}
