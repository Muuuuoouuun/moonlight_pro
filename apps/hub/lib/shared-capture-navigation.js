const SHARE_KEYS = ['title', 'text', 'url'];

// Keep the complete incoming tuple, including repeated and empty share fields.
export function snapshotSharedCaptureQuery(searchParams) {
  return Object.fromEntries(SHARE_KEYS.map(key => [key, searchParams.getAll(key)]));
}

// A confirmed save can consume only its own share. Always keep the current route,
// other query fields (including their encoding/order), and the current hash.
export function savedSharedCaptureTarget(href, expectedQuery) {
  if (!expectedQuery || !SHARE_KEYS.some(key => expectedQuery[key]?.length)) return null;
  const current = new URL(href, 'https://moonlight.invalid');
  if (SHARE_KEYS.some(key => {
    const actual = current.searchParams.getAll(key);
    const expected = expectedQuery[key] || [];
    return actual.length !== expected.length || actual.some((value, index) => value !== expected[index]);
  })) return null;
  const query = current.search.slice(1).split('&').filter(field => {
    const key = new URLSearchParams(field).keys().next().value;
    return !SHARE_KEYS.includes(key);
  }).join('&');
  return `${current.pathname}${query ? `?${query}` : ''}${current.hash}`;
}
