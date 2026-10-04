// How far back does ESPN have NBA box scores? Samples one date per era, writes probe-out/espn.txt
import fs from 'node:fs';
import { fetchDay } from '../lib/espn.js';
const dates = ['2000-01-15', '1998-02-10', '1995-01-20', '1992-02-04', '1989-01-17', '1986-02-11', '1983-01-25', '1980-02-05',
  '1977-01-18', '1974-02-12', '1970-01-20', '1965-02-09', '1960-01-19', '1955-01-18', '1950-01-17', '1947-01-14'];
const out = [];
for (const d of dates) {
  try {
    const r = await fetchDay(d);
    const withBox = r.games.filter(g => g.rows?.length);
    const sample = withBox[0]?.rows?.slice(0, 2).map(x => `${x.name} ${x.pts}p ${x.reb}r ${x.ast}a ${x.stl}s ${x.blk}b ${x.tpm}3 ${x.tov}to min${x.min}`).join(' | ');
    out.push(`${d}: ${r.total} games, ${withBox.length} with box scores, ${withBox.reduce((a, g) => a + g.rows.length, 0)} lines ${sample ? '— ' + sample : ''}`);
  } catch (e) { out.push(`${d}: ERROR ${e.message}`); }
}
fs.mkdirSync('probe-out', { recursive: true });
fs.writeFileSync('probe-out/espn.txt', out.join('\n'));
console.log(out.join('\n'));
