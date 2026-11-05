// House voice helpers: deterministic variety (the same story always gets the same wording, different stories don't all
// read alike), possessive and number phrasing.
export function pick(key, variants) {
  let h = 0;
  for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return variants[h % variants.length];
}
export const possessive = name => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
export const word = n => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] || String(n);
export const STRAIGHT = n => `${word(n).toUpperCase()} STRAIGHT`;
