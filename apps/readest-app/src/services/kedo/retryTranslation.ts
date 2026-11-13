/** Retry transient failures at most twice; cancellation interrupts the wait. */
export async function retryTranslation<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
  delay = 1200,
  onRetry?: (attempt: number, delayMs: number) => void,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try { return await operation(); }
    catch (error) {
      signal?.throwIfAborted();
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= 2 || !/\b429\b|\b5\d\d\b|network|fetch|timeout|connection (?:closed|reset|refused)|interrupted|error sending request|malformed response/i.test(message)) throw error;
      const wait = delay * (attempt + 1);
      onRetry?.(attempt + 1, wait);
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => { clearTimeout(timer); reject(signal?.reason); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, wait);
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
      });
    }
  }
}
