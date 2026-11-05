// The Live Feed as a stream chat: the night's stories and fans' messages in one running column, newest at the bottom.
// It follows the bottom while you're there; scroll up and it pauses ("N new" takes you back down). Every story carries
// its picture: the graphic rendered from the story's own data (the same one the Graphics Studio and the agent use).
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { get, post, useStream, useChat, seedSeq, useMe, go, query, setQuery, useRoute, clockTime, can } from './api.js';
import { Link, TeamLogo, CatChip, StatusChip, Reactions, Details, GameStrip, Empty, ErrorBox, Loading, CATS, TEAM_STORY } from './components.jsx';
import { TeamFilter } from './pages.jsx';

const LEVELS = [['medium', 'Notable'], ['high', 'High'], ['critical', 'Critical'], ['low', 'Everything']];
const FILTER_GROUPS = [
  ['All', ''], ['Records', 'record,milestone'], ['Game winners', 'game-winner,defensive-winner'], ['Comebacks', 'comeback,comeback-done'],
  ['Close games', 'close,overtime,clutch'], ['Runs', 'run,solo-run'], ['Breakouts', 'role-player,breakout,rookie'], ['Big lines', 'triple-double,scoring,defense,potn'], ['Streaks', 'streak'],
];
const at = x => new Date(x.kind === 'msg' ? x.createdAt : x.sortAt || x.occurredAt || x.updatedAt).getTime();
const NAME_COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#22d3ee', '#fb923c', '#a3e635', '#e879f9'];
const nameColor = s => NAME_COLORS[[...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % NAME_COLORS.length];
export const pictureUrl = (e, format = 'x_landscape') => `/api/graphics?action=feed&id=${encodeURIComponent(e._id)}&format=${format}&f=jpeg&scale=0.5&v=${e.seq || 0}`;

export function FeedPage() {
  useRoute();
  const q = query();
  const { user } = useMe();
  const params = { action: 'list', limit: 60, category: q.category, level: q.level === 'low' ? null : q.level, team: q.team, player: q.player, game: q.game, favorites: q.mine, all: q.level === 'low' ? '1' : null };
  const key = JSON.stringify(params);
  const [events, setEvents] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [error, setError] = useState(null);
  const [more, setMore] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [fresh, setFresh] = useState(new Set());
  const [reply, setReply] = useState(null);
  const box = useRef(null), stuck = useRef(true), keep = useRef(null);
  const chatOn = !q.category && !q.team && !q.player && !q.game && q.mine !== '1';

  useEffect(() => {
    let off = false;
    setEvents(null); setError(null); setUnseen(0); stuck.current = true;
    Promise.all([get('feed', params), chatOn ? get('feed', { action: 'chat' }).catch(() => ({ items: [] })) : { items: [] }]).then(([j, c]) => {
      if (off) return;
      setEvents(j.items); setMsgs(c.items); seedSeq(j.seq); setMore(j.items.length >= 60);
    }, e => !off && setError(e));
    return () => { off = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const arrived = id => {
    if (!stuck.current) setUnseen(n => n + 1);
    setFresh(s => new Set([...s, id]));
    setTimeout(() => setFresh(s => { const n = new Set(s); n.delete(id); return n; }), 4000);
  };
  useStream(e => {
    if (!events) return;
    const known = events.find(x => x._id === e._id);
    if (!matches(e)) { if (known) setEvents(list => list.filter(x => x._id !== e._id)); return; }
    setEvents(list => [...list.filter(x => x._id !== e._id), { ...known, ...e }]);
    if (!known || new Date(e.sortAt) > new Date(known.sortAt)) arrived(e._id);
  });
  useChat(m => {
    if (!chatOn) return;
    if (m.deleted) { setMsgs(list => list.filter(x => x._id !== m._id)); return; }
    setMsgs(list => {
      if (list.some(x => x._id === m._id)) return list;
      if (!(m.uid && m.uid === user?._id)) arrived(m._id);
      return [...list, m];
    });
  });

  // One running column, oldest first.
  const rows = useMemo(() => [...(events || []).map(e => ({ ...e, kind: 'event' })), ...msgs.map(m => ({ ...m, kind: 'msg' }))].sort((a, b) => at(a) - at(b)), [events, msgs]);

  // Follow the bottom while the reader is there; keep the reader's place when earlier items are added on top.
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    if (keep.current != null) { el.scrollTop = el.scrollHeight - keep.current; keep.current = null; return; }
    if (stuck.current) el.scrollTop = el.scrollHeight;
  }, [rows]);
  const onScroll = () => {
    const el = box.current; if (!el) return;
    stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (stuck.current) setUnseen(0);
  };
  const toBottom = () => { const el = box.current; if (el) { el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); stuck.current = true; setUnseen(0); } };
  const onPicture = () => { if (stuck.current && box.current) box.current.scrollTop = box.current.scrollHeight; };
  const loadEarlier = async () => {
    const first = events?.[0] && [...events].sort((a, b) => at(a) - at(b))[0];
    if (!first) return;
    const j = await get('feed', { ...params, before: new Date(first.sortAt).toISOString() });
    keep.current = box.current.scrollHeight - box.current.scrollTop;
    setEvents(list => [...j.items.filter(x => !list.some(y => y._id === x._id)), ...list]);
    setMore(j.items.length >= 60);
  };
  const posted = m => setMsgs(list => (list.some(x => x._id === m._id) ? list : [...list, m]));
  const filter = q.category || '';

  return (
    <div className="chat-page">
      <h1 className="sr-only">Live Feed</h1>
      <div className="chat-head" role="toolbar" aria-label="Filter the feed">
        <div className="seg">{FILTER_GROUPS.map(([label, cats]) => <button key={label} type="button" className={filter === cats ? 'on' : ''} onClick={() => setQuery({ category: cats })}>{label}</button>)}</div>
        <div className="filter-row">
          <select aria-label="Importance" value={q.level || 'medium'} onChange={e => setQuery({ level: e.target.value === 'medium' ? '' : e.target.value })}>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <TeamFilter value={q.team} onChange={v => setQuery({ team: v })} />
          {user && <label className="check"><input type="checkbox" checked={q.mine === '1'} onChange={e => setQuery({ mine: e.target.checked ? '1' : '' })} /> Mine</label>}
          {(q.player || q.game) && <button type="button" className="chip clear" onClick={() => setQuery({ player: '', game: '' })}>Clear {q.game ? 'game' : 'player'} ×</button>}
        </div>
      </div>
      <div className="chat-scroll" ref={box} onScroll={onScroll} aria-live="polite" aria-relevant="additions">
        {error ? <ErrorBox error={error} /> : !events ? <Loading label="Loading the feed" /> : !rows.length ? (
          <Empty title="Quiet so far">{filter || q.team || q.player ? 'No stories match these filters yet.' : "Tonight's stories land here the second they happen, with a picture for each. Say something below — everyone watching sees it live."}</Empty>
        ) : (
          <>
            {more && <button type="button" className="btn ghost wide earlier" onClick={loadEarlier}>Load earlier stories</button>}
            {!more && <p className="chat-start">Start of today's feed · it clears an hour before tomorrow's first game</p>}
            {rows.map(x => (x.kind === 'msg'
              ? <FanMsg key={`m${x._id}`} m={x} fresh={fresh.has(x._id)} user={user} onRemoved={id => setMsgs(l => l.filter(y => y._id !== id))} />
              : <EventMsg key={x._id} e={x} fresh={fresh.has(x._id)} onPicture={onPicture} onReply={chatOn ? setReply : null} onChange={n => setEvents(list => list.map(y => (y._id === n._id ? { ...y, ...n } : y)))} />))}
          </>
        )}
      </div>
      {unseen > 0 && <button type="button" className="chat-paused" onClick={toBottom}>Feed paused · {unseen} new ↓</button>}
      {chatOn ? <Composer reply={reply} onClear={() => setReply(null)} onPosted={posted} /> : <p className="chat-note muted small">Chat is on the full feed — clear the filters to join in.</p>}
    </div>
  );
}

// A story, as a chat message from the feed: who it's about, the headline, a line of context, and its picture.
function EventMsg({ e, fresh, onPicture, onReply, onChange }) {
  const [open, setOpen] = useState(false);
  const [bad, setBad] = useState(false);
  const [, color] = CATS[e.category] || [null, 'gray'];
  const teamStory = TEAM_STORY.has(e.category);
  const p = !teamStory ? e.players?.[0] : null;
  const t = e.team || e.game?.teams?.[0];
  const who = p?.name || e.team?.name || (e.game?.teams?.length ? e.game.teams.map(x => x.abbr).join(' vs ') : 'Around the NBA');
  const whoColor = e.team?.color || (p && e.game?.teams?.find(x => x.abbr === p.team)?.color) || null;
  return (
    <article className={`ev msg ev-msg lvl-${e.level} p-${color} ${fresh ? 'fresh' : ''}`} id={`e-${e._id}`}>
      <time className="msg-time" dateTime={new Date(e.occurredAt || e.updatedAt).toISOString()}>{clockTime(e.occurredAt || e.updatedAt)}</time>
      <span className="msg-av" style={{ '--ring': whoColor ? `#${String(whoColor).replace('#', '')}` : 'var(--line-2)' }}>
        {p?.headshot && !bad ? <img src={p.headshot} alt="" loading="lazy" onError={() => setBad(true)} /> : t?.logo ? <TeamLogo src={t.logo} abbr={t.abbr} size={30} quiet /> : <b>{(who || '?').slice(0, 1)}</b>}
      </span>
      <div className="msg-main">
        <div className="msg-line">
          <CatChip cat={e.category} label={e.headline} />
          {e.level === 'critical' && <span className="badge-crit" title="Critical">●</span>}
          <b className="msg-name" style={whoColor ? { '--nc': `#${String(whoColor).replace('#', '')}` } : undefined}>{who}</b>
          {e.status === 'developing' ? <span className="live-tag"><i className="dot" />LIVE</span> : <StatusChip e={e} />}
        </div>
        <p className="msg-text"><Link to={`/e/${encodeURIComponent(e._id)}`}>{e.title || e.headline}</Link></p>
        {(e.aiBody || e.body) && <p className="msg-sub">{e.aiBody || e.body}</p>}
        <Link to={`/e/${encodeURIComponent(e._id)}`} className="msg-pic" aria-label={`Open: ${e.title || e.headline}`}>
          <img src={pictureUrl(e)} alt={`Graphic: ${e.title || e.headline}`} loading="lazy" width="800" height="450" onLoad={onPicture} onError={ev => { ev.currentTarget.parentElement.style.display = 'none'; }} />
        </Link>
        <div className="msg-actions">
          {!teamStory && <GameStrip game={e.game} compact />}
          <Reactions e={e} onChange={onChange} />
          {onReply && <button type="button" className="foot-btn" onClick={() => onReply(e)}>Reply</button>}
          <button type="button" className="foot-btn" aria-expanded={open} onClick={() => setOpen(x => !x)}>{open ? 'Less' : 'Details'}</button>
          {e.aiBody && <span className="ai-note" title={`Written by ${e.ai?.model || 'AI'} from the facts`}>AI-written</span>}
        </div>
        {open && <Details e={e} />}
      </div>
    </article>
  );
}

// A fan's message.
function FanMsg({ m, fresh, user, onRemoved }) {
  const mine = user && m.uid === user._id;
  const mod = m.role === 'owner' || m.role === 'editor';
  const remove = async () => { try { await post('feed', 'uncomment', { id: m._id }); onRemoved(m._id); } catch { /* the stream will catch up */ } };
  const jump = () => { const el = document.getElementById(`e-${m.reply.id}`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1500); } else go(`/e/${encodeURIComponent(m.reply.id)}`); };
  return (
    <div className={`msg fan-msg ${fresh ? 'fresh' : ''} ${mine ? 'mine' : ''}`}>
      <time className="msg-time">{clockTime(m.createdAt)}</time>
      <div className="msg-main">
        {m.reply && <button type="button" className="msg-reply" onClick={jump}>↳ {m.reply.title}</button>}
        <p className="msg-text fan">
          {mod && <span className="badge-mod" title={m.role === 'owner' ? 'Owner' : 'Editor'}>{m.role === 'owner' ? 'HOST' : 'MOD'}</span>}
          <b className="msg-name" style={{ color: nameColor(m.name) }}>{m.name}</b><span className="colon">:</span> {m.text}
          {(mine || can(user, 'editor')) && <button type="button" className="msg-del" onClick={remove} aria-label="Delete message">×</button>}
        </p>
      </div>
    </div>
  );
}

