async function call(path) {
  const r = await fetch('/api/' + path);
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error || r.status);
  return b;
}
export const getSlate = (sport, date) => call(`slate?sport=${sport}${date ? `&date=${date}` : ''}`);
export const getGame = (sport, id) => call(`game?sport=${sport}&id=${id}`);
