// Outbound alert targets are user-supplied URLs, so only public https endpoints are allowed.
import net from 'node:net';

const privateV4 = ip => {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
};

export function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return 'Enter a full URL starting with https://'; }
  if (u.protocol !== 'https:') return 'The URL must start with https://';
  const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return 'That address is not reachable from the internet';
  if (net.isIPv4(h) && privateV4(h)) return 'That address is not reachable from the internet';
  if (net.isIPv6(h)) return 'Use a hostname, not an IPv6 address';
  return null;
}
