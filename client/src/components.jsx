// Shared pieces: the event card (the heart of the product), the logo, chips, avatars, reactions, empty and error states.
import React, { useState } from 'react';
import { go, ago, post, useMe, ApiError, clockTime } from './api.js';

// Category → label and color (the colors carry meaning across the app).
export const CATS = {
  record: ['Record', 'green'], milestone: ['Milestone', 'gold'], 'game-winner': ['Game winner', 'red'], 'defensive-winner': ['Defensive game winner', 'blue'],
  comeback: ['Comeback watch', 'orange'], 'comeback-done': ['Comeback complete', 'orange'], close: ['Close game', 'blue'], overtime: ['Overtime', 'blue'],
  run: ['Scoring run', 'purple'], 'solo-run': ['Solo run', 'purple'], 'role-player': ['Role player', 'green'], breakout: ['Breakout', 'green'], rookie: ['Rookie', 'green'],
  'triple-double': ['Triple-double', 'gold'], scoring: ['Scoring', 'orange'], defense: ['Defense', 'blue'], clutch: ['Clutch', 'red'], streak: ['Streak', 'orange'],
  blowout: ['Blowout alert', 'red'], collapse: ['Collapse', 'red'], disappointment: ['Rough night', 'gray'], potn: ['Performance of the Night', 'gold'],
};
export const TEAM_STORY = new Set(['comeback', 'comeback-done', 'close', 'overtime', 'run', 'streak', 'blowout', 'collapse']);
export const REACTIONS = [['fire', '🔥'], ['wow', '😮'], ['ice', '🧊'], ['clap', '👏'], ['goat', '🐐']];

export const Link = ({ to, children, className, ...rest }) => (
  <a href={to} className={className} onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); e.stopPropagation(); go(to); }} {...rest}>{children}</a>
);

// The mark: a ball with seams and a motion swoosh.
export const Logo = ({ size = 34 }) => (
  <svg className="logo-mark" width={size * 1.25} height={size} viewBox="0 0 80 64" aria-hidden="true">
    <path d="M2 40 C14 30, 22 26, 30 25" stroke="var(--orange)" strokeWidth="4" fill="none" strokeLinecap="round" opacity=".55" />
    <path d="M0 50 C12 42, 20 38, 28 37" stroke="var(--orange)" strokeWidth="4" fill="none" strokeLinecap="round" opacity=".35" />
    <circle cx="48" cy="32" r="27" fill="var(--orange)" />
    <g fill="none" stroke="#0a0a0b" strokeWidth="3.4" strokeLinecap="round"><path d="M21 32h54" /><path d="M48 5v54" /><path d="M29 12c9 8 9 32 0 40" /><path d="M67 12c-9 8-9 32 0 40" /></g>
  </svg>
);
export const Wordmark = ({ big }) => (
  <span className={`wordmark ${big ? 'big' : ''}`}><span>AROUND</span><span>THE <em>NBA</em></span></span>
);

export function Avatar({ src, name, color, size = 48, square = false }) {
  const [bad, setBad] = useState(false);
  const initials = String(name || '?').split(' ').map(w => w[0]).slice(0, 2).join('');
  return (
    <span className={`avatar ${square ? 'square' : ''}`} style={{ width: size, height: size, '--ring': color || 'var(--line-2)' }}>
      {src && !bad ? <img src={src} alt="" loading="lazy" onError={() => setBad(true)} /> : <span className="initials">{initials}</span>}
    </span>
  );
}
export function TeamLogo({ src, abbr, size = 22, quiet = false }) {
  const [bad, setBad] = useState(false);
  if (quiet && (bad || !src)) return null;
  return src && !bad ? <img className="team-logo" src={src} alt="" title={abbr || ''} width={size} height={size} loading="lazy" onError={() => setBad(true)} /> : <span className="team-abbr" style={{ fontSize: Math.max(11, size * 0.45) }}>{abbr}</span>;
}
export function Cutout({ src, name }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <span className="cutout-fallback">{String(name || '').split(' ').map(w => w[0]).slice(0, 2).join('')}</span>;
  return <img className="cutout" src={src} alt="" loading="lazy" onError={() => setBad(true)} />;
}

