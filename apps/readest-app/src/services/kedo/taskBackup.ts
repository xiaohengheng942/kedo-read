import type { TranslationTask } from './resumableTask';

export function exportTaskBackup(task: TranslationTask): string {
  return JSON.stringify({ format: 'kedo-task-1', task: { ...task, source: Array.from(task['source']), output: task['output'] && Array.from(task['output']) } });
}
export function importTaskBackup(content: string): TranslationTask {
  const backup: unknown = JSON.parse(content);
  if (!backup || typeof backup !== 'object' || !('format' in backup) || backup.format !== 'kedo-task-1' || !('task' in backup) || !backup.task || typeof backup.task !== 'object') throw new Error('不是有效的 Kedo 任务备份。');
  const task = backup.task as Record<string, unknown>;
  const bytes = (value: unknown): value is number[] => Array.isArray(value) && value.every(n => Number.isInteger(n) && n >= 0 && n <= 255);
  if (task['version'] !== 1 || typeof task['filename'] !== 'string' || !/\.(pdf|epub)$/i.test(task['filename']) || typeof task['provider'] !== 'string' || !bytes(task['source']) || !task['segments'] || typeof task['segments'] !== 'object' || Array.isArray(task['segments']) || !Object.entries(task['segments']).every(([k,v]) => /^\d+$/.test(k) && typeof v === 'string' && v.trim()) || (task['output'] !== undefined && !bytes(task['output'])) || (task['status'] === 'completed' && (!bytes(task['output']) || !task['output'].length)) || (task['pdfPages'] !== undefined && (!Array.isArray(task['pdfPages']) || !task['pdfPages'].every(p => typeof p === 'string' || p === null)))) throw new Error('任务备份内容不完整或已损坏。');
  const completed = task['status'] === 'completed';
  return { version: 1, filename: task['filename'], provider: task['provider'], source: new Uint8Array(task['source']), segments: task['segments'] as Record<number, string>, status: completed ? 'completed' : 'paused', ...(bytes(task['output']) && completed ? { output: new Uint8Array(task['output']) } : {}), ...((task['mode'] === 'auto' || task['mode'] === 'translate') ? { mode: task['mode'] } : {}), ...(Array.isArray(task['pdfPages']) ? { pdfPages: task['pdfPages'] as string[], pdfComplete: task['pdfComplete'] === true } : {}) };
}
