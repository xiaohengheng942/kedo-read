/** Convert provider errors to safe, actionable messages without exposing request data or credentials. */
export function translationError(error: unknown, online = true): string {
  if (!online) return '网络已断开，翻译任务已暂停；联网后可以继续。';
  const detail = error instanceof Error ? error.message : String(error);
  if (/bing translate auth failed: could not parse|bing translate auth failed: translator page too large/i.test(detail)) return 'Bing 翻译页面无法解析，可能是服务页面变化或网络返回不完整；请稍后重试或切换服务。';
  if (/bing translate failed: malformed response/i.test(detail)) return 'Bing 返回了无效或不完整的响应，已重试；请稍后再试或切换服务。';
  if (/bing translate failed with status 205/i.test(detail)) return 'Bing 临时认证已失效，刷新后仍未成功；请稍后重试或切换服务。';
  const bingDenied = detail.match(/bing translate (?:auth )?failed with status (401|403)/i);
  if (bingDenied) return `Bing 拒绝了本次请求（状态 ${bingDenied[1]}）；请稍后重试或切换服务。`;
  if (/\b429\b|rate.?limit/i.test(detail)) return '翻译服务已限流，请稍后重试或切换服务。';
  if (/\b(401|403)\b|unauthori[sz]ed|authentication|api.?key/i.test(detail))
    return '翻译服务认证失败，请检查密钥和服务配置，或切换服务。';
  if (/\b456\b|quota/i.test(detail)) return '翻译服务额度不足，请检查服务账户或切换服务。';
  if (/\b5\d\d\b/.test(detail)) return '翻译服务暂时不可用，请稍后重试或切换服务。';
  const bingStatus = detail.match(/bing translate (?:auth )?failed with status (\d{3})/i);
  if (bingStatus) return `Bing 翻译服务返回状态 ${bingStatus[1]}，请求未完成；请稍后重试或切换服务。`;
  if (/fetch|network|timeout|连接|error sending request|connection (?:refused|reset|closed)|interrupted|body.*decod|dns|offline/i.test(detail)) return '无法连接翻译服务，请检查网络或切换服务。';
  return '翻译服务返回错误，请检查服务配置或切换服务。';
}

export function assertChineseTranslation(source: string, result: string): void {
  const words = source.match(/[A-Za-z]+/g) || [];
  if (words.length >= 2 && !/[\u3400-\u9fff]/.test(result)) {
    throw new Error('翻译结果未包含中文，请检查所选服务和目标语言。');
  }
}
