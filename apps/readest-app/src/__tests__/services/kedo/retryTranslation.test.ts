import { expect, it, vi } from 'vitest';
import { retryTranslation } from '@/services/kedo/retryTranslation';
it('retries a transient failure but not an authentication failure', async () => {
  const transient = vi
    .fn()
    .mockRejectedValueOnce(new Error('HTTP 429'))
    .mockResolvedValueOnce('中文');
  expect(await retryTranslation(transient, undefined, 0)).toBe('中文');
  expect(transient).toHaveBeenCalledTimes(2);
  const auth = vi.fn().mockRejectedValue(new Error('HTTP 401'));
  await expect(retryTranslation(auth, undefined, 0)).rejects.toThrow('401');
  expect(auth).toHaveBeenCalledTimes(1);
});
it('does not retry after cancellation', async () => {
  const controller = new AbortController();
  const call = vi.fn().mockImplementation(() => {
    controller.abort();
    throw new Error('HTTP 429');
  });
  await expect(retryTranslation(call, controller.signal, 0)).rejects.toThrow();
  expect(call).toHaveBeenCalledTimes(1);
});
