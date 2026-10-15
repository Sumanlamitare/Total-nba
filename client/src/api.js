// Thin fetch wrapper: JSON both ways, errors become exceptions with the server's message.
export async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch('/api/' + path, {
    method, credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Request failed (${r.status})`), { status: r.status });
  return data;
}
export const pingUrl = key => `${location.origin}/p/${key}`;
export const badgeUrl = badge => `${location.origin}/b/${badge}.svg`;