export const CatChip = ({ cat, label }) => { const [l, color] = CATS[cat] || [cat, 'gray']; return <span className={`pill p-${color}`}>{label || l}</span>; };

export function StatusChip({ e }) {
  if (e.status === 'developing') return <span className="chip live"><i className="dot" />Developing</span>;
  if (e.facts?.recap) return <span className="chip muted" title="Found in the final play-by-play after the game">Recap</span>;
  if (e.status === 'confirmed') return <span className="chip ok">Confirmed</span>;
  if (e.status === 'final') return <span className="chip ok" title={e.verification?.status === 'checking' ? 'ESPN final; the NBA.com cross-check is still running' : undefined}>Final{e.verification?.status === 'verified' ? ' · verified' : e.verification?.status === 'checking' ? ' · checking' : ''}</span>;
  if (e.status === 'pending') return <span className="chip warn">Awaiting verification</span>;
  return null;
}
export const Level = ({ level }) => (level === 'critical' ? <span className="level critical">Critical</span> : level === 'high' ? <span className="level high">High</span> : null);

export function GameStrip({ game, compact }) {
  if (!game?.teams?.length) return null;
  return (
    <Link to={`/games/${game.id}`} className={`gamestrip ${compact ? 'compact' : ''}`} title="Open the game">
      {game.teams.map((t, i) => <span key={t.id || i} className={`gs-team ${t.winner ? 'won' : ''}`}><TeamLogo src={t.logo} abbr={t.abbr} size={compact ? 15 : 20} /><b>{t.abbr}</b><span className="gs-score">{t.score ?? ''}</span></span>)}
      <span className="gs-clock">{game.moment || game.label}</span>
    </Link>
  );
}

export function Reactions({ e, onChange }) {
  const { user } = useMe();
  const [busy, setBusy] = useState(false);
  const react = async (ev, emoji) => {
    ev.stopPropagation();
    if (!user) return go(`/signin?next=${encodeURIComponent(location.pathname)}`);
    setBusy(true);
    try { const r = await post('feed', 'react', { id: e._id, emoji }); onChange?.({ ...e, reactions: r.reactions }); } finally { setBusy(false); }
  };
  return (
    <span className="reactions">
      {REACTIONS.map(([k, emo]) => (
        <button key={k} type="button" className={`react ${e.reactions?.[k] ? 'has' : ''}`} disabled={busy} onClick={ev => react(ev, k)} aria-label={`React ${k}`}>
          <span aria-hidden="true">{emo}</span>{e.reactions?.[k] > 0 && <small>{e.reactions[k]}</small>}
        </button>
      ))}
    </span>
  );
}

// The right side of a card: the line's big numbers, or the score.
function Numbers({ e }) {
  const g = e.game || {};
  const teamStory = TEAM_STORY.has(e.category) || e.category === 'game-winner' || e.category === 'defensive-winner';
  if (teamStory && g.teams?.length) {
    const final = g.status === 'final' || e.status === 'final';
    const moment = String(g.moment || g.label || '').split('·').pop().trim();
    return (
      <div className="ev-num score">
        {g.teams.map((t, i) => <b key={i} className={t.winner ? 'won' : ''}><small>{t.abbr}</small>{t.score ?? ''}</b>)}
        <span className={`ev-status ${e.status === 'developing' ? 'live' : ''}`}>{final ? 'FINAL' : moment}</span>
      </div>
    );
  }
  const stats = (e.stats || []).filter(s => ['PTS', 'REB', 'AST', 'STL', 'BLK'].includes(s.label)).slice(0, 3);
  const show = stats.length ? stats : (e.stats || []).slice(0, 2);
  if (!show.length) return <div className="ev-num" />;
  return <div className={`ev-num stats n${show.length}`}>{show.map((s, i) => <span key={i}><b>{s.value}</b><small>{s.label}</small></span>)}</div>;
}

