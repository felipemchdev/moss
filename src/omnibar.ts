function toUrl(candidate: string): string | null {
  try {
    return new URL(candidate).href;
  } catch {
    return null;
  }
}

export function resolveOmnibarInput(raw: string, searchUrl: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  const search = searchUrl + encodeURIComponent(input);

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input) || /^about:/i.test(input)) {
    return toUrl(input) ?? search;
  }

  const hasWhitespace = /\s/.test(input);
  const isLocalhost = /^localhost(:\d+)?(\/.*)?$/i.test(input);
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(input);
  const looksLikeDomain = /^[^\s/@]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(input);

  if (!hasWhitespace && (isLocalhost || isIpv4)) {
    return toUrl(`http://${input}`) ?? search;
  }
  if (!hasWhitespace && looksLikeDomain) {
    return toUrl(`https://${input}`) ?? search;
  }
  return search;
}
