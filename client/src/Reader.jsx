import React, { useEffect, useMemo, useRef, useState } from 'react';
import { loadBook, loadHighs, headshot } from './api.js';
import { span as spanOf, seasonLabel } from './shelves.js';
import { n0, n1, pct, longDate, shortDate, ageOn, list, plural } from './format.js';
import { perSeason, byTeam, best, LEADER_PHRASE, coverageGap, teamsInSeason } from './bookdata.js';
import { SeasonColumns, Accumulation } from './charts.jsx';

const CHAPTERS = ['Title page', 'The player', 'Career', 'Records', 'Honors', 'Teams', 'Statistical record', 'Legacy'];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export default function Reader({ id, player, layout, index, motion, onClose }) {
  const [state, setState] = useState({ book: null, error: null });
  const [ch, setCh] = useState(0);
  const [dir, setDir] = useState(0);
  const head = useRef(null);
  const page = useRef(null);
  const touch = useRef(null);

  useEffect(() => {
    let live = true;
    setState({ book: null, error: null });
    loadBook(id).then(book => live && setState({ book, error: null })).catch(e => live && setState({ book: null, error: e.message }));
    return () => { live = false; };
  }, [id]);
  useEffect(() => { head.current?.focus(); }, []);

  const go = k => {
    const next = Math.max(0, Math.min(CHAPTERS.length - 1, k));
    if (next === ch) return;
    setDir(next > ch ? 1 : -1); setCh(next);
    page.current?.scrollTo?.(0, 0);
  };

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.target.closest?.('input, select, textarea, .table-scroll')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(ch + 1); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(ch - 1); }
      if (e.key === 'Home') { e.preventDefault(); go(0); }
      if (e.key === 'End') { e.preventDefault(); go(CHAPTERS.length - 1); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const onTouchStart = e => { if (e.target.closest('.table-scroll, .chart')) return; const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = e => {
    const s = touch.current; touch.current = null; if (!s) return;
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) go(ch + (dx < 0 ? 1 : -1));
  };

  const { book, error } = state;
  const name = book?.name || player?.n || 'Unknown player';
  const shelf = index != null && layout ? { cs: layout.cases[layout.books[index].c], s: layout.books[index].s + 1 } : null;

  return (
    <div className="reader" role="dialog" aria-modal="true" aria-labelledby="book-title">
      <div className={`spread${motion ? '' : ' still'}`}>
        <nav className="page left contents" aria-label="Contents">
          <p className="running">{name}</p>
          <h2 className="contents-title">Contents</h2>
          <ol>
            {CHAPTERS.map((c, k) => (
              <li key={c}>
                <button className={k === ch ? 'on' : ''} aria-current={k === ch ? 'page' : undefined} onClick={() => go(k)}>
                  <span className="num">{ROMAN[k]}</span><span className="ttl">{c}</span><span className="lead" aria-hidden /><span className="folio">{k * 2 + 1}</span>
                </button>
              </li>
            ))}
          </ol>
          {shelf && (
            <div className="bookplate" aria-label="Bookplate">
              <p className="bp-ex">Ex libris</p>
              <p className="bp-lib">The Player Library</p>
              <dl>
                <dt>Shelf mark</dt><dd>{shelf.cs.label} · {shelf.s}</dd>
                <dt>ESPN no.</dt><dd>{id}</dd>
              </dl>
            </div>
          )}
          <button className="btn back" onClick={onClose}>← Return to the shelves <kbd>Esc</kbd></button>
        </nav>

        <div className="page right">
          <div className="mobile-bar">
            <button className="btn small" onClick={onClose} aria-label="Return to the shelves">← Shelves</button>
            <label className="chapter-pick">
              <span className="sr-only">Chapter</span>
              <select value={ch} onChange={e => go(Number(e.target.value))}>
                {CHAPTERS.map((c, k) => <option key={c} value={k}>{ROMAN[k] ? `${ROMAN[k]}. ` : ''}{c}</option>)}
              </select>
            </label>
          </div>
          <article ref={page} key={ch} className={`leaf${dir > 0 ? ' turn-fwd' : dir < 0 ? ' turn-back' : ''}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} aria-live="polite">
            <h1 id="book-title" className="sr-only" tabIndex={-1} ref={head}>{name}: {CHAPTERS[ch]}</h1>
            {error ? <Fault msg={error} /> : !book ? <Pending player={player} /> : (
              <Chapter k={ch} book={book} player={player} shelf={shelf} go={go} />
            )}
          </article>
          <footer className="page-foot">
            <button className="turn" onClick={() => go(ch - 1)} disabled={ch === 0} aria-label={ch > 0 ? `Previous: ${CHAPTERS[ch - 1]}` : 'Previous'}>‹ {ch > 0 ? CHAPTERS[ch - 1] : ''}</button>
            <span className="folio">{ch * 2 + 1}</span>
            <button className="turn" onClick={() => go(ch + 1)} disabled={ch === CHAPTERS.length - 1} aria-label={ch < CHAPTERS.length - 1 ? `Next: ${CHAPTERS[ch + 1]}` : 'Next'}>{ch < CHAPTERS.length - 1 ? CHAPTERS[ch + 1] : ''} ›</button>
          </footer>
        </div>
      </div>
    </div>
  );
}

function Pending({ player }) {
  return (
    <div className="pending" role="status">
      <h2 className="display">{player?.n}</h2>
      <p className="lede">{spanOf(player || {})}</p>
      <p><span className="spinner ink" aria-hidden /> Fetching the pages from ESPN…</p>
    </div>
  );
}

function Fault({ msg }) {
  return (
    <div className="pending" role="alert">
      <h2>This book won't open right now</h2>
      <p>{msg}</p>
      <button className="btn" onClick={() => location.reload()}>Try again</button>
    </div>
  );
}

function Chapter({ k, book, player, shelf, go }) {
  switch (k) {
    case 0: return <TitlePage book={book} player={player} shelf={shelf} go={go} />;
    case 1: return <ThePlayer book={book} />;
    case 2: return <Career book={book} />;
    case 3: return <Records book={book} />;
    case 4: return <Honors book={book} />;
    case 5: return <Teams book={book} />;
    case 6: return <StatRecord book={book} />;
    default: return <Legacy book={book} />;
  }
}

const Note = ({ children }) => <p className="note">{children}</p>;
const ChapterHead = ({ n, title, sub }) => (
  <header className="ch-head">
    <p className="ch-num">Chapter {ROMAN[n]}</p>
    <h2>{title}</h2>
    {sub && <p className="ch-sub">{sub}</p>}
  </header>
);

function recordSpan(book) {
  const r = book.regular;
  if (!r) return null;
  return r.first === r.last ? seasonLabel(r.first) : `${seasonLabel(r.first)} to ${seasonLabel(r.last)}`;
}

// ---- Title page -------------------------------------------------------------------------------------------------

function TitlePage({ book, player, shelf, go }) {
  const [img, setImg] = useState(book.headshot ? 'loading' : 'none');
  // ESPN lists headshot URLs for some legends that return 404; the image's own error handler covers that.
  const initials = book.name.split(/\s+/).map(s => s[0]).slice(0, 2).join('');
  const start = book.debut || (book.regular ? book.regular.first - 1 : null);
  const years = book.regular && start ? `${start}–${book.active ? 'now' : book.regular.last}` : start ? `from ${start}` : spanOf(player || {});
  return (
    <div className="title-page">
      <p className="imprint">The Player Library</p>
      <div className={`portrait${img === 'ok' ? ' has' : ''}`}>
        {book.headshot && img !== 'none' && (
          <img src={book.headshot || headshot(book.id)} alt={`${book.name}, ESPN headshot`} onLoad={() => setImg('ok')} onError={() => setImg('none')} crossOrigin="anonymous" />
        )}
        {img !== 'ok' && <span className="monogram" aria-hidden>{initials}</span>}
      </div>
      <h2 className="display">{book.name}</h2>
      <p className="lede">{[book.posName, years].filter(Boolean).join(' · ')}</p>
      <hr className="rule" />
      <p className="ex-libris">
        {book.regular ? <>A record of {plural(book.regular.seasons, 'season')} on ESPN's books{book.playoffs ? `, ${plural(book.playoffs.seasons, 'playoff run')}` : ''}.</> : <>ESPN keeps no season statistics for this player; the book holds what it does have.</>}
        {shelf && <><br />Shelved in bookcase {shelf.cs.label}, shelf {shelf.s}.</>}
      </p>
      <button className="btn" onClick={() => go(1)}>Begin reading ›</button>
      {img === 'none' && <p className="note small">{book.headshot ? 'The ESPN portrait could not be loaded.' : `No portrait: ESPN holds no headshot for ${book.last || book.name}.`}</p>}
    </div>
  );
}

// ---- I. The player ---------------------------------------------------------------------------------------------

function ThePlayer({ book }) {
  const reg = book.regular;
  const seasons = perSeason(reg);
  const teams = [...new Set(seasons.flatMap(r => (r.combined ? teamsInSeason(reg, r.season) : [r.teamName || r.team])).filter(Boolean))];
  const names = byTeam(reg).map(t => t.name || t.team);
  const gap = coverageGap(book);
  const surname = book.last || book.name;
  const verb = book.active ? 'has played' : 'played';
  const intro = [];
  if (reg) {
    intro.push(`${book.name}${book.posName ? `, a ${book.posName.toLowerCase()},` : ''} ${verb} ${plural(reg.seasons, 'regular season')} on ESPN's record, ${reg.first === reg.last ? `in ${seasonLabel(reg.first)}` : `from ${seasonLabel(reg.first)} to ${seasonLabel(reg.last)}`}${names.length ? `, for ${list(names.length ? names : teams)}` : ''}.`);
    const c = reg.career.avg || {};
    const parts = [['avgPoints', 'points'], ['avgRebounds', 'rebounds'], ['avgAssists', 'assists']].filter(([k]) => c[k] != null).map(([k, w]) => `${n1(c[k])} ${w}`);
    if (parts.length && c.gamesPlayed) intro.push(`Across those seasons ${surname} averaged ${list(parts)} a game in ${n0(c.gamesPlayed)} games.`);
    const missing = [['avgRebounds', 'rebounds'], ['avgSteals', 'steals'], ['avgBlocks', 'blocks']].filter(([k]) => c[k] == null).map(([, w]) => w);
    if (missing.length) intro.push(`ESPN's record has no complete ${list(missing)} figures for this career${reg.first < 1974 ? ' (the league only began counting steals and blocks in 1973-74)' : ''}, so they are left blank rather than guessed.`);
  } else {
    intro.push(`ESPN holds no season-by-season statistics for ${book.name}. This book carries what ESPN does record${book.honors.length ? ': biography and honors' : ': the biography'}.`);
  }
  if (book.honors.find(h => h.key === 'mvp')) intro.push(`${surname} was named the league's Most Valuable Player ${plural(book.honors.find(h => h.key === 'mvp').count, 'time')}.`);
  const age = book.born && book.active ? ageOn(book.born) : null;
  const facts = [
    ['Born', book.born ? `${longDate(book.born)}${age != null ? ` (age ${age})` : ''}` : null],
    ['Birthplace', book.birthplace],
    ['Position', book.posName],
    ['Height', book.height],
    ['Weight', book.weight],
    ['College', book.college],
    ['Draft', book.draft],
    ['First season', book.debut ? seasonLabel(book.debut + 1) : null],
    ['Status', book.active ? `Active${book.team ? ` — ${book.team.name}` : ''}` : book.status === 'Active' ? 'Active' : 'Retired'],
    ['Jersey', book.jersey ? `#${book.jersey}` : null],
  ];
  return (
    <>
      <ChapterHead n={1} title="The player" />
      {intro.map((t, k) => <p key={k} className={k === 0 ? 'opening' : ''}>{t}</p>)}
      {gap && <Note>ESPN's season-by-season record for {surname} begins in {gap.recordLabel}, though the career began in {gap.label}. Those first {plural(gap.missing, 'season')} are missing from every table and total in this book.</Note>}
      <dl className="facts">
        {facts.map(([k, v]) => (
          <React.Fragment key={k}><dt>{k}</dt><dd className={v ? '' : 'missing'}>{v || 'Not on record'}</dd></React.Fragment>
        ))}
      </dl>
    </>
  );
}

// ---- II. Career -------------------------------------------------------------------------------------------------

const METRICS = [
  ['avgPoints', 'Points', n1], ['avgRebounds', 'Rebounds', n1], ['avgAssists', 'Assists', n1], ['avgMinutes', 'Minutes', n1], ['gamesPlayed', 'Games', n0],
];

function Career({ book }) {
  const [m, setM] = useState(0);
  const [kind, setKind] = useState('regular');
  const stats = book[kind];
  const seasons = perSeason(stats);
  if (!book.regular) return (<><ChapterHead n={2} title="Career" /><p>ESPN has no season statistics for {book.name}, so there is no career to chart. The honors chapter lists what ESPN does record.</p></>);
  const [key, label, fmt] = METRICS[m];
  const data = seasons.map(r => ({ key: r.season, label: r.label, short: `’${String(r.season % 100).padStart(2, '0')}`, value: r.avg?.[key] ?? null, note: `${r.combined ? teamsInSeason(stats, r.season).join(' / ') : r.team || ''}${r.avg?.gamesPlayed != null ? ` · ${r.avg.gamesPlayed} games` : ''}` }));
  const stints = byTeam(book.regular);
  return (
    <>
      <ChapterHead n={2} title="Career" sub={`Seasons on record: ${recordSpan(book)}`} />
      <div className="controls" role="group" aria-label="Chart options">
        <Segmented label="Season type" value={kind} set={setKind} options={[['regular', 'Regular season'], ...(book.playoffs ? [['playoffs', 'Playoffs']] : [])]} />
        <Segmented label="Measure" value={m} set={setM} options={METRICS.map(([, l], k) => [k, l])} />
      </div>
      {stats && data.every(d => d.value == null) ? <p>ESPN has no {label.toLowerCase()} figures for {book.last || book.name}'s seasons.</p> : stats ? (
        <SeasonColumns data={data} format={fmt} caption={`${label} ${key === 'gamesPlayed' ? 'played' : 'per game'}, by ${kind === 'playoffs' ? 'playoff run' : 'season'}. The highest is marked in red.`} />
      ) : <p>No playoff appearances on ESPN's record.</p>}
      <h3>The stints</h3>
      <ol className="stints">
        {stints.map(t => (
          <li key={t.team}>
            <span className="stint-years">{t.first === t.last ? seasonLabel(t.first) : `${seasonLabel(t.first)} – ${seasonLabel(t.last)}`}</span>
            <span className="stint-team">{t.name || t.team}</span>
            <span className="stint-n">{plural(t.games, 'game')} · {n0(t.points)} pts</span>
          </li>
        ))}
      </ol>
      {book.regular.rows.some(r => r.combined) && <Note>Seasons split by a trade count toward each team the player appeared for.</Note>}
    </>
  );
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

// ---- III. Records ----------------------------------------------------------------------------------------------

function Records({ book }) {
  const [highs, setHighs] = useState({ state: book.regular ? 'loading' : 'none' });
  useEffect(() => {
    if (!book.regular) return;
    let live = true;
    loadHighs(book.id).then(h => live && setHighs({ state: 'ok', h })).catch(e => live && setHighs({ state: 'error', msg: e.message }));
    return () => { live = false; };
  }, [book.id, book.regular]);
  const surname = book.last || book.name;
  const bests = [['avgPoints', 'Points'], ['avgRebounds', 'Rebounds'], ['avgAssists', 'Assists'], ['avgSteals', 'Steals'], ['avgBlocks', 'Blocks'], ['avgMinutes', 'Minutes']]
    .map(([k, l]) => ({ k, l, b: best(book.regular, k) })).filter(x => x.b);
  const led = book.leaders || [];
  const leadersNote = book.leadersFrom && book.regular && book.regular.first < book.leadersFrom
    ? `ESPN's qualified league leaders are available from ${seasonLabel(book.leadersFrom)}; earlier seasons could not be checked.` : null;
  return (
    <>
      <ChapterHead n={3} title="Records" />
      {!book.regular && <p>ESPN has no season or game statistics for {book.name}, so there are no records to show.</p>}
      {led.length > 0 && (
        <section>
          <h3>Led the league</h3>
          <ul className="ledger">
            {led.map(l => <li key={l.season + l.stat}><span>{l.label}</span><span>{LEADER_PHRASE[l.stat]} per game</span><strong>{n1(l.value)}</strong></li>)}
          </ul>
        </section>
      )}
      {book.regular && !led.length && <p>{surname} never finished a season as ESPN's qualified league leader in points, rebounds, assists, steals or blocks per game{book.leadersFrom ? ` (seasons from ${seasonLabel(book.leadersFrom)} checked)` : ''}.</p>}
      {leadersNote && led.length > 0 && <Note>{leadersNote}</Note>}
      {bests.length > 0 && (
        <section>
          <h3>Best seasons</h3>
          <table className="mini">
            <caption className="sr-only">Highest per-game average in a regular season</caption>
            <thead><tr><th scope="col">Per game</th><th scope="col">Best</th><th scope="col">Season</th></tr></thead>
            <tbody>{bests.map(({ k, l, b }) => <tr key={k}><th scope="row">{l}</th><td className="num">{n1(b.value)}</td><td>{b.label}{b.team ? ` · ${b.team}` : ''}</td></tr>)}</tbody>
          </table>
          <Note>Regular seasons of 20 or more games.</Note>
        </section>
      )}
      {book.regular && (
        <section>
          <h3>Single-game highs</h3>
          {highs.state === 'loading' && <p role="status"><span className="spinner ink" aria-hidden /> Reading every game log ESPN keeps…</p>}
          {highs.state === 'error' && <p role="alert">The game logs didn't load ({highs.msg}).</p>}
          {highs.state === 'ok' && <Highs h={highs.h} surname={surname} />}
        </section>
      )}
    </>
  );
}

function Highs({ h, surname }) {
  if (!h.covered.length) return <p>ESPN keeps no game-by-game logs for {surname}'s seasons, so single-game highs can't be given.</p>;
  const rows = ['points', 'totalRebounds', 'assists', 'steals', 'blocks', 'threePointFieldGoalsMade'];
  const get = (kind, stat) => h.highs[kind].find(x => x.stat === stat);
  const game = g => `${g.at === '@' ? 'at' : 'vs'} ${g.opp || '?'}, ${shortDate(g.date)}`;
  const missing = h.requested.filter(y => !h.covered.includes(y));
  return (
    <>
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
      <ul className="tallies">
        <li><strong>{n0(h.forty.regular)}</strong> regular-season games of 40+ points{h.forty.playoffs ? <>, <strong>{n0(h.forty.playoffs)}</strong> in the playoffs</> : null}</li>
        <li><strong>{n0(h.fifty.regular)}</strong> of 50+{h.fifty.playoffs ? <>, <strong>{n0(h.fifty.playoffs)}</strong> in the playoffs</> : null}</li>
        <li><strong>{n0(h.tripleDoubles.regular)}</strong> triple-doubles{h.tripleDoubles.playoffs ? <>, <strong>{n0(h.tripleDoubles.playoffs)}</strong> in the playoffs</> : null}</li>
      </ul>
      <Note>
        Counted from ESPN's game logs: {plural(h.games.regular, 'regular-season game')} and {plural(h.games.playoffs, 'playoff game')} across {plural(h.covered.length, 'season')} ({seasonLabel(h.covered[0])} to {seasonLabel(h.covered[h.covered.length - 1])}).
        {missing.length > 0 && ` ESPN has no game log for ${list(missing.map(seasonLabel))}, so games from ${missing.length === 1 ? 'that season' : 'those seasons'} are not counted.`}
      </Note>
    </>
  );
}

// ---- IV. Honors -----------------------------------------------------------------------------------------------

function Honors({ book }) {
  const surname = book.last || book.name;
  return (
    <>
      <ChapterHead n={4} title="Honors" />
      {book.honors.length ? (
        <ul className="honors">
          {book.honors.map(h => (
            <li key={h.name} className={h.key === 'mvp' || h.key === 'fmvp' ? 'major' : ''}>
              <span className="medal" aria-hidden>{h.count}</span>
              <div>
                <strong>{h.name}</strong>{h.count > 1 ? <span className="times"> × {h.count}</span> : null}
                {h.seasons.length > 0 && <p className="seasons">{h.seasons.map(seasonLabel).join(' · ')}</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : <p>ESPN records no NBA awards for {surname}.</p>}
      {book.otherHonors?.length > 0 && (
        <>
          <h3>Before the NBA</h3>
          <ul className="plain">{book.otherHonors.map(h => <li key={h.name}>{h.name}{h.count > 1 ? ` × ${h.count}` : ''}</li>)}</ul>
        </>
      )}
      <Note>ESPN's award records do not include All-Star selections or championships, so neither appears here rather than being guessed.</Note>
    </>
  );
}

// ---- V. Teams --------------------------------------------------------------------------------------------------

function Teams({ book }) {
  const sums = byTeam(book.regular);
  const find = name => sums.find(s => s.name === name || (name && s.name && name.endsWith(s.name.split(' ').pop()) && s.name.split(' ').pop().length > 3));
  return (
    <>
      <ChapterHead n={5} title="Teams" />
      {!book.teams.length && !sums.length && <p>ESPN has no team history for {book.name}.</p>}
      <ol className="teams">
        {(book.teams.length ? [...book.teams].reverse() : sums.map(s => ({ name: s.name || s.team, seasons: `${seasonLabel(s.first)} – ${seasonLabel(s.last)}` }))).map((t, k) => {
          const s = find(t.name);
          return (
            <li key={t.name + k}>
              {t.logo ? <img src={t.logo} alt="" width="44" height="44" loading="lazy" /> : <span className="crest" aria-hidden>{(t.name || '?').split(' ').pop()[0]}</span>}
              <div>
                <strong>{t.name}</strong>
                <span className="t-years">{String(t.seasons).replace('-CURRENT', '–present').replace(/\*/g, '')}</span>
                {s && <span className="t-stats">{plural(s.games, 'regular-season game')} · {n0(s.points)} points · {n1(s.games ? s.points / s.games : null)} a game</span>}
              </div>
            </li>
          );
        })}
      </ol>
      {book.teams.some(t => /\*/.test(t.seasons)) && <Note>Years are ESPN's team-history spans; a span that starts or ends mid-season marks a trade.</Note>}
      {book.teams.some(t => t.derived) && <Note>ESPN gives no team history for this player; these stints are read from the season statistics.</Note>}
    </>
  );
}

// ---- VI. Statistical record ------------------------------------------------------------------------------------

const AVG_COLS = [
  ['GP', 'Games played', r => n0(r.avg?.gamesPlayed)], ['GS', 'Games started', r => n0(r.avg?.gamesStarted)], ['MIN', 'Minutes per game', r => n1(r.avg?.avgMinutes)],
  ['PTS', 'Points', r => n1(r.avg?.avgPoints)], ['REB', 'Rebounds', r => n1(r.avg?.avgRebounds)], ['AST', 'Assists', r => n1(r.avg?.avgAssists)],
  ['STL', 'Steals', r => n1(r.avg?.avgSteals)], ['BLK', 'Blocks', r => n1(r.avg?.avgBlocks)], ['TOV', 'Turnovers', r => n1(r.avg?.avgTurnovers)], ['PF', 'Personal fouls', r => n1(r.avg?.avgFouls)],
  ['FG', 'Field goals made–attempted', r => pair(r.avg?.avgFieldGoalsMade, r.avg?.avgFieldGoalsAttempted, n1)], ['FG%', 'Field-goal percentage', r => pct(r.avg?.fieldGoalPct)],
  ['3P', 'Three-pointers made–attempted', r => pair(r.avg?.avgThreePointFieldGoalsMade, r.avg?.avgThreePointFieldGoalsAttempted, n1)], ['3P%', 'Three-point percentage', r => pct(r.avg?.threePointFieldGoalPct)],
  ['FT', 'Free throws made–attempted', r => pair(r.avg?.avgFreeThrowsMade, r.avg?.avgFreeThrowsAttempted, n1)], ['FT%', 'Free-throw percentage', r => pct(r.avg?.freeThrowPct)],
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
function pair(a, b, f) { return a == null && b == null ? '—' : `${f(a)}–${f(b)}`; }

function StatRecord({ book }) {
  const [kind, setKind] = useState('regular');
  const [view, setView] = useState('avg');
  const [team, setTeam] = useState('all');
  const stats = book[kind];
  const teams = useMemo(() => [...new Set((stats?.rows || []).filter(r => !r.combined && r.team).map(r => r.team))], [stats]);
  useEffect(() => { if (team !== 'all' && !teams.includes(team)) setTeam('all'); }, [teams, team]);
  if (!book.regular) return (<><ChapterHead n={6} title="Statistical record" /><p>ESPN holds no season statistics for {book.name}.</p></>);
  const cols = view === 'avg' ? AVG_COLS : TOT_COLS;
  const rows = (stats?.rows || []).filter(r => (team === 'all' ? true : r.team === team && !r.combined));
  const hasCombined = rows.some(r => r.combined);
  return (
    <>
      <ChapterHead n={6} title="Statistical record" sub={kind === 'regular' ? `Regular seasons, ${recordSpan(book)}` : 'Playoffs'} />
      <div className="controls" role="group" aria-label="Table options">
        <Segmented label="Season type" value={kind} set={setKind} options={[['regular', 'Regular season'], ...(book.playoffs ? [['playoffs', 'Playoffs']] : [])]} />
        <Segmented label="Figures" value={view} set={setView} options={[['avg', 'Per game'], ['tot', 'Totals']]} />
        {teams.length > 1 && (
          <label className="select">
            <span>Team</span>
            <select value={team} onChange={e => setTeam(e.target.value)}>
              <option value="all">All teams</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
      </div>
      {!stats ? <p>No playoff games on ESPN's record.</p> : (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Statistics table, scrolls sideways">
          <table className="stats">
            <caption className="sr-only">{book.name}: {kind === 'regular' ? 'regular season' : 'playoff'} {view === 'avg' ? 'per-game averages' : 'totals'}</caption>
            <thead>
              <tr><th scope="col" className="sticky">Season</th><th scope="col">Team</th>{cols.map(([a, t]) => <th scope="col" key={a}><abbr title={t}>{a}</abbr></th>)}</tr>
            </thead>
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
              <tfoot>
                <tr><th scope="row" className="sticky">Career</th><td>{plural(stats.seasons, kind === 'regular' ? 'season' : 'run')}</td>{cols.map(([a, , f]) => <td key={a} className="num">{f(stats.career)}</td>)}</tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {hasCombined && <Note>In seasons split by a trade, each team's line is indented and followed by the season total.</Note>}
      {coverageGap(book) && <Note>Seasons before {coverageGap(book).recordLabel} are not in ESPN's record, so the career line covers {recordSpan(book)} only.</Note>}
    </>
  );
}

// ---- VII. Legacy -----------------------------------------------------------------------------------------------

function Legacy({ book }) {
  const reg = book.regular, post = book.playoffs;
  const surname = book.last || book.name;
  const seasons = perSeason(reg);
  const honors = book.honors.reduce((a, h) => a + h.count, 0);
  const lines = [];
  if (reg) {
    const t = reg.career.tot || {};
    const parts = [['points', 'points'], ['totalRebounds', 'rebounds'], ['assists', 'assists']].filter(([k]) => t[k] != null).map(([k, w]) => `${n0(t[k])} ${w}`);
    if (parts.length) lines.push(`${list(parts)} in ${n0(reg.career.avg?.gamesPlayed)} regular-season games.`.replace(/^./, c => c.toUpperCase()));
  }
  if (post) lines.push(`${n0(post.career.tot?.points)} more points in ${n0(post.career.avg?.gamesPlayed)} playoff games across ${plural(post.seasons, 'postseason')}.`);
  if (honors) lines.push(`${plural(honors, 'NBA honor')} on ESPN's award lists${book.honors[0] ? `, led by ${book.honors[0].count > 1 ? `${book.honors[0].count} × ` : ''}${book.honors[0].name}` : ''}.`);
  return (
    <>
      <ChapterHead n={7} title="Legacy" sub="What the record adds up to" />
      {lines.length ? <ul className="summary">{lines.map((l, k) => <li key={k}>{l}</li>)}</ul> : <p>ESPN's record for {book.name} is too thin to add up.</p>}
      {seasons.length > 1 && (
        <Accumulation data={seasons.map(r => ({ key: r.season, label: r.label, short: `’${String(r.season % 100).padStart(2, '0')}`, value: r.tot?.points ?? null }))} format={n0}
          caption={`Career regular-season points, accumulated season by season${book.active ? ' — the book is still being written' : ''}.`} />
      )}
      {book.active && <p>{surname} is still playing. This book is rebuilt from ESPN as new games are logged.</p>}
      <section className="colophon">
        <h3>Colophon</h3>
        <p>Every figure in this book comes from ESPN's public data, fetched {longDate(book.at?.slice(0, 10))}. Missing figures are left blank, never estimated. Rankings and opinions are left out because ESPN's data can't support them fairly.</p>
        <p><a href={book.espn} target="_blank" rel="noopener noreferrer">{book.name} on ESPN ↗</a></p>
      </section>
    </>
  );
}