// The art panel: the player on the team's colors, or the team's logo; critical events add the hero number.
function Art({ e }) {
  const p = TEAM_STORY.has(e.category) ? null : e.players?.[0];
  const color = e.team?.color || e.game?.teams?.[0]?.color || '#333';
  const s = (e.stats || [])[0];
  const hero = e.level === 'critical' && s && String(s.value).length <= 4
    ? <span className="hero"><b>{s.value}</b><small>{{ PTS: 'POINTS', REB: 'REBOUNDS', AST: 'ASSISTS' }[s.label] || s.label}</small></span> : null;
  return (
    <div className="ev-art" style={{ '--tc': color }} aria-hidden="true">
      {e.team?.logo && <img className="art-logo" src={e.team.logo} alt="" loading="lazy" onError={ev => { ev.currentTarget.style.display = 'none'; }} />}
      {p ? <Cutout src={p.headshot} name={p.name} /> : null}
      {hero}
    </div>
  );
}

function Media({ e }) {
  const p = e.players?.[0];
  if (p && !TEAM_STORY.has(e.category)) return <Link to={`/players/${p.id}`} className="ev-media" aria-label={p.name}><Cutout src={p.headshot} name={p.name} /></Link>;
  const teams = ['close', 'overtime'].includes(e.category) ? (e.game?.teams || []) : e.team ? [e.team] : (e.game?.teams || []).slice(0, 2);
  return <div className={`ev-media logos n${Math.min(2, teams.length)}`}>{teams.slice(0, 2).map((t, i) => <TeamLogo key={i} src={t.logo} abbr={t.abbr} size={teams.length > 1 ? 46 : 62} />)}</div>;
}

// The event card.
export function FeedCard({ e, fresh, onChange, open = false, selected, onSelect }) {
  const [expanded, setExpanded] = useState(open);
  const [, color] = CATS[e.category] || [null, 'gray'];
  const body = e.aiBody || e.body;
  const at = e.occurredAt || e.updatedAt;
  return (
    <article className={`ev lvl-${e.level} p-${color} ${fresh ? 'fresh' : ''} ${selected ? 'selected' : ''}`} id={`e-${e._id}`} onClick={() => onSelect?.(e)}>
      <div className="ev-time">
        <span className="t"><i className="tdot" />{clockTime(at)}</span>
        {e.status === 'developing' ? <span className="live-tag"><i className="dot" />LIVE</span> : <span className="ago">{ago(e.escalatedAt || at)}</span>}
      </div>
      <Media e={e} />
      <div className="ev-text">
        <div className="ev-labels"><CatChip cat={e.category} label={e.headline} /><Level level={e.level} />{e.status !== 'developing' && <StatusChip e={e} />}</div>
        <h3 className="ev-title"><Link to={`/e/${encodeURIComponent(e._id)}`}>{e.title || e.headline}</Link></h3>
        <p className="ev-body">{body}</p>
        <div className="ev-meta">
          {!TEAM_STORY.has(e.category) && <GameStrip game={e.game} compact />}
          <Reactions e={e} onChange={onChange} />
          <Link to={`/e/${encodeURIComponent(e._id)}#comments`} className="foot-btn" aria-label="Comments">💬 {e.comments || ''}</Link>
          <button type="button" className="foot-btn" aria-expanded={expanded} onClick={ev => { ev.stopPropagation(); setExpanded(x => !x); }}>{expanded ? 'Less' : 'Details'}</button>
          {e.aiBody && <span className="ai-note" title={`Written by ${e.ai?.model || 'AI'} from the facts`}>AI-written</span>}
        </div>
      </div>
      <Numbers e={e} />
      <Art e={e} />
      {expanded && <Details e={e} />}
    </article>
  );
}

