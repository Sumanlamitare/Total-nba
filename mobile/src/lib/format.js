export const day = d => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
export const longDay = d => new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
export const clock = d => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export function relDay(d, now = new Date()) {
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  const n = Math.round((a - b) / 864e5);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return `${new Date(d).toLocaleDateString(undefined, { weekday: 'short' })} ${new Date(d).getDate()}`;
  return day(d);
}
export function ago(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return day(d);
}
export const money = n => (n == null ? '' : `$${Number(n).toFixed(n % 1 ? 2 : 0)}`);
export const initials = name => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
// invite links look like https://…/join/CODE or turnout://join/CODE; a bare code works too
export const inviteCode = text => (String(text).match(/join\/([A-Za-z0-9]{4,20})/) || String(text).trim().match(/^([A-Za-z0-9]{4,20})$/) || [])[1] || null;

export const SPORTS = {
  basketball: ['Basketball', '🏀'], soccer: ['Soccer', '⚽'], volleyball: ['Volleyball', '🏐'], pickleball: ['Pickleball', '🏓'],
  tennis: ['Tennis', '🎾'], ultimate: ['Ultimate', '🥏'], football: ['Flag football', '🏈'], hockey: ['Hockey', '🏒'],
  softball: ['Softball', '🥎'], badminton: ['Badminton', '🏸'], running: ['Running', '🏃'], other: ['Other', '🏅'],
};
export const sportIcon = s => SPORTS[s]?.[1] || '🏅';
