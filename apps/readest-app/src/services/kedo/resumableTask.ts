export type TaskStatus = 'paused' | 'running' | 'waiting_network' | 'failed' | 'completed';
export type TranslationTask = {
  version: 1;
  filename: string;
  source: Uint8Array;
  provider: string;
  segments: Record<number, string>;
  status: TaskStatus;
  output?: Uint8Array;
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

export async function runTask(store: TaskStore, translate: Translate, work: Work): Promise<Uint8Array> {
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
    task.output = out.slice();
    task.status = 'completed';
    await store.write(task);
    return out;
  } catch (error) {
    task.status = 'failed';
    await store.write(task);
    throw error;
  }
}
