/** Retry only transient provider errors; cancellation interrupts the backoff. */
export async function retryTranslation<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
  delay = 1200,
): Promise<T> {
  signal?.throwIfAborted();
  try {
    return await operation();
  } catch (error) {
    signal?.throwIfAborted();
    const message = error instanceof Error ? error.message : String(error);
    if (!/\b429\b|\b5\d\d\b|network|fetch|timeout/i.test(message)) throw error;
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal?.reason);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, delay);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
    signal?.throwIfAborted();
    return operation();
  }
}