export function Details({ e }) {
  return (
    <div className="details" onClick={ev => ev.stopPropagation()}>
      {e.aiBody && <div className="detail-block"><h5>From the data</h5><p>{e.body}</p></div>}
      {e.facts?.verifiedHighs?.length > 0 && <div className="detail-block"><h5>Verified</h5><ul>{e.facts.verifiedHighs.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      {e.facts?.history?.length > 0 && <div className="detail-block"><h5>Historical context (record book)</h5><ul>{e.facts.history.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      {e.facts?.seasonContext && <div className="detail-block"><h5>Season context</h5><p>{e.facts.seasonContext}</p></div>}
      {e.facts?.scope && <div className="detail-block"><h5>Scope</h5><p>{e.facts.title} · {e.facts.scope}</p></div>}
      {e.facts?.contributors?.length > 0 && <div className="detail-block"><h5>During the run</h5><p>{e.facts.contributors.map(c => `${c.name} ${c.pts}`).join(' · ')}{e.facts.before ? ` · ${e.facts.before} → ${e.facts.after}` : ''}{e.facts.duration ? ` · ${e.facts.duration}` : ''}</p></div>}
      {e.facts?.scorers?.length > 0 && <div className="detail-block"><h5>Who did it</h5><p>{e.facts.scorers.map(c => `${c.name} ${c.pts}`).join(' · ')}</p></div>}
      {e.facts?.splits && <div className="detail-block"><h5>Line</h5><p>{e.facts.line} · {e.facts.splits}{e.facts.min ? ` · ${e.facts.min} min` : ''}{e.facts.starter === false ? ' · off the bench' : e.facts.starter ? ' · starter' : ''}</p></div>}
      {e.facts?.context?.avg && <div className="detail-block"><h5>Season so far</h5><p>{e.facts.context.avg.pts} PTS, {e.facts.context.avg.reb} REB, {e.facts.context.avg.ast} AST in {e.facts.context.gp} games</p></div>}
      <div className="detail-block">
        <h5>Verification</h5>
        <p><span className={`vstat v-${e.verification?.status}`}>{vLabel(e.verification?.status)}</span>{e.verification?.note ? ` — ${e.verification.note}` : ''}</p>
        {e.verification?.checks?.length > 0 && <ul className="checks">{e.verification.checks.map((c, i) => <li key={i} className={c.ok === true ? 'ok' : c.ok === false ? 'bad' : ''}>{c.ok === true ? '✓' : c.ok === false ? '✕' : '–'} {c.name}{c.detail ? <span className="muted"> — {c.detail}</span> : null}</li>)}</ul>}
      </div>
      <div className="detail-block">
        <h5>Sources</h5>
        <ul className="sources">{(e.sources || []).map((s, i) => <li key={i}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> : s.name}{s.at ? <span className="muted"> · retrieved {new Date(s.at).toLocaleString()}</span> : null}{s.method ? <span className="muted"> · {s.method}</span> : null}</li>)}</ul>
        <p className="muted small">Event id {e._id}{e.game?.id ? ` · game ${e.game.id}` : ''}{e.players?.[0] ? ` · player ${e.players[0].id}` : ''} · detected {new Date(e.createdAt || e.updatedAt).toLocaleString()}</p>
      </div>
      {e.history?.length > 1 && <div className="detail-block"><h5>How the story developed</h5><ol className="history">{e.history.map((h, i) => <li key={i}><time>{new Date(h.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time> {h.headline} <span className="muted">({h.status})</span></li>)}</ol></div>}
    </div>
  );
}
export const vLabel = s => ({ verified: 'Verified (ESPN + NBA.com)', consistent: 'Consistent (all checks, one source)', developing: 'Developing — live data', pending: 'Awaiting verification', checking: 'ESPN final — NBA.com cross-check in progress', failed: 'Failed verification', live: 'Live data', unverified: 'Unverified' }[s] || s || 'Unknown');

export const Empty = ({ title, children }) => <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}</div>;
export const ErrorBox = ({ error, retry }) => <div className="empty error"><h3>Couldn't load this</h3><p>{error?.message || String(error)}</p>{retry && <button className="btn" onClick={retry}>Try again</button>}</div>;
export const Loading = ({ label = 'Loading' }) => <div className="loading" role="status"><span className="spinner" />{label}…</div>;
export { ApiError };
