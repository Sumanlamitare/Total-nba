// The book's content as a flow of blocks. The reader measures the blocks and packs them into fixed-size pages,
// so every block must be shorter than a page (long lists are split into one block per item; the statistics
// table scrolls inside its block). Chapter state (chosen tabs and filters) lives in `ui`, outside the pages,
// because a page is rendered more than once while it turns.
import React, { useState } from 'react';
import { span as spanOf, seasonLabel, shelvedBecause } from './shelves.js';
import { n0, n1, pct, longDate, shortDate, ageOn, list, plural } from './format.js';
import { perSeason, byTeam, best, LEADER_PHRASE, coverageGap, teamsInSeason, trueShooting, ageInSeason, prime, clubs, milestones, playoffShift } from './bookdata.js';
import { SeasonColumns, Accumulation } from './charts.jsx';
import CountUp from './CountUp.jsx';

export const CHAPTERS = ['Title page', 'Contents', 'By the numbers', 'The player', 'Career', 'Prime', 'Records', 'Playoffs', 'Honors', 'Teams', 'Statistical record', 'Legacy'];
export const ROMAN = ['', '', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const UI_DEFAULTS = { careerKind: 'regular', careerMetric: 0, careerAxis: 'season', statKind: 'regular', statView: 'avg', statTeam: 'all' };

const Note = ({ children }) => <p className="note">{children}</p>;
const ChapterHead = ({ ch, title, sub }) => (
  <header className="ch-head">
    <p className="ch-num">Chapter {ROMAN[ch]}</p>
    <h2>{title}</h2>
    {sub && <p className="ch-sub">{sub}</p>}
  </header>
);

function recordSpan(book) {
  const r = book.regular;
  if (!r) return null;
  return r.first === r.last ? seasonLabel(r.first) : `${seasonLabel(r.first)} to ${seasonLabel(r.last)}`;
}

function Segmented({ label, value, set, options }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => set(v)}>{l}</button>
      ))}
    </div>
  );
}

// blocks: [{ key, ch, el, start?: true (chapter opens a new page), whole?: true (fills a page by itself) }]
export function buildBlocks(book, ctx) {
  const out = [];
  const add = (ch, key, el, opts = {}) => out.push({ key: `${ch}-${key}`, ch, el, ...opts });
  titlePage(book, ctx, add);
  contents(book, ctx, add);
  byTheNumbers(book, ctx, add);
  thePlayer(book, ctx, add);
  career(book, ctx, add);
  primeChapter(book, ctx, add);
  records(book, ctx, add);
  playoffsChapter(book, ctx, add);
  honors(book, ctx, add);
  teams(book, ctx, add);
  statRecord(book, ctx, add);
  legacy(book, ctx, add);
  return out;
}

// ---- Title page ------------------------------------------------------------------------------------------------

function Portrait({ book }) {
  const [img, setImg] = useState(book.headshot ? 'loading' : 'none');
  const initials = book.name.split(/\s+/).map(s => s[0]).slice(0, 2).join('');
  return (
    <>
      <div className={`portrait${img === 'ok' ? ' has' : ''}`}>
        {book.headshot && img !== 'none' && <img src={book.headshot} alt={`${book.name}`} onLoad={() => setImg('ok')} onError={() => setImg('none')} />}
        {img !== 'ok' && <span className="monogram" aria-hidden>{initials}</span>}
      </div>
      {img === 'none' && <p className="note small portrait-note">{book.headshot ? 'The portrait could not be loaded.' : `No portrait on record for ${book.last || book.name}.`}</p>}
    </>
  );
}

