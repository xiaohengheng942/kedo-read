/** Convert provider errors to safe, actionable messages without exposing request data or credentials. */
export function translationError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (/\b429\b|rate.?limit/i.test(detail)) return '翻译服务已限流，请稍后重试或切换服务。';
  if (/\b(401|403)\b|unauthori[sz]ed|authentication|api.?key/i.test(detail))
    return '翻译服务认证失败，请检查密钥和服务配置，或切换服务。';
  if (/\b456\b|quota/i.test(detail)) return '翻译服务额度不足，请检查服务账户或切换服务。';
  if (/\b5\d\d\b/.test(detail)) return '翻译服务暂时不可用，请稍后重试或切换服务。';
  if (/fetch|network|timeout|连接/i.test(detail)) return '无法连接翻译服务，请检查网络或切换服务。';
  return '翻译服务返回错误，请检查服务配置或切换服务。';
}

export function assertChineseTranslation(source: string, result: string): void {
  const words = source.match(/[A-Za-z]+/g) || [];
  if (words.length >= 2 && !/[\u3400-\u9fff]/.test(result)) {
    throw new Error('翻译结果未包含中文，请检查所选服务和目标语言。');
  }
}
