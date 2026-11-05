import React, { useEffect, useMemo, useRef, useState } from 'react';
import { get, post, useLoad, useStream, seedSeq, useMe, setMe, loadMe, can, go, query, setQuery, useRoute, ago, ymdLabel } from './api.js';
import { FeedCard, Details, Link, Avatar, TeamLogo, CatChip, StatusChip, Level, GameStrip, Reactions, Empty, ErrorBox, Loading, CATS, vLabel } from './components.jsx';

const LEVELS = [['medium', 'Notable'], ['high', 'High'], ['critical', 'Critical'], ['low', 'Everything']];
const FILTER_GROUPS = [
  ['All', ''], ['Records', 'record,milestone'], ['Game winners', 'game-winner,defensive-winner'], ['Comebacks', 'comeback,comeback-done'],
  ['Close games', 'close,overtime,clutch'], ['Runs', 'run,solo-run'], ['Breakouts', 'role-player,breakout,rookie'], ['Big lines', 'triple-double,scoring,defense,potn'], ['Streaks', 'streak'],
];

// ── Live Feed ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function FeedPage() {
  useRoute();
  const q = query();
  const { user } = useMe();
  const params = { action: 'list', category: q.category, level: q.level === 'low' ? null : q.level, team: q.team, player: q.player, game: q.game, favorites: q.mine, all: q.level === 'low' ? '1' : null };
  const key = JSON.stringify(params);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState([]);
  const [fresh, setFresh] = useState(new Set());
  const [more, setMore] = useState(true);
  const atTop = useRef(true);
  useEffect(() => {
    let off = false;
    setItems(null); setError(null); setPending([]);
    get('feed', params).then(j => { if (off) return; setItems(j.items); seedSeq(j.seq); setMore(j.items.length >= 30); }, e => !off && setError(e));
    return () => { off = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const f = () => { atTop.current = window.scrollY < 300; if (atTop.current && pending.length) flush(); }; window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); });
  const matches = e => {
    if (!e.published && q.level !== 'low') return false;
    if (q.category && !q.category.split(',').includes(e.category)) return false;
    if (q.team && !e.teams?.includes(q.team)) return false;
    if (q.player && !e.players?.some(p => p.id === q.player)) return false;
    if (q.game && e.game?.id !== q.game) return false;
    if (q.level && q.level !== 'low' && ['medium', 'high', 'critical'].indexOf(e.level) < ['medium', 'high', 'critical'].indexOf(q.level)) return false;
    if (q.mine === '1' && user?.prefs) { const p = user.prefs; if (!(p.teams?.some(t => e.teams?.includes(t)) || p.players?.some(x => e.players?.some(y => y.id === x)))) return false; }
    return true;
  };
  const place = (list, e) => {
    const i = list.findIndex(x => x._id === e._id);
    if (i >= 0 && !(new Date(e.sortAt) > new Date(list[i].sortAt))) { const n = list.slice(); n[i] = { ...list[i], ...e }; return n; }
    return [e, ...list.filter(x => x._id !== e._id)].sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt));
  };
  const flush = () => { setItems(list => pending.reduce((l, e) => place(l, e), list || [])); setFresh(new Set(pending.map(e => e._id))); setPending([]); setTimeout(() => setFresh(new Set()), 4000); };
  useStream(e => {
    if (!items) return;
    const known = items.some(x => x._id === e._id);
    if (!matches(e)) { if (known && !e.published) setItems(list => list.filter(x => x._id !== e._id)); return; }
    const moves = !known || new Date(e.sortAt) > new Date(items.find(x => x._id === e._id)?.sortAt || 0);
    if (!moves) { setItems(list => place(list, e)); return; }
    if (atTop.current) { setItems(list => place(list, e)); setFresh(s => new Set([...s, e._id])); setTimeout(() => setFresh(s => { const n = new Set(s); n.delete(e._id); return n; }), 4000); }
    else setPending(p => [e, ...p.filter(x => x._id !== e._id)]);
  });
  const loadMore = async () => {
    const last = items.at(-1);
    const j = await get('feed', { ...params, before: new Date(last.sortAt).toISOString() });
    setItems(list => [...list, ...j.items.filter(x => !list.some(y => y._id === x._id))]);
    setMore(j.items.length >= 30);
  };
  const filter = q.category || '';
  const [sel, setSel] = useState(null);
  const selected = sel || items?.[0] || null;
  return (
    <div className="feed-page">
      <h1 className="sr-only">Live Feed</h1>
      <div className="filters" role="toolbar" aria-label="Filter the feed">
        <div className="seg">{FILTER_GROUPS.map(([label, cats]) => <button key={label} type="button" className={filter === cats ? 'on' : ''} onClick={() => setQuery({ category: cats })}>{label}</button>)}</div>
        <div className="filter-row">
          <select aria-label="Importance" value={q.level || 'medium'} onChange={e => setQuery({ level: e.target.value === 'medium' ? '' : e.target.value })}>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <TeamFilter value={q.team} onChange={v => setQuery({ team: v })} />
          {user && <label className="check"><input type="checkbox" checked={q.mine === '1'} onChange={e => setQuery({ mine: e.target.checked ? '1' : '' })} /> My teams & players</label>}
          {(q.player || q.game) && <button type="button" className="chip clear" onClick={() => setQuery({ player: '', game: '' })}>Clear {q.game ? 'game' : 'player'} filter ×</button>}
        </div>
      </div>
      {pending.length > 0 && <button type="button" className="new-pill" onClick={() => { flush(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>↑ {pending.length} new {pending.length === 1 ? 'event' : 'events'}</button>}
      {error ? <ErrorBox error={error} /> : !items ? <Loading label="Loading the feed" /> : !items.length ? (
        <Empty title="Nothing here yet">{filter || q.team || q.player ? 'No events match these filters.' : "Today's stories show up here the moment they happen — no refresh needed. The feed starts fresh each game day."}</Empty>
      ) : (
        <div className="feed">
          {items.map(e => <FeedCard key={e._id} e={e} fresh={fresh.has(e._id)} selected={selected?._id === e._id} onSelect={setSel} onChange={n => setItems(list => list.map(x => (x._id === n._id ? n : x)))} />)}
          {more && <button type="button" className="btn ghost wide" onClick={loadMore}>Load earlier events</button>}
        </div>
      )}
      {selected && <Composer e={selected} onPosted={() => setItems(list => list.map(x => (x._id === selected._id ? { ...x, comments: (x.comments || 0) + 1 } : x)))} />}
    </div>
  );
}

// The conversation bar: comment on the selected event (tap a card to choose it).
function Composer({ e, onPosted }) {
  const { user } = useMe();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const send = async ev => {
    ev.preventDefault();
    if (!user) return go(`/signin?next=${encodeURIComponent('/')}`);
    if (!text.trim()) return;
    setBusy(true); setMsg(null);
    try { await post('feed', 'comment', { id: e._id, text }); setText(''); onPosted?.(); setMsg('Posted'); setTimeout(() => setMsg(null), 2500); } catch (x) { setMsg(x.message); } finally { setBusy(false); }
  };
  return (
    <form className="composer" onSubmit={send}>
      <Link to={`/e/${encodeURIComponent(e._id)}#comments`} className="composer-icon" aria-label="Open the conversation">💬</Link>
      <div className="composer-box">
        <small className="muted">{msg || <>Replying to <b>{e.title || e.headline}</b></>}</small>
        <input value={text} onChange={x => setText(x.target.value)} maxLength={500} placeholder={user ? 'Join the conversation…' : 'Sign in to join the conversation…'} aria-label="Comment on the selected event" onFocus={() => { if (!user) go('/signin?next=/'); }} />
      </div>
      <button className="composer-send" disabled={busy} aria-label="Post"><svg viewBox="0 0 24 24" className="icon"><path d="M4 12l16-8-6 16-2.5-6.5z" /></svg></button>
    </form>
  );
}

function TeamFilter({ value, onChange }) {
  const { data } = useLoad(() => get('nba', { action: 'teams' }), []);
  return <select aria-label="Team" value={value || ''} onChange={e => onChange(e.target.value)}><option value="">All teams</option>{(data || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>;
}

// ── One event, its context and comments ──────────────────────────────────────────────────────────────────────────
export function EntryPage({ id }) {
  const { data, error, reload, setData } = useLoad(() => get('feed', { action: 'entry', id }), [id]);
  const { user } = useMe();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useStream(e => { if (e._id === id) setData(d => d && ({ ...d, entry: { ...d.entry, ...e } })); });
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  const e = data.entry;
  const send = async ev => {
    ev.preventDefault(); setBusy(true); setErr(null);
    try { const c = await post('feed', 'comment', { id, text }); setData(d => ({ ...d, comments: [...d.comments, c], entry: { ...d.entry, comments: (d.entry.comments || 0) + 1 } })); setText(''); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const del = async c => { await post('feed', 'uncomment', { id: c._id }); setData(d => ({ ...d, comments: d.comments.filter(x => x._id !== c._id) })); };
  return (
    <div className="entry-page">
      <p className="crumbs"><Link to="/">← Live Feed</Link>{e.game?.id && <> · <Link to={`/games/${e.game.id}`}>Game context</Link></>}</p>
      <FeedCard e={e} open onChange={n => setData(d => ({ ...d, entry: n }))} />
      <section className="section graphic-preview">
        <h2>Graphic</h2>
        <img src={`/api/graphics?action=feed&id=${encodeURIComponent(e._id)}&format=x_landscape&scale=0.5`} alt={`Graphic: ${e.headline}`} loading="lazy" />
        <p className="small">Download: {[['x_landscape', 'X 16:9'], ['x_square', 'Square'], ['ig_portrait', 'Portrait 4:5'], ['ig_story', 'TikTok / Story 9:16']].map(([f, l], i) => <React.Fragment key={f}>{i ? ' · ' : ''}<a href={`/api/graphics?action=feed&id=${encodeURIComponent(e._id)}&format=${f}&f=jpeg`} download>{l}</a></React.Fragment>)}</p>
      </section>
      {can(user, 'editor') && (
        <div className="actions-row">
          {data.graphic ? <Link className="btn" to={`/studio/${data.graphic._id}`}>Open its graphic</Link>
            : <button className="btn" onClick={async () => { const r = await post('graphics', 'create', { feedId: e._id }); go(`/studio/${r.id}`); }}>Edit this graphic</button>}
        </div>
      )}
      {data.related.length > 0 && (
        <section className="section">
          <h2>More from this game</h2>
          <div className="mini-list">{data.related.map(r => <Link key={r._id} to={`/e/${encodeURIComponent(r._id)}`} className="mini"><CatChip cat={r.category} /><b>{r.headline}</b><span className="muted small">{r.game?.moment || ''}</span></Link>)}</div>
        </section>
      )}
      <section className="section" id="comments">
        <h2>Comments <span className="muted">{data.comments.length || ''}</span></h2>
        {data.comments.map(c => (
          <div key={c._id} className="comment">
            <span className="me-initial small">{c.name?.[0]?.toUpperCase()}</span>
            <div><b>{c.name}</b>{c.role !== 'fan' && <span className="chip tiny c-orange">{c.role}</span>} <span className="muted small">{ago(c.createdAt)}</span><p>{c.text}</p></div>
            {(c.mine || user?.role === 'owner') && <button type="button" className="linklike small" onClick={() => del(c)}>Delete</button>}
          </div>
        ))}
        {user ? (
          <form className="comment-form" onSubmit={send}>
            <textarea value={text} onChange={x => setText(x.target.value)} maxLength={500} rows={2} placeholder="Add to the conversation" aria-label="Comment" />
            <button className="btn" disabled={busy || !text.trim()}>Post</button>
            {err && <p className="error-text">{err}</p>}
          </form>
        ) : <p className="muted"><Link to={`/signin?next=${encodeURIComponent(location.pathname)}`}>Sign in</Link> to react and comment.</p>}
      </section>
    </div>
  );
}

// ── Game context: score, situation, the game's stories in order, the key players ──────────────────────────────────
export function GamePage({ id }) {
  const { data, error, reload, setData } = useLoad(() => get('nba', { action: 'game', id }), [id]);
  useEffect(() => { if (data && data.game.status !== 'final' && data.game.status !== 'scheduled') { const t = setInterval(reload, 20000); return () => clearInterval(t); } }, [data?.game?.status]); // eslint-disable-line
  useStream(e => { if (e.game?.id === id) setData(d => d && ({ ...d, feed: [...d.feed.filter(x => x._id !== e._id), e] })); });
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  const g = data.game;
  const live = !['final', 'scheduled', 'postponed', 'canceled'].includes(g.status);
  const stories = data.feed.filter(e => e.published || e.level !== 'low').sort((a, b) => new Date(b.occurredAt || b.updatedAt) - new Date(a.occurredAt || a.updatedAt));
  return (
    <div className="game-page">
      <div className="scoreboard-hero">
        {g.teams.map((t, i) => (
          <Link key={t.id} to={`/teams/${t.id}`} className={`sb-team ${t.winner ? 'won' : ''}`}>
            <TeamLogo src={t.logo} abbr={t.abbr} size={64} /><span className="sb-name">{t.name}</span><span className="sb-rec muted small">{t.record}</span>
            <span className="sb-score">{t.score ?? '–'}</span>
          </Link>
        ))}
        <div className="sb-mid">
          {live ? <span className="chip live"><i className="dot" />{g.detail}</span> : <span className="chip">{g.status === 'final' ? `Final${g.ot ? ` / ${g.ot > 1 ? g.ot : ''}OT` : ''}` : g.detail}</span>}
          {data.situation?.label && live && <span className="chip c-red">{data.situation.label}</span>}
          {g.teams[0].linescores?.length > 0 && (
            <table className="linescore"><thead><tr><th />{g.teams[0].linescores.map((_, i) => <th key={i}>{i < 4 ? i + 1 : `OT${i > 4 ? i - 3 : ''}`}</th>)}</tr></thead>
              <tbody>{g.teams.map(t => <tr key={t.id}><th>{t.abbr}</th>{t.linescores.map((v, i) => <td key={i}>{v}</td>)}</tr>)}</tbody></table>
          )}
          <p className="muted small">{data.verify ? vLabel(data.verify.status) : live ? 'Live data — not final' : ''} · updated {ago(data.fetchedAt)} · <a href={data.url} target="_blank" rel="noreferrer">ESPN</a></p>
        </div>
      </div>
      <section className="section">
        <h2>The story of this game</h2>
        {stories.length ? <div className="feed">{stories.map(e => <FeedCard key={e._id} e={e} />)}</div> : <Empty title="No stories yet">{live ? 'The engine is watching this game.' : 'Nothing in this game crossed the bar for the feed.'}</Empty>}
      </section>
      {live && data.lastPlays?.length > 0 && <section className="section"><h2>Latest plays</h2><ul className="plays">{data.lastPlays.map((p, i) => <li key={i}><span className="muted">{p.period > 4 ? 'OT' : `Q${p.period}`} {p.clock}</span> {p.text} <b>{p.score}</b></li>)}</ul></section>}
      <section className="section">
        <h2>Key players</h2>
        <div className="key-players">
          {data.players.map(side => (
            <div key={side.team}><h4>{side.team}</h4>
              {side.list.slice(0, 5).map(p => <Link key={p.id} to={`/players/${p.id}`} className="kp"><Avatar src={p.headshot} name={p.name} size={34} /><span><b>{p.name}</b><br /><span className="muted small">{p.line.pts} PTS · {p.line.reb} REB · {p.line.ast} AST · {p.line.fgm}-{p.line.fga} FG · {p.line.min} MIN</span></span></Link>)}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Game Intelligence ────────────────────────────────────────────────────────────────────────────────────────────
const SECTIONS = [['close', 'Close Games'], ['comeback', 'Comeback Watch'], ['runs', 'Scoring Runs'], ['solo', 'Solo Runs'], ['clutch', 'Clutch Situations'], ['blowout', 'Blowout Watch'], ['collapse', 'Collapse Watch'], ['historic', 'Historic Performances']];
export function IntelPage() {
  const { data, error, reload, setData } = useLoad(() => get('feed', { action: 'intel' }), []);
  useEffect(() => { const t = setInterval(reload, 30000); return () => clearInterval(t); }, [reload]);
  const due = useRef(null);
  useStream(() => { if (!due.current) due.current = setTimeout(() => { due.current = null; reload(); }, 1500); });
  useEffect(() => () => clearTimeout(due.current), []);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div className="intel-page">
      <div className="page-head"><h1>Game Intelligence</h1><p className="muted">What the engine sees in every game: close finishes, comebacks, runs, takeovers. Developing situations are marked live; nothing is final until the game is.</p></div>
      {data.live.length > 0 && (
        <div className="live-grid">
          {data.live.map(g => (
            <Link key={g.id} to={`/games/${g.id}`} className={`live-game lvl${g.situation?.level || 0}`}>
              <span className="lg-teams">{g.teams.map(t => <span key={t.id}><TeamLogo src={t.logo} abbr={t.abbr} size={18} /> {t.abbr} <b>{t.score}</b></span>)}</span>
              <span className="chip live"><i className="dot" />{g.detail}</span>
              {g.situation?.label && <span className="chip c-red">{g.situation.label}</span>}
              {g.lastPlay && <span className="muted small">{g.lastPlay}</span>}
            </Link>
          ))}
        </div>
      )}
      {SECTIONS.map(([k, label]) => {
        const list = data.sections[k] || [];
        return (
          <section key={k} className="section intel-section">
            <h2>{label} <span className="muted">{list.length || ''}</span></h2>
            {list.length ? <div className="mini-list">{list.slice(0, 12).map(e => (
              <Link key={e._id} to={`/e/${encodeURIComponent(e._id)}`} className={`mini lvl-${e.level}`}>
                <StatusChip e={e} /><Level level={e.level} /><b>{e.headline}</b>
                <span className="mini-body">{e.body}</span>
                <span className="muted small">{e.game?.teams?.map(t => `${t.abbr} ${t.score ?? ''}`).join(' – ')} · {e.game?.moment || e.game?.label} · detected {ago(e.createdAt)}</span>
              </Link>
            ))}</div> : <p className="muted small">Nothing tonight.</p>}
          </section>
        );
      })}
    </div>
  );
}

// ── Records & Milestones ─────────────────────────────────────────────────────────────────────────────────────────
export function RecordsPage() {
  const { data, error, reload } = useLoad(() => get('records', { action: 'overview' }), []);
  const [term, setTerm] = useState(query().term || '');
  const [cat, setCat] = useState('');
  const { data: found } = useLoad(() => get('records', { action: 'search', term, category: cat }), [term, cat]);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div className="records-page">
      <div className="page-head"><h1>Records & Milestones</h1>
        <p className="muted">{data.coverage ? `Record lists are computed from every box score since ${data.coverage.from - 1}-${String(data.coverage.from % 100).padStart(2, '0')} (${data.coverage.games?.toLocaleString('en-US')} verified games). They are box-score-era records — not all-time NBA records, which need a sourced reference.` : 'Record lists are being built from the historical box scores.'}</p>
      </div>
      <section className="section">
        <h2>Recent records and milestones</h2>
        {data.recent.length ? <div className="feed">{data.recent.slice(0, 10).map(e => <FeedCard key={e._id} e={e} />)}</div> : <p className="muted">No records or milestones yet this season.</p>}
      </section>
      {data.watch.length > 0 && (
        <section className="section">
          <h2>Milestone watch</h2>
          <div className="watch-grid">{data.watch.map(w => (
            <Link key={`${w.pid}${w.stat}`} to={`/players/${w.pid}`} className="watch">
              <Avatar src={w.headshot} name={w.name} size={44} />
              <span><b>{w.name}</b><br /><span className="small">{w.togo.toLocaleString('en-US')} {w.label?.toLowerCase()} from {w.next.toLocaleString('en-US')}</span><br /><span className="muted small">about {w.games} game{w.games === 1 ? '' : 's'} at {w.pace} per game · ESPN totals</span></span>
            </Link>
          ))}</div>
        </section>
      )}
      <section className="section">
        <h2>Search the record database</h2>
        <div className="filter-row">
          <input type="search" placeholder="e.g. most points rookie, Lakers threes, youngest triple-double" value={term} onChange={e => setTerm(e.target.value)} aria-label="Search records" />
          <select value={cat} onChange={e => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{data.categories.map(c => <option key={c}>{c}</option>)}</select>
        </div>
        <div className="record-grid">
          {(found?.lists || []).map(r => (
            <Link key={r._id} to={`/records/${encodeURIComponent(r._id)}`} className="record">
              <span className="chip c-orange tiny">{r.category}</span><b>{r.title}</b><span className="muted small">{r.scopeLabel}</span>
              {r.entries?.[0] && <span className="rec-top"><em>{r.entries[0].v}</em> {r.entries[0].name}{r.entries[0].date ? ` · ${ymdLabel(r.entries[0].date)}` : ''}</span>}
            </Link>
          ))}
          {(found?.references || []).map(r => (
            <div key={r._id} className="record ref"><span className="chip c-gold tiny">Reference{r.verified ? ' · verified' : ' · unverified'}</span><b>{r.title}</b><span className="rec-top"><em>{r.value}</em> {r.holder}{r.date ? ` · ${r.date}` : ''}</span><a className="small" href={r.sourceUrl} target="_blank" rel="noreferrer">Source</a></div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function RecordListPage({ id }) {
  const { data, error, reload } = useLoad(() => get('records', { action: 'list', id }), [id]);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div className="record-page">
      <p className="crumbs"><Link to="/records">← Records & Milestones</Link></p>
      <div className="page-head"><span className="chip c-orange">{data.category}</span><h1>{data.title}</h1><p className="muted">{data.scopeLabel}</p></div>
      <table className="table">
        <thead><tr><th>#</th><th>{data.kind === 'age' ? 'Age' : data.kind === 'streak' ? 'Games' : 'Value'}</th><th>{data.kind === 'team' ? 'Team' : 'Player'}</th><th>Game</th><th>Date</th></tr></thead>
        <tbody>{data.entries.map((r, i) => (
          <tr key={`${r.gid}${r.pid}${i}`}><td>{i + 1}</td><td><b>{data.kind === 'age' ? `${Math.floor(r.v)}y ${Math.round((r.v % 1) * 365)}d` : r.v}</b></td>
            <td>{r.pid ? <Link to={`/players/${r.pid}`}>{r.name}</Link> : r.name} <span className="muted">{r.team}</span></td>
            <td>{r.opp ? `vs ${r.opp}` : r.start ? `${ymdLabel(r.start)} – ` : ''}{r.gid && /^\d+$/.test(r.gid) ? <> · <Link to={`/games/${r.gid}`}>game</Link></> : ''}</td><td>{r.kind === 'season' ? r.season : ymdLabel(r.date)}</td></tr>
        ))}</tbody>
      </table>
      <p className="muted small">Source: {data.source?.provider} — {data.source?.method}. Coverage {data.coverage?.firstDate} to {data.coverage?.lastDate}. Each game links to its box score.</p>
      {data.feed?.length > 0 && <section className="section"><h2>In the feed</h2><div className="feed">{data.feed.map(e => <FeedCard key={e._id} e={e} />)}</div></section>}
    </div>
  );
}

// ── Top Performances ─────────────────────────────────────────────────────────────────────────────────────────────
export function PerformancesPage() {
  useRoute();
  const date = query().date;
  const { data, error, reload } = useLoad(() => get('feed', { action: 'performances', date }), [date]);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div className="perf-page">
      <div className="page-head"><h1>Top Performances</h1><p className="muted">Ranked by impact, not points: efficiency, defense, clutch play, winning, and how far beyond a player's usual role the night went.</p></div>
      <div className="filter-row"><select value={data.date || ''} onChange={e => setQuery({ date: e.target.value })} aria-label="Night">{data.dates.map(d => <option key={d} value={d}>{ymdLabel(d)}</option>)}</select></div>
      {!data.items.length ? <Empty title="No performances yet">They appear as soon as games are under way.</Empty> : (
        <ol className="perf-list">{data.items.map((p, i) => (
          <li key={p._id} className={`perf ${p.potn ? 'potn' : ''}`}>
            <span className="rank">{i + 1}</span>
            <Link to={`/players/${p.pid}`}><Avatar src={p.headshot} name={p.name} color={p.team?.color} size={56} /></Link>
            <div>
              <h3><Link to={`/players/${p.pid}`}>{p.name}</Link> <span className="muted">{p.team?.abbr} vs {p.opp?.abbr}</span>{p.potn && <span className="chip c-gold tiny">Performance of the Night</span>}{p.state === 'live' && <span className="chip live tiny"><i className="dot" />{p.clock}</span>}</h3>
              <p className="statline">{p.statLine} · {p.splits}</p>
              <p className="muted">{p.angle}</p>
              <p className="tags">{p.tags.filter(t => t.weight > 0).slice(0, 4).map(t => <span key={t.key} className="chip tiny">{t.label}</span>)}</p>
              {p.feedId && <Link to={`/e/${encodeURIComponent(p.feedId)}`} className="small">Open in the feed →</Link>}
            </div>
          </li>
        ))}</ol>
      )}
    </div>
  );
}

// ── Teams ────────────────────────────────────────────────────────────────────────────────────────────────────────
export function TeamsPage() {
  const { data, error, reload } = useLoad(() => get('nba', { action: 'teams' }), []);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div><div className="page-head"><h1>Teams</h1></div>
      <div className="team-grid">{data.map(t => <Link key={t.id} to={`/teams/${t.id}`} className="team-tile" style={{ '--tc': t.color }}><TeamLogo src={t.logo} abbr={t.abbr} size={44} /><b>{t.name}</b></Link>)}</div>
    </div>
  );
}

export function TeamPage({ id }) {
  const { data, error, reload } = useLoad(() => get('nba', { action: 'team', id }), [id]);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  const t = data.team;
  return (
    <div className="team-page">
      <div className="hero" style={{ '--tc': t.color }}>
        <TeamLogo src={t.logo} abbr={t.abbr} size={88} />
        <div><h1>{t.name}</h1><p className="muted">{t.record}{t.standing ? ` · ${t.standing}` : ''}{data.streak ? ` · ${data.streak.n}-game ${data.streak.type === 'W' ? 'winning' : 'losing'} streak` : ''}</p>
          <FavButton kind="teams" id={t.id} /></div>
      </div>
      {data.results.length > 0 && <div className="results">{data.results.map(r => <Link key={r.id} to={`/games/${r.id}`} className={`result ${r.won ? 'w' : 'l'}`} title={ymdLabel(r.date)}><b>{r.won ? 'W' : 'L'}</b><span>{r.us.score}-{r.opp.score}</span><small>{r.opp.abbr}</small></Link>)}</div>}
      <section className="section"><h2>Storylines</h2>{data.feed.length ? <div className="feed">{data.feed.map(e => <FeedCard key={e._id} e={e} />)}</div> : <p className="muted">No stories yet this season.</p>}</section>
      {data.performances.length > 0 && <section className="section"><h2>Noteworthy performances</h2><div className="mini-list">{data.performances.map(p => <Link key={p.id} to={`/players/${p.pid}`} className="mini"><Avatar src={p.headshot} name={p.name} size={30} /><b>{p.name}</b><span className="small">{p.line} vs {p.opp}</span><span className="muted small">{ymdLabel(p.date)} · {p.tags.join(' · ')}</span></Link>)}</div></section>}
    </div>
  );
}

// ── Players ──────────────────────────────────────────────────────────────────────────────────────────────────────
export function PlayersPage() {
  const [term, setTerm] = useState('');
  const { data } = useLoad(() => (term.trim().length >= 2 ? get('nba', { action: 'search', term }) : Promise.resolve(null)), [term]);
  return (
    <div><div className="page-head"><h1>Players</h1></div>
      <input className="big-search" type="search" autoFocus placeholder="Search any player" value={term} onChange={e => setTerm(e.target.value)} aria-label="Search players" />
      <div className="player-grid">{(data?.players || []).map(p => <Link key={p.id} to={`/players/${p.id}`} className="player-tile"><Avatar src={p.headshot} name={p.name} size={56} /><b>{p.name}</b><span className="muted small">{p.team || ''} {p.pos || ''}</span></Link>)}</div>
      {!term && <p className="muted">Search by name. Each player's page shows the season so far and every Around the NBA story about them.</p>}
    </div>
  );
}

export function PlayerPage({ id }) {
  const { data, error, reload } = useLoad(() => get('nba', { action: 'player', id }), [id]);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  const p = data.player, s = data.season.averages;
  return (
    <div className="player-page">
      <div className="hero" style={{ '--tc': p.team?.color }}>
        <Avatar src={p.headshot} name={p.name} color={p.team?.color} size={112} />
        <div>
          <h1>{p.name}</h1>
          <p className="muted">{[p.team && <Link key="t" to={`/teams/${p.team.id}`}>{p.team.name}</Link>, p.pos, p.jersey && `#${p.jersey}`, p.age && `${p.age} years old`, p.country].filter(Boolean).reduce((a, x, i) => [...a, i ? ' · ' : '', x], [])}</p>
          <p className="muted small">{[p.height, p.weight, p.college, p.draft ? `Drafted ${p.draft.year}, round ${p.draft.round}, pick ${p.draft.pick}` : p.debut ? 'Undrafted' : null].filter(Boolean).join(' · ')}</p>
          <FavButton kind="players" id={id} />
        </div>
      </div>
      {s && (
        <div className="season-strip">
          <span><b>{s.pts}</b><small>PTS</small></span><span><b>{s.reb}</b><small>REB</small></span><span><b>{s.ast}</b><small>AST</small></span>
          <span><b>{s.ts_pct ?? '–'}</b><small>TS%</small></span><span><b>{s.gp}</b><small>GAMES</small></span><span><b>{s.starts}</b><small>STARTS</small></span>
          {data.season.last5 && <span className="muted small">Last 5: {data.season.last5.pts} / {data.season.last5.reb} / {data.season.last5.ast}</span>}
        </div>
      )}
      <section className="section"><h2>In the feed</h2>{data.feed.length ? <div className="feed">{data.feed.map(e => <FeedCard key={e._id} e={e} />)}</div> : <p className="muted">No Around the NBA stories about {p.name} yet.</p>}</section>
      {data.recent.length > 0 && <section className="section"><h2>Recent games</h2><div className="mini-list">{data.recent.map(g => <Link key={g.gid} to={`/games/${g.gid}`} className="mini row"><b>{ymdLabel(g.date)}</b><span>{g.won ? 'W' : 'L'} vs {g.opp}</span><span className="small">{g.line.pts} PTS · {g.line.reb} REB · {g.line.ast} AST · {g.line.fgm}-{g.line.fga} FG</span></Link>)}</div></section>}
      <section className="section">
        <h2>Career</h2>
        <p>{data.career?.totals ? `${data.career.totals.pts?.toLocaleString('en-US')} points, ${data.career.totals.reb?.toLocaleString('en-US')} rebounds, ${data.career.totals.ast?.toLocaleString('en-US')} assists in ${data.career.totals.gp} regular-season games over ${data.career.seasons} seasons.` : 'No career statistics.'}
          {data.highs && <> Career highs in the database: {data.highs.pts} points, {data.highs.reb} rebounds, {data.highs.ast} assists ({data.highs.games} games).</>}</p>
        {data.career?.source && <p className="muted small">Career totals: <a href={data.career.source} target="_blank" rel="noreferrer">ESPN</a></p>}
      </section>
    </div>
  );
}

function FavButton({ kind, id }) {
  const { user } = useMe();
  if (!user) return null;
  const list = user.prefs?.[kind] || [];
  const on = list.includes(id);
  const toggle = async () => {
    const prefs = { ...(user.prefs || {}), [kind]: on ? list.filter(x => x !== id) : [...list, id] };
    const r = await post('admin', 'prefs', { prefs });
    setMe({ ...user, prefs: r.prefs });
  };
  return <button type="button" className={`btn small ${on ? '' : 'ghost'}`} onClick={toggle}>{on ? '★ Favorite' : '☆ Add to favorites'}</button>;
}

// ── Sign in / sign up / first-time setup ─────────────────────────────────────────────────────────────────────────
export function SignInPage() {
  const me = useMe();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ email: '', password: '', name: '', code: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const setup = me.setupNeeded;
  const submit = async e => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const r = await post('admin', setup ? 'setup' : mode, f);
      setMe(r.user); await loadMe();
      go(query().next || '/');
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const field = (k, label, type = 'text', extra = {}) => <label className="field"><span>{label}</span><input type={type} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} required {...extra} /></label>;
  return (
    <div className="auth">
      <h1>{setup ? 'Set up Around the NBA' : mode === 'login' ? 'Sign in' : 'Join Around the NBA'}</h1>
      <p className="muted">{setup ? 'Create the owner account with the setup code you were given.' : mode === 'login' ? 'React to moments, comment, and follow your teams and players.' : 'Free. Pick a display name — it shows on your comments.'}</p>
      <form onSubmit={submit} className="form">
        {setup && field('code', 'Setup code', 'text', { autoComplete: 'off' })}
        {(setup || mode === 'signup') && field('name', 'Display name', 'text', { maxLength: 40 })}
        {field('email', 'Email', 'email', { autoComplete: 'email' })}
        {field('password', 'Password (10+ characters)', 'password', { autoComplete: mode === 'login' ? 'current-password' : 'new-password', minLength: setup || mode === 'signup' ? 10 : undefined })}
        {err && <p className="error-text">{err}</p>}
        <button className="btn wide" disabled={busy}>{setup ? 'Create owner account' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
      {!setup && <p className="muted">{mode === 'login' ? <>New here? <button className="linklike" onClick={() => setMode('signup')}>Create an account</button></> : <>Have an account? <button className="linklike" onClick={() => setMode('login')}>Sign in</button></>}</p>}
    </div>
  );
}

export { SettingsPage } from './settings.jsx';
