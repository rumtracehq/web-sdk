const DEFAULT_QUERY_KEYS = ['password', 'token', 'secret', 'api_key', 'authorization'];

export function redactUrl(rawUrl: string, extraKeys: string[] = []): string {
  const sensitive = new Set([...DEFAULT_QUERY_KEYS, ...extraKeys].map((key) => key.toLowerCase()));
  try {
    const url = new URL(rawUrl, typeof location !== 'undefined' ? location.href : 'https://example.invalid');
    url.searchParams.forEach((_value, key) => {
      if (sensitive.has(key.toLowerCase())) url.searchParams.set(key, '[REDACTED]');
    });
    return rawUrl.startsWith('http') ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return rawUrl;
  }
}

export function redactHeaders(headers: Record<string, string>, keys: string[] = []): Record<string, string> {
  const sensitive = new Set(keys.map((key) => key.toLowerCase()));
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !sensitive.has(key.toLowerCase())));
}

export function redactStackTrace(stack: string, extraKeys: string[] = []): string {
  return stack.replace(/https?:\/\/[^\s"'<>]+/g, (match) => {
    const trailing = match.match(/[)\].,;]+$/)?.[0] ?? '';
    const url = trailing ? match.slice(0, -trailing.length) : match;
    return `${redactUrl(url, extraKeys)}${trailing}`;
  });
}

export function redactInteractionText(element: Element | null, text: string): string {
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    if (type === 'password' || type === 'email' || type === 'tel' || type === 'credit-card') {
      return '[REDACTED]';
    }
  }
  return text.length > 100 ? text.slice(0, 100) : text;
}