function Composer({ reply, onClear, onPosted }) {
  const { user } = useMe();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  useEffect(() => { if (reply) input.current?.focus(); }, [reply]);
  const send = async ev => {
    ev.preventDefault();
    if (!user) return go(`/signin?next=${encodeURIComponent('/')}`);
    if (!text.trim()) return;
    setBusy(true); setMsg(null);
    try { const m = await post('feed', 'comment', { id: reply?._id, text }); setText(''); onClear(); onPosted(m); } catch (x) { setMsg(x.message); setTimeout(() => setMsg(null), 3500); } finally { setBusy(false); }
  };
  return (
    <form className="composer chat-composer" onSubmit={send}>
      <div className="composer-box">
        {(reply || msg) && <small className={msg ? 'err' : 'muted'}>{msg || <>Replying to <b>{reply.title || reply.headline}</b> <button type="button" className="link" onClick={onClear} aria-label="Cancel reply">✕</button></>}</small>}
        <input ref={input} value={text} onChange={x => setText(x.target.value)} maxLength={500} placeholder={user ? 'Send a message' : 'Sign in to chat'} aria-label="Chat message" onFocus={() => { if (!user) go('/signin?next=/'); }} />
      </div>
      <button className="composer-send" disabled={busy || !text.trim()} aria-label="Send"><svg viewBox="0 0 24 24" className="icon"><path d="M4 12l16-8-6 16-2.5-6.5z" /></svg></button>
    </form>
  );
}