function titlePage(book, { player, shelf }, add) {
  const start = book.debut || (book.regular ? book.regular.first - 1 : null);
  const years = book.regular && start ? `${start}–${book.active ? 'now' : book.regular.last}` : start ? `from ${start}` : spanOf(player || {});
  add(0, 'title', (
    <div className="title-page">
      <p className="imprint">Player Library</p>
      <Portrait book={book} />
      <h2 className="display">{book.name}</h2>
      <p className="lede">{[book.posName, years].filter(Boolean).join(' · ')}</p>
      <dl className="card-strip">
        {[['Height', book.height], ['Weight', book.weight], ['Jersey', book.jersey ? `#${book.jersey}` : null], ['Drafted', draftShort(book.draft)]].filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <hr className="rule" />
      <p className="ex-libris">
        {book.regular ? <>A record of {plural(book.regular.seasons, 'season')} on record{book.playoffs ? `, ${plural(book.playoffs.seasons, 'playoff run')}` : ''}.</> : <>No season statistics are on record for this player; the book holds what there is.</>}
        {shelf && <><br />Shelved {shelvedBecause(player, shelf.team)}.</>}
      </p>
      <p className="turn-hint">Turn the page — drag its corner, swipe, or press →</p>
    </div>
  ), { start: true, whole: true });
}

// "2003: Round 1, Pick 1, Cleveland Cavaliers" -> "2003 · No. 1"
function draftShort(d) {
  const m = String(d || '').match(/(\d{4}).*?Pick (\d+)/i);
  return m ? `${m[1]} · No. ${m[2]}` : d ? String(d).split(':')[0] : null;
}

// ---- I. By the numbers ------------------------------------------------------------------------------------------

function byTheNumbers(book, { highs }, add) {
  const ch = 2;
  const reg = book.regular, c = reg?.career || {};
  const surname = book.last || book.name;
  const one = v => (v == null ? '—' : v.toFixed(1));
  const int = v => Math.round(v).toLocaleString('en-US');
  const honors = book.honors.reduce((a, h) => a + h.count, 0);
  const mvp = book.honors.find(h => h.key === 'mvp');
  const ts = trueShooting(c.tot);
  const tiles = reg ? [
    ['ppg', 'Points a game', c.avg?.avgPoints, one], ['rpg', 'Rebounds a game', c.avg?.avgRebounds, one], ['apg', 'Assists a game', c.avg?.avgAssists, one],
    ['gp', 'Games', c.avg?.gamesPlayed, int], ['seasons', 'Seasons', reg.seasons, int], ['ts', 'True shooting %', ts, one],
    ...(c.tot?.points != null ? [['pts', 'Career points', c.tot.points, int]] : []),
    ...(highs.state === 'ok' && highs.h.covered.length ? [['g30', '30-point games', highs.h.thirty?.regular ?? null, int]] : []),
    ...(mvp ? [['mvp', mvp.count > 1 ? 'MVP awards' : 'MVP award', mvp.count, int]] : honors ? [['hon', 'NBA honors', honors, int]] : []),
  ].filter(([, , v]) => v != null) : [];
  const b = best(reg, 'avgPoints');
  add(ch, 'head', (
    <>
      <ChapterHead ch={ch} title="By the numbers" sub={reg ? `${surname}'s career at a glance${reg.careerBeyondRows ? '' : `, ${recordSpan(book)}`}` : undefined} />
      {reg ? (
        <div className="tiles">
          {tiles.slice(0, 9).map(([k, label, v, f], i) => (
            <div key={k} className={`tile${i < 3 ? ' big' : ''}`}>
              <span className="tile-v"><CountUp id={`${book.id}-${k}`} value={v} format={f} /></span>
              <span className="tile-l">{label}</span>
            </div>
          ))}
        </div>
      ) : <p>There are no season statistics on record for {book.name}; the chapters that follow hold the biography and honors.</p>}
    </>
  ), { start: true });
  if (b) add(ch, 'peak', <p className="kicker">Best scoring season: <strong>{n1(b.value)} points a game</strong> in {b.label}{b.team ? ` with ${b.team}` : ''}{book.born ? `, at ${ageInSeason(book.born, b.season)}` : ''}.</p>);
  if (ts != null) add(ch, 'ts-n', <Note>True shooting counts every point against every shot: points ÷ (2 × (field-goal attempts + 0.44 × free-throw attempts)). It counts threes and free throws, which field-goal percentage leaves out.</Note>);
}

// ---- Contents --------------------------------------------------------------------------------------------------

function contents(book, { chapterPages, goPage }, add) {
  add(1, 'toc', (
    <nav className="toc" aria-label="Contents">
      <h2 className="contents-title">Contents</h2>
      <ol>
        {CHAPTERS.map((c, k) => k < 2 ? null : (
          <li key={c}>
            <button onClick={() => chapterPages?.[k] != null && goPage(chapterPages[k])}>
              <span className="num">{ROMAN[k]}</span><span className="ttl">{c}</span><span className="lead" aria-hidden /><span className="folio">{chapterPages?.[k] != null ? chapterPages[k] + 1 : ''}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  ), { start: true });
}

// ---- II. The player ---------------------------------------------------------------------------------------------

function thePlayer(book, ctx, add) {
  const ch = 3;
  const reg = book.regular;
  const names = byTeam(reg).map(t => t.name || t.team);
  const gap = coverageGap(book);
  const surname = book.last || book.name;
  const verb = book.active ? 'has played' : 'played';
  const intro = [];
  if (reg) {
    intro.push(`${book.name}${book.posName ? `, a ${book.posName.toLowerCase()},` : ''} ${verb} ${plural(reg.seasons, 'regular season')} on record, ${reg.first === reg.last ? `in ${seasonLabel(reg.first)}` : `from ${seasonLabel(reg.first)} to ${seasonLabel(reg.last)}`}${names.length ? `, for ${list(names)}` : ''}.`);
    const c = reg.career.avg || {};
    const parts = [['avgPoints', 'points'], ['avgRebounds', 'rebounds'], ['avgAssists', 'assists']].filter(([k]) => c[k] != null).map(([k, w]) => `${n1(c[k])} ${w}`);
    if (parts.length && c.gamesPlayed) intro.push(reg.careerBeyondRows
      ? `The career line for ${surname}, which reaches back before the season-by-season record, reads ${list(parts)} a game over ${n0(c.gamesPlayed)} games.`
      : `Across those seasons ${surname} averaged ${list(parts)} a game in ${n0(c.gamesPlayed)} games.`);
    const missing = [['avgRebounds', 'rebounds'], ['avgSteals', 'steals'], ['avgBlocks', 'blocks']].filter(([k]) => c[k] == null).map(([, w]) => w);
    if (missing.length) intro.push(`The record has no complete ${list(missing)} figures for this career${reg.first < 1974 ? ' (the league only began counting steals and blocks in 1973-74)' : ''}, so they are left blank rather than guessed.`);
  } else {
    intro.push(`No season-by-season statistics are on record for ${book.name}. This book carries ${book.honors.length ? 'the biography and honors' : 'the biography'}.`);
  }
  const mvp = book.honors.find(h => h.key === 'mvp');
  if (mvp) intro.push(`${surname} was named the league's Most Valuable Player ${plural(mvp.count, 'time')}.`);
  const age = book.born && book.active ? ageOn(book.born) : null;
  const facts = [
    ['Born', book.born ? `${longDate(book.born)}${age != null ? ` (age ${age})` : ''}` : null],
    ['Birthplace', book.birthplace], ['Position', book.posName], ['Height', book.height], ['Weight', book.weight],
    ['College', book.college], ['Draft', book.draft], ['First season', book.debut ? seasonLabel(book.debut + 1) : null],
    ['Status', book.active ? `Active${book.team ? ` — ${book.team.name}` : ''}` : book.status === 'Active' ? 'Active' : 'Retired'],
    ['Jersey', book.jersey ? `#${book.jersey}` : null],
  ];
  add(ch, 'head', <><ChapterHead ch={ch} title="The player" /><p className="opening">{intro[0]}</p></>, { start: true });
  intro.slice(1).forEach((t, k) => add(ch, `p${k}`, <p>{t}</p>));
  if (gap) add(ch, 'gap', <Note>The season-by-season record for {surname} begins in {gap.recordLabel}, though the career began in {gap.label}. Those first {plural(gap.missing, 'season')} are missing from every table and total in this book.</Note>);
  add(ch, 'facts', (
    <dl className="facts">
      {facts.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd className={v ? '' : 'missing'}>{v || 'Not on record'}</dd></React.Fragment>)}
    </dl>
  ));
}

// ---- III. Career ------------------------------------------------------------------------------------------------

const METRICS = [['avgPoints', 'Points', n1], ['avgRebounds', 'Rebounds', n1], ['avgAssists', 'Assists', n1], ['avgMinutes', 'Minutes', n1], ['gamesPlayed', 'Games', n0]];

function career(book, { ui, setUi }, add) {
  const ch = 4;
  if (!book.regular) {
    add(ch, 'head', <><ChapterHead ch={ch} title="Career" /><p>There are no season statistics on record for {book.name}, so there is no career to chart. The honors chapter lists what is on record.</p></>, { start: true });
    return;
  }
  const kind = book[ui.careerKind] ? ui.careerKind : 'regular';
  const stats = book[kind];
  const [key, label, fmt] = METRICS[ui.careerMetric];
  const byAge = ui.careerAxis === 'age' && book.born;
  const data = perSeason(stats).map(r => {
    const age = ageInSeason(book.born, r.season);
    return { key: r.season, label: byAge && age != null ? `Age ${age} · ${r.label}` : r.label, short: byAge && age != null ? String(age) : `’${String(r.season % 100).padStart(2, '0')}`, value: r.avg?.[key] ?? null, note: `${r.combined ? teamsInSeason(stats, r.season).join(' / ') : r.team || ''}${r.avg?.gamesPlayed != null ? ` · ${r.avg.gamesPlayed} games` : ''}` };
  });
  add(ch, 'head', (
    <>
      <ChapterHead ch={ch} title="Career" sub={`Seasons on record: ${recordSpan(book)}`} />
      <div className="controls" role="group" aria-label="Chart options">
        <Segmented label="Season type" value={kind} set={v => setUi({ careerKind: v })} options={[['regular', 'Regular season'], ...(book.playoffs ? [['playoffs', 'Playoffs']] : [])]} />
        <Segmented label="Measure" value={ui.careerMetric} set={v => setUi({ careerMetric: v })} options={METRICS.map(([, l], k) => [k, l])} />
        {book.born && <Segmented label="Along" value={byAge ? 'age' : 'season'} set={v => setUi({ careerAxis: v })} options={[['season', 'By season'], ['age', 'By age']]} />}
      </div>
      {data.every(d => d.value == null) ? <p>No {label.toLowerCase()} figures are on record for {book.last || book.name}'s seasons.</p> : (
        <SeasonColumns data={data} format={fmt} caption={`${label} ${key === 'gamesPlayed' ? 'played' : 'per game'}, by ${kind === 'playoffs' ? 'playoff run' : 'season'}${byAge ? ', labelled with his age that season' : ''}. The highest is marked in red.`} />
      )}
    </>
  ), { start: true });
  const stints = byTeam(book.regular);
  add(ch, 'stints-h', <h3>The stints</h3>);
  stints.forEach(t => add(ch, `st-${t.team}`, (
    <div className="stint">
      <span className="stint-years">{t.first === t.last ? seasonLabel(t.first) : `${seasonLabel(t.first)} – ${seasonLabel(t.last)}`}</span>
      <span className="stint-team">{t.name || t.team}</span>
      <span className="stint-n">{plural(t.games, 'game')} · {n0(t.points)} pts</span>
    </div>
  )));
  if (book.regular.rows.some(r => r.combined)) add(ch, 'trade', <Note>Seasons split by a trade count toward each team the player appeared for.</Note>);
}

// ---- IV. Prime ------------------------------------------------------------------------------------------------

function primeChapter(book, ctx, add) {
  const ch = 5;
  const reg = book.regular;
  const surname = book.last || book.name;
  if (!reg) { add(ch, 'head', <><ChapterHead ch={ch} title="Prime" /><p>There are no season statistics on record for {book.name}, so there is no prime to measure.</p></>, { start: true }); return; }
  const top = best(reg, 'avgPoints');
  const row = top && perSeason(reg).find(r => r.season === top.season);
  const won = top ? book.honors.filter(h => h.seasons.includes(top.season)).map(h => h.name) : [];
  const led = top ? (book.leaders || []).filter(l => l.season === top.season).map(l => LEADER_PHRASE[l.stat]) : [];
  const age = top && book.born ? ageInSeason(book.born, top.season) : null;
  add(ch, 'head', (
    <>
      <ChapterHead ch={ch} title="Prime" sub="The best season and the best stretch" />
      {row && (
        <div className="season-card">
          <p className="sc-kicker">Signature season</p>
          <p className="sc-year">{row.label}</p>
          <p className="sc-meta">{[top.team, age != null ? `age ${age}` : null, `${row.avg.gamesPlayed} games`].filter(Boolean).join(' · ')}</p>
          <div className="sc-line">
            {[['PTS', row.avg.avgPoints], ['REB', row.avg.avgRebounds], ['AST', row.avg.avgAssists], ['TS%', trueShooting(row.tot)]].filter(([, v]) => v != null).map(([k, v]) => (
              <span key={k}><strong><CountUp id={`${book.id}-sc-${k}`} value={v} format={x => x.toFixed(1)} /></strong><em>{k}</em></span>
            ))}
          </div>
          {(won.length > 0 || led.length > 0) && <p className="sc-honors">{[...won, ...(led.length ? [`led the league in ${list(led)}`] : [])].join(' · ')}</p>}
        </div>
      )}
      {row && <Note>His highest-scoring regular season of 20 or more games.</Note>}
    </>
  ), { start: true });
  const p = prime(reg);
  if (p) {
    const c = reg.career, cts = trueShooting(c.tot);
    const lines = [['Points', p.ppg, c.avg?.avgPoints], ['Rebounds', p.rpg, c.avg?.avgRebounds], ['Assists', p.apg, c.avg?.avgAssists], ['True shooting %', p.ts, cts]].filter(([, a]) => a != null);
    add(ch, 'prime', (
      <section>
        <h3>Best five-season stretch</h3>
        <p>{p.from.label} to {p.to.label}{book.born ? `, from age ${ageInSeason(book.born, p.from.season)} to ${ageInSeason(book.born, p.to.season)}` : ''}: {n0(p.gp)} games.</p>
        <table className="mini compare">
          <caption className="sr-only">Five-season stretch against the whole career, per game</caption>
          <thead><tr><th scope="col">Per game</th><th scope="col">Those five</th><th scope="col">Career</th></tr></thead>
          <tbody>{lines.map(([l, a, b]) => <tr key={l}><th scope="row">{l}</th><td className="num">{n1(a)}</td><td>{n1(b)}</td></tr>)}</tbody>
        </table>
        <Note>The five consecutive seasons with the most points per game.</Note>
      </section>
    ));
  }
  const cl = clubs(reg);
  if (cl.length) {
    add(ch, 'clubs-h', <h3>Season clubs</h3>);
    cl.forEach(c => add(ch, `club-${c.key}`, (
      <div className="club">
        <span className="club-n">{c.seasons.length}</span>
        <div><strong>{c.label}</strong>{c.note && <span className="club-note"> · {c.note}</span>}<p className="seasons">{c.seasons.map(seasonLabel).join(' · ')}</p></div>
      </div>
    )));
    if (cl.some(c => c.key === 's504090')) add(ch, 'club-n', <Note>50-40-90 counts only seasons that also reach the league's minimums: 300 field goals, 82 three-pointers and 125 free throws made.</Note>);
  } else add(ch, 'clubs-none', <p>{surname} had no 25-point, 20-and-10, 20-5-5, 10-and-10 or 50-40-90 season on record (seasons of 20 or more games).</p>);
}

// ---- VI. Playoffs ---------------------------------------------------------------------------------------------

function playoffsChapter(book, ctx, add) {
  const ch = 7;
  const surname = book.last || book.name;
  const shift = playoffShift(book);
  if (!book.playoffs) { add(ch, 'head', <><ChapterHead ch={ch} title="Playoffs" /><p>{surname} has no playoff games on record.</p></>, { start: true }); return; }
  const post = book.playoffs;
  const runs = perSeason(post);
  const deepest = runs.reduce((a, r) => ((r.avg?.gamesPlayed || 0) > (a?.avg?.gamesPlayed || 0) ? r : a), null);
  const top = best(post, 'avgPoints', 5);
  const fmv = book.honors.find(h => h.key === 'fmvp');
  add(ch, 'head', (
    <>
      <ChapterHead ch={ch} title="Playoffs" sub={`${plural(post.seasons, 'postseason')}, ${plural(post.career.avg?.gamesPlayed || 0, 'game')}`} />
      {shift ? (
        <figure className="shift">
          <figcaption>Playoffs against the regular season, career per game</figcaption>
          {shift.rows.map(r => {
            const rel = r.reg ? r.diff / r.reg : 0, w = Math.min(50, Math.abs(rel) * 160);
            return (
              <div key={r.label} className="shift-row">
                <span className="shift-l">{r.label}</span>
                <span className="shift-bar" aria-hidden><i className={r.diff >= 0 ? 'up' : 'down'} style={{ width: `${w}%` }} /></span>
                <span className="shift-v">{n1(r.reg)} → <strong>{n1(r.post)}</strong> <em className={r.diff >= 0 ? 'up' : 'down'}>{r.diff >= 0 ? '+' : '−'}{n1(Math.abs(r.diff))}</em></span>
              </div>
            );
          })}
        </figure>
      ) : <p>Fewer than 10 playoff games are on record, too few to set against the regular season.</p>}
    </>
  ), { start: true });
  const facts = [];
  if (top) facts.push(<>Highest-scoring run: <strong>{n1(top.value)} points a game</strong> in {top.label} ({top.games} games).</>);
  if (deepest && runs.length > 1) facts.push(<>Longest run: <strong>{deepest.avg.gamesPlayed} games</strong> in {deepest.label}.</>);
  if (fmv) facts.push(<>Finals MVP: <strong>{fmv.seasons.map(seasonLabel).join(', ')}</strong>.</>);
  facts.forEach((f, k) => add(ch, `pf${k}`, <p className="kicker">{f}</p>));
  if (shift) add(ch, 'shift-n', <Note>Bars show the change as a share of his regular-season figure. Playoff games come against the best teams, so most players' numbers move.</Note>);
}

// ---- V. Records ----------------------------------------------------------------------------------------------

function records(book, { highs }, add) {
  const ch = 6;
  const surname = book.last || book.name;
  add(ch, 'head', <><ChapterHead ch={ch} title="Records" />{!book.regular && <p>There are no season or game statistics on record for {book.name}, so there are no records to show.</p>}</>, { start: true });
  if (!book.regular) return;
  const led = book.leaders || [];
  if (led.length) {
    add(ch, 'led-h', <h3>Led the league</h3>);
    led.forEach(l => add(ch, `led-${l.season}-${l.stat}`, <div className="ledger-row"><span>{l.label}</span><span>{LEADER_PHRASE[l.stat]} per game</span><strong>{n1(l.value)}</strong></div>));
    if (book.leadersFrom && book.regular.first < book.leadersFrom) add(ch, 'led-n', <Note>Qualified league leaders are on record from {seasonLabel(book.leadersFrom)}; earlier seasons could not be checked.</Note>);
  } else {
    add(ch, 'led-none', <p>{surname} never finished a season as the qualified league leader in points, rebounds, assists, steals or blocks per game{book.leadersFrom ? ` (seasons from ${seasonLabel(book.leadersFrom)} checked)` : ''}.</p>);
  }
  const bests = [['avgPoints', 'Points'], ['avgRebounds', 'Rebounds'], ['avgAssists', 'Assists'], ['avgSteals', 'Steals'], ['avgBlocks', 'Blocks'], ['avgMinutes', 'Minutes']]
    .map(([k, l]) => ({ k, l, b: best(book.regular, k) })).filter(x => x.b);
  if (bests.length) add(ch, 'best', (
    <section>
      <h3>Best seasons</h3>
      <table className="mini">
        <caption className="sr-only">Highest per-game average in a regular season</caption>
        <thead><tr><th scope="col">Per game</th><th scope="col">Best</th><th scope="col">Season</th></tr></thead>
        <tbody>{bests.map(({ k, l, b }) => <tr key={k}><th scope="row">{l}</th><td className="num">{n1(b.value)}</td><td>{b.label}{b.team ? ` · ${b.team}` : ''}</td></tr>)}</tbody>
      </table>
      <Note>Regular seasons of 20 or more games.</Note>
    </section>
  ));
  add(ch, 'highs-h', <h3>Single-game highs</h3>);
  if (highs.state === 'loading') add(ch, 'highs-wait', <p role="status"><span className="spinner ink" aria-hidden /> Reading every game log on record…</p>);
  else if (highs.state === 'error') add(ch, 'highs-err', <p role="alert">The game logs didn't load ({highs.msg}).</p>);
  else if (highs.state === 'ok') highsBlocks(highs.h, surname, ch, add);
}

function highsBlocks(h, surname, ch, add) {
  if (!h.covered.length) { add(ch, 'highs-none', <p>No game-by-game logs are on record for {surname}'s seasons, so single-game highs can't be given.</p>); return; }
  const rows = ['points', 'totalRebounds', 'assists', 'steals', 'blocks', 'threePointFieldGoalsMade'];
  const get = (kind, stat) => h.highs[kind].find(x => x.stat === stat);
  const game = g => `${g.at === '@' ? 'at' : 'vs'} ${g.opp || '?'}, ${shortDate(g.date)}`;
  const missing = h.requested.filter(y => !h.covered.includes(y));
  add(ch, 'highs', (
    <table className="mini highs">
      <caption className="sr-only">Single-game career highs</caption>
      <thead><tr><th scope="col">Stat</th><th scope="col">Regular season</th><th scope="col">Playoffs</th></tr></thead>
      <tbody>
        {rows.map(stat => {
          const r = get('regular', stat), p = get('playoffs', stat);
          if (!r && !p) return null;
          return (
            <tr key={stat}>
              <th scope="row">{(r || p).label}</th>
              {[r, p].map((x, k) => <td key={k}>{x ? <><strong className="num">{x.value}</strong> <span className="game">{game(x.games[0])}{x.games.length + (x.more || 0) > 1 ? ` (+${x.games.length - 1 + (x.more || 0)} more)` : ''}</span></> : '—'}</td>)}
            </tr>
          );
        })}
      </tbody>
    </table>
  ));
  add(ch, 'tallies', (
    <ul className="tallies">
      {h.thirty && <li><strong>{n0(h.thirty.regular)}</strong> regular-season games of 30+ points{h.thirty.playoffs ? <>, <strong>{n0(h.thirty.playoffs)}</strong> in the playoffs</> : null}</li>}
      <li><strong>{n0(h.forty.regular)}</strong> of 40+{h.forty.playoffs ? <>, <strong>{n0(h.forty.playoffs)}</strong> in the playoffs</> : null}</li>
      <li><strong>{n0(h.fifty.regular)}</strong> of 50+{h.fifty.playoffs ? <>, <strong>{n0(h.fifty.playoffs)}</strong> in the playoffs</> : null}</li>
      {h.twentyTen && <li><strong>{n0(h.twentyTen.regular)}</strong> games of 20 points and 10 rebounds{h.twentyTen.playoffs ? <>, <strong>{n0(h.twentyTen.playoffs)}</strong> in the playoffs</> : null}</li>}
      <li><strong>{n0(h.tripleDoubles.regular)}</strong> triple-doubles{h.tripleDoubles.playoffs ? <>, <strong>{n0(h.tripleDoubles.playoffs)}</strong> in the playoffs</> : null}</li>
    </ul>
  ));
  if (h.firstForty) add(ch, 'forties', (
    <p className="kicker">{h.firstForty.date === h.lastForty.date ? <>His 40-point game on record: <strong>{h.firstForty.points}</strong> {game(h.firstForty)}.</>
      : <>First 40-point game on record: <strong>{h.firstForty.points}</strong> {game(h.firstForty)}. Most recent: <strong>{h.lastForty.points}</strong> {game(h.lastForty)}.</>}</p>
  ));
  add(ch, 'highs-n', (
    <Note>
      Counted from the game logs: {plural(h.games.regular, 'regular-season game')} and {plural(h.games.playoffs, 'playoff game')} across {plural(h.covered.length, 'season')} ({seasonLabel(h.covered[0])} to {seasonLabel(h.covered[h.covered.length - 1])}).
      {missing.length > 0 && ` No game log is on record for ${list(missing.map(seasonLabel))}, so games from ${missing.length === 1 ? 'that season' : 'those seasons'} are not counted.`}
    </Note>
  ));
}

// ---- VII. Honors ------------------------------------------------------------------------------------------------

function honors(book, ctx, add) {
  const ch = 8;
  add(ch, 'head', <><ChapterHead ch={ch} title="Honors" />{!book.honors.length && <p>No NBA awards are on record for {book.last || book.name}.</p>}</>, { start: true });
  book.honors.forEach(h => add(ch, `h-${h.name}`, (
    <div className={`honor${h.key === 'mvp' || h.key === 'fmvp' ? ' major' : ''}`}>
      <span className="medal" aria-hidden>{h.count}</span>
      <div>
        <strong>{h.name}</strong>{h.count > 1 ? <span className="times"> × {h.count}</span> : null}
        {h.seasons.length > 0 && <p className="seasons">{h.seasons.map(seasonLabel).join(' · ')}</p>}
      </div>
    </div>
  )));
  if (book.otherHonors?.length) add(ch, 'other', <><h3>Before the NBA</h3><ul className="plain">{book.otherHonors.map(h => <li key={h.name}>{h.name}{h.count > 1 ? ` × ${h.count}` : ''}</li>)}</ul></>);
  add(ch, 'note', <Note>The award records do not include All-Star selections or championships, so neither appears here rather than being guessed.</Note>);
}

// ---- VIII. Teams --------------------------------------------------------------------------------------------------

function teams(book, ctx, add) {
  const ch = 9;
  const sums = byTeam(book.regular);
  const find = name => sums.find(s => s.name === name || (name && s.name && name.endsWith(s.name.split(' ').pop()) && s.name.split(' ').pop().length > 3));
  add(ch, 'head', <><ChapterHead ch={ch} title="Teams" />{!book.teams.length && !sums.length && <p>No team history is on record for {book.name}.</p>}</>, { start: true });
  const list = book.teams.length ? [...book.teams].reverse() : sums.map(s => ({ name: s.name || s.team, seasons: `${seasonLabel(s.first)} – ${seasonLabel(s.last)}` }));
  list.forEach((t, k) => {
    const s = find(t.name);
    add(ch, `t${k}`, (
      <div className="team">
        {t.logo ? <img src={t.logo} alt="" width="44" height="44" /> : <span className="crest" aria-hidden>{(t.name || '?').split(' ').pop()[0]}</span>}
        <div>
          <strong>{t.name}</strong>
          <span className="t-years">{String(t.seasons).replace('-CURRENT', '–present').replace(/\*/g, '')}</span>
          {s && <span className="t-stats">{plural(s.games, 'regular-season game')} · {n0(s.points)} points · {n1(s.games ? s.points / s.games : null)} a game</span>}
        </div>
      </div>
    ));
  });
  if (book.teams.some(t => /\*/.test(t.seasons))) add(ch, 'n1', <Note>Years are team-history spans; a span that starts or ends mid-season marks a trade.</Note>);
  if (book.teams.some(t => t.derived)) add(ch, 'n2', <Note>No team history is on record for this player; these stints are read from the season statistics.</Note>);
}

// ---- IX. Statistical record ------------------------------------------------------------------------------------

const ordinal = n => { const t = ['th', 'st', 'nd', 'rd'], v = n % 100; return `${n.toLocaleString('en-US')}${t[(v - 20) % 10] || t[v] || t[0]}`; };
const pair = (a, b, f) => (a == null && b == null ? '—' : `${f(a)}–${f(b)}`);
const AVG_COLS = [
  ['GP', 'Games played', r => n0(r.avg?.gamesPlayed)], ['GS', 'Games started', r => n0(r.avg?.gamesStarted)], ['MIN', 'Minutes per game', r => n1(r.avg?.avgMinutes)],
  ['PTS', 'Points', r => n1(r.avg?.avgPoints)], ['REB', 'Rebounds', r => n1(r.avg?.avgRebounds)], ['AST', 'Assists', r => n1(r.avg?.avgAssists)],
  ['STL', 'Steals', r => n1(r.avg?.avgSteals)], ['BLK', 'Blocks', r => n1(r.avg?.avgBlocks)], ['TOV', 'Turnovers', r => n1(r.avg?.avgTurnovers)], ['PF', 'Personal fouls', r => n1(r.avg?.avgFouls)],
  ['FG', 'Field goals made–attempted', r => pair(r.avg?.avgFieldGoalsMade, r.avg?.avgFieldGoalsAttempted, n1)], ['FG%', 'Field-goal percentage', r => pct(r.avg?.fieldGoalPct)],
  ['3P', 'Three-pointers made–attempted', r => pair(r.avg?.avgThreePointFieldGoalsMade, r.avg?.avgThreePointFieldGoalsAttempted, n1)], ['3P%', 'Three-point percentage', r => pct(r.avg?.threePointFieldGoalPct)],
  ['FT', 'Free throws made–attempted', r => pair(r.avg?.avgFreeThrowsMade, r.avg?.avgFreeThrowsAttempted, n1)], ['FT%', 'Free-throw percentage', r => pct(r.avg?.freeThrowPct)],
  ['TS%', 'True shooting percentage', r => pct(trueShooting(r.tot))],
  ['OREB', 'Offensive rebounds', r => n1(r.avg?.avgOffensiveRebounds)], ['DREB', 'Defensive rebounds', r => n1(r.avg?.avgDefensiveRebounds)],
];
const TOT_COLS = [
  ['GP', 'Games played', r => n0(r.avg?.gamesPlayed)], ['PTS', 'Points', r => n0(r.tot?.points)], ['REB', 'Rebounds', r => n0(r.tot?.totalRebounds)], ['AST', 'Assists', r => n0(r.tot?.assists)],
  ['STL', 'Steals', r => n0(r.tot?.steals)], ['BLK', 'Blocks', r => n0(r.tot?.blocks)], ['TOV', 'Turnovers', r => n0(r.tot?.turnovers)], ['PF', 'Personal fouls', r => n0(r.tot?.fouls)],
  ['FGM', 'Field goals made', r => n0(r.tot?.fieldGoalsMade)], ['FGA', 'Field goals attempted', r => n0(r.tot?.fieldGoalsAttempted)], ['FG%', 'Field-goal percentage', r => pct(r.tot?.fieldGoalPct)],
  ['3PM', 'Three-pointers made', r => n0(r.tot?.threePointFieldGoalsMade)], ['3PA', 'Three-pointers attempted', r => n0(r.tot?.threePointFieldGoalsAttempted)], ['3P%', 'Three-point percentage', r => pct(r.tot?.threePointFieldGoalPct)],
  ['FTM', 'Free throws made', r => n0(r.tot?.freeThrowsMade)], ['FTA', 'Free throws attempted', r => n0(r.tot?.freeThrowsAttempted)], ['FT%', 'Free-throw percentage', r => pct(r.tot?.freeThrowPct)],
  ['OREB', 'Offensive rebounds', r => n0(r.tot?.offensiveRebounds)], ['DREB', 'Defensive rebounds', r => n0(r.tot?.defensiveRebounds)],
  ['DD', 'Double-doubles', r => n0(r.misc?.doubleDouble)], ['TD', 'Triple-doubles', r => n0(r.misc?.tripleDouble)],
];

function statRecord(book, { ui, setUi }, add) {
  const ch = 10;
  if (!book.regular) { add(ch, 'head', <><ChapterHead ch={ch} title="Statistical record" /><p>No season statistics are on record for {book.name}.</p></>, { start: true }); return; }
  const kind = book[ui.statKind] ? ui.statKind : 'regular';
  const stats = book[kind];
  const teamsList = [...new Set(stats.rows.filter(r => !r.combined && r.team).map(r => r.team))];
  const team = teamsList.includes(ui.statTeam) ? ui.statTeam : 'all';
  const cols = ui.statView === 'avg' ? AVG_COLS : TOT_COLS;
  const rows = stats.rows.filter(r => (team === 'all' ? true : r.team === team && !r.combined));
  const hasCombined = rows.some(r => r.combined);
  add(ch, 'head', (
    <>
      <ChapterHead ch={ch} title="Statistical record" sub={kind === 'regular' ? `Regular seasons, ${recordSpan(book)}` : 'Playoffs'} />
      <div className="controls" role="group" aria-label="Table options">
        <Segmented label="Season type" value={kind} set={v => setUi({ statKind: v })} options={[['regular', 'Regular season'], ...(book.playoffs ? [['playoffs', 'Playoffs']] : [])]} />
        <Segmented label="Figures" value={ui.statView} set={v => setUi({ statView: v })} options={[['avg', 'Per game'], ['tot', 'Totals']]} />
        {teamsList.length > 1 && (
          <label className="select">
            <span>Team</span>
            <select value={team} onChange={e => setUi({ statTeam: e.target.value })}>
              <option value="all">All teams</option>
              {teamsList.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
      </div>
    </>
  ), { start: true });
  add(ch, 'table', (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Statistics table, scrolls sideways">
      <table className="stats">
        <caption className="sr-only">{book.name}: {kind === 'regular' ? 'regular season' : 'playoff'} {ui.statView === 'avg' ? 'per-game averages' : 'totals'}</caption>
        <thead><tr><th scope="col" className="sticky">Season</th><th scope="col">Team</th>{cols.map(([a, t]) => <th scope="col" key={a}><abbr title={t}>{a}</abbr></th>)}</tr></thead>
        <tbody>
          {rows.map((r, k) => (
            <tr key={k} className={r.combined ? 'combined' : hasCombined && rows.some(x => x.combined && x.season === r.season) ? 'part' : ''}>
              <th scope="row" className="sticky">{r.label}</th>
              <td>{r.combined ? 'Season total' : r.team || '—'}</td>
              {cols.map(([a, , f]) => <td key={a} className="num">{f(r)}</td>)}
            </tr>
          ))}
        </tbody>
        {team === 'all' && (
          <tfoot><tr><th scope="row" className="sticky">Career</th><td>{plural(stats.seasons, kind === 'regular' ? 'season' : 'run')}</td>{cols.map(([a, , f]) => <td key={a} className="num">{f(stats.career)}</td>)}</tr></tfoot>
        )}
      </table>
    </div>
  ), { table: true });
  if (hasCombined) add(ch, 'n1', <Note>In seasons split by a trade, each team's line is indented and followed by the season total.</Note>);
  const gap = coverageGap(book);
  if (gap) add(ch, 'n2', stats.careerBeyondRows
    ? <Note>Seasons before {gap.recordLabel} have no rows in the record, but the career line covers the whole career ({n0(stats.career.avg?.gamesPlayed)} games against {n0(stats.rowGames)} in the rows above).</Note>
    : <Note>Seasons before {gap.recordLabel} are not in the record, so the career line covers {recordSpan(book)} only.</Note>);
}

// ---- X. Legacy -----------------------------------------------------------------------------------------------

function legacy(book, { rank }, add) {
  const ch = 11;
  const reg = book.regular, post = book.playoffs;
  const surname = book.last || book.name;
  const seasons = perSeason(reg);
  const total = book.honors.reduce((a, h) => a + h.count, 0);
  const lines = [];
  if (reg) {
    const t = reg.career.tot || {};
    if (reg.careerBeyondRows) lines.push(`The career line reaches back before the season rows; the totals below are the whole career.`);
    const parts = [['points', 'points'], ['totalRebounds', 'rebounds'], ['assists', 'assists']].filter(([k]) => t[k] != null).map(([k, w]) => `${n0(t[k])} ${w}`);
    if (parts.length) lines.push(`${list(parts)} in ${n0(reg.career.avg?.gamesPlayed)} regular-season games.`.replace(/^./, c => c.toUpperCase()));
  }
  if (post) lines.push(`${n0(post.career.tot?.points)} more points in ${n0(post.career.avg?.gamesPlayed)} playoff games across ${plural(post.seasons, 'postseason')}.`);
  if (rank?.games) lines.push(`${ordinal(rank.games.rank)} in games played among the ${rank.games.of.toLocaleString('en-US')} players in this library.`);
  if (total) lines.push(`${plural(total, 'NBA honor')} on the award lists${book.honors[0] ? `, led by ${book.honors[0].count > 1 ? `${book.honors[0].count} × ` : ''}${book.honors[0].name}` : ''}.`);
  add(ch, 'head', (
    <>
      <ChapterHead ch={ch} title="Legacy" sub="What the record adds up to" />
      {lines.length ? <ul className="summary">{lines.map((l, k) => <li key={k}>{l}</li>)}</ul> : <p>The record for {book.name} is too thin to add up.</p>}
    </>
  ), { start: true });
  const marks = reg && !coverageGap(book) ? milestones(reg) : [];
  if (marks.length) {
    add(ch, 'ms-h', <h3>Milestones</h3>);
    marks.forEach(m => add(ch, `ms-${m.key}`, (
      <div className="ledger-row"><span>{m.label}</span><span>Passed {m.value.toLocaleString('en-US')} {m.word}{book.born ? ` at ${ageInSeason(book.born, m.season)}` : ''}</span><strong aria-hidden>●</strong></div>
    )));
  }
  if (seasons.length > 1) add(ch, 'chart', (
    <Accumulation data={seasons.map(r => ({ key: r.season, label: r.label, short: `’${String(r.season % 100).padStart(2, '0')}`, value: r.tot?.points ?? null }))} format={n0}
      caption={`Career regular-season points, accumulated season by season${book.active ? ' — the book is still being written' : ''}.`} />
  ));
  if (book.active) add(ch, 'active', <p>{surname} is still playing. This book is updated as new games are played.</p>);
  add(ch, 'colophon', (
    <section className="colophon">
      <h3>Colophon</h3>
      <p>Figures as of {longDate(book.at?.slice(0, 10))}. Missing figures are left blank, never estimated. Rankings and opinions are left out.</p>
    </section>
  ));
}

// Pack measured blocks into pages. heights[k] is block k's height including margins; room is the page's text height.
export function paginate(blocks, heights, room) {
  const pages = [];
  let cur = null, used = 0;
  blocks.forEach((b, k) => {
    const h = Math.min(heights[k] || 0, room);
    // A section heading (key ending in "-h") never ends a page: it moves over with the block it introduces.
    const withNext = /-h$/.test(b.key) && k + 1 < blocks.length && !blocks[k + 1].start ? Math.min(heights[k + 1] || 0, room - h) : 0;
    if (!cur || b.start || b.whole || (used + h + withNext > room && cur.blocks.length)) {
      cur = { blocks: [], ch: b.ch }; pages.push(cur); used = 0;
    }
    cur.blocks.push(k); used += h;
    if (b.whole) { cur = null; }
  });
  const chapterPages = {};
  pages.forEach((p, i) => { if (chapterPages[p.ch] == null) chapterPages[p.ch] = i; });
  return { pages, chapterPages };
}
