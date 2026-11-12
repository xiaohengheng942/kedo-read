import { expect, it } from 'vitest';
import { exportTaskBackup, importTaskBackup } from '@/services/kedo/taskBackup';

it('round trips a translation checkpoint and does not resume automatically', () => {
  const task = { version: 1 as const, filename: 'book.epub', source: new Uint8Array([1, 2]), provider: 'azure', segments: {0: '第一段'}, status: 'running' as const };
  const restored = importTaskBackup(exportTaskBackup(task));
  expect(restored.source).toEqual(task.source);
  expect(restored.segments).toEqual(task.segments);
  expect(restored.status).toBe('paused');
  expect(restored.output).toBeUndefined();
});

it('rejects a backup that falsely claims to be completed', () => {
  expect(() => importTaskBackup('{"format":"kedo-task-1","task":{"version":1,"filename":"a.epub","source":[1],"provider":"azure","segments":{},"status":"completed"}}')).toThrow();
});
