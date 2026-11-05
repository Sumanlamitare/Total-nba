// Shared pieces: the feed card (the heart of the product), chips, avatars, reactions, empty and error states.
import React, { useState } from 'react';
import { go, ago, post, useMe, ApiError } from './api.js';

export const CATS = {
  record: ['Record', 'orange'], milestone: ['Milestone', 'gold'], 'game-winner': ['Game winner', 'red'], 'defensive-winner': ['Defensive game winner', 'blue'],
  comeback: ['Comeback watch', 'purple'], 'comeback-done': ['Comeback', 'purple'], close: ['Close game', 'red'], overtime: ['Overtime', 'red'],
  run: ['Scoring run', 'orange'], 'solo-run': ['Solo run', 'orange'], 'role-player': ['Role player', 'green'], breakout: ['Breakout', 'green'], rookie: ['Rookie', 'green'],
  'triple-double': ['Triple-double', 'gold'], scoring: ['Scoring', 'orange'], defense: ['Defense', 'blue'], clutch: ['Clutch', 'red'], streak: ['Streak', 'blue'],
  blowout: ['Blowout', 'gray'], collapse: ['Collapse', 'purple'], disappointment: ['Rough night', 'gray'], potn: ['Performance of the Night', 'gold'],
};
export const REACTIONS = [['fire', '🔥'], ['wow', '😮'], ['ice', '🧊'], ['clap', '👏'], ['goat', '🐐']];

export const Link = ({ to, children, className, ...rest }) => (
  <a href={to} className={className} onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); go(to); }} {...rest}>{children}</a>
);

export const Logo = ({ size = 30 }) => (
  <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="var(--orange)" /><circle cx="32" cy="32" r="17" fill="none" stroke="#0a0a0b" strokeWidth="5" /><path d="M32 2v60" stroke="#0a0a0b" strokeWidth="5" /></svg>
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
export const TeamLogo = ({ src, abbr, size = 22 }) => (src ? <img className="team-logo" src={src} alt={abbr || ''} width={size} height={size} loading="lazy" /> : <span className="team-abbr">{abbr}</span>);

export const CatChip = ({ cat }) => { const [label, color] = CATS[cat] || [cat, 'gray']; return <span className={`chip c-${color}`}>{label}</span>; };

export function StatusChip({ e }) {
  if (e.status === 'developing') return <span className="chip live"><i className="dot" />Live · developing</span>;
  if (e.facts?.recap) return <span className="chip muted" title="Found in the final play-by-play after the game">Recap</span>;
  if (e.status === 'confirmed') return <span className="chip ok" title="Verified">Confirmed</span>;
  if (e.status === 'final') return <span className="chip ok">Final{e.verification?.status === 'verified' ? ' · verified' : ''}</span>;
  if (e.status === 'pending') return <span className="chip warn">Awaiting verification</span>;
  return null;
}

export const Level = ({ level }) => (level === 'critical' ? <span className="level critical">Critical</span> : level === 'high' ? <span className="level high">High</span> : null);

export function GameStrip({ game, compact }) {
  if (!game?.teams?.length) return null;
  return (
    <Link to={`/games/${game.id}`} className={`gamestrip ${compact ? 'compact' : ''}`} title="Open the game">
      {game.teams.map((t, i) => (
        <span key={t.id || i} className={`gs-team ${t.winner ? 'won' : ''}`}><TeamLogo src={t.logo} abbr={t.abbr} size={compact ? 16 : 20} /><b>{t.abbr}</b><span className="gs-score">{t.score ?? ''}</span></span>
      ))}
      <span className="gs-clock">{game.moment || game.label}</span>
    </Link>
  );
}

export function Reactions({ e, onChange }) {
  const { user } = useMe();
  const [busy, setBusy] = useState(false);
  const react = async emoji => {
    if (!user) return go(`/signin?next=${encodeURIComponent(location.pathname)}`);
    setBusy(true);
    try { const r = await post('feed', 'react', { id: e._id, emoji }); onChange?.({ ...e, reactions: r.reactions }); } finally { setBusy(false); }
  };
  return (
    <span className="reactions">
      {REACTIONS.map(([k, emo]) => (
        <button key={k} type="button" className={`react ${e.reactions?.[k] ? 'has' : ''}`} disabled={busy} onClick={() => react(k)} aria-label={`React ${k}`}>
          <span aria-hidden="true">{emo}</span>{e.reactions?.[k] > 0 && <small>{e.reactions[k]}</small>}
        </button>
      ))}
    </span>
  );
}

// The feed card.
export function FeedCard({ e, fresh, onChange, open = false }) {
  const [expanded, setExpanded] = useState(open);
  const [, color] = CATS[e.category] || [null, 'gray'];
  const p = e.players?.[0];
  const body = e.aiBody || e.body;
  return (
    <article className={`card lvl-${e.level} c-${color} ${fresh ? 'fresh' : ''}`} id={`e-${e._id}`}>
      <div className="card-head">
        <CatChip cat={e.category} /><Level level={e.level} /><StatusChip e={e} />
        <span className="grow" />
        <time dateTime={new Date(e.occurredAt || e.updatedAt).toISOString()} title={new Date(e.occurredAt || e.updatedAt).toLocaleString()}>{ago(e.escalatedAt || e.occurredAt || e.updatedAt)}</time>
      </div>
      <div className="card-main">
        {p ? <Link to={`/players/${p.id}`} className="card-media" aria-label={p.name}><Avatar src={p.headshot} name={p.name} color={e.team?.color} size={64} /></Link>
          : e.team?.logo ? <Link to={`/teams/${e.team.id}`} className="card-media" aria-label={e.team.name}><span className="logo-tile" style={{ '--ring': e.team.color }}><img src={e.team.logo} alt="" /></span></Link> : null}
        <div className="card-text">
          <h3 className="headline"><Link to={`/e/${encodeURIComponent(e._id)}`}>{e.headline}</Link></h3>
          {(p || e.team) && <div className="subject">{p ? <><Link to={`/players/${p.id}`}>{p.name}</Link>{p.team && <span className="muted"> · {p.team}</span>}</> : <Link to={`/teams/${e.team.id}`}>{e.team.name || e.team.abbr}</Link>}</div>}
          <p className="body">{body}</p>
          {e.aiBody && <p className="ai-note" title={`Written by ${e.ai?.model || 'AI'} from the facts below`}>AI-written summary · <button type="button" className="linklike" onClick={() => setExpanded(true)}>see the facts</button></p>}
        </div>
      </div>
      {e.stats?.length > 0 && <div className="stats">{e.stats.slice(0, 6).map((s, i) => <span key={i} className="stat"><b>{s.value}</b><small>{s.label}</small></span>)}</div>}
      <div className="card-foot">
        <GameStrip game={e.game} compact />
        <span className="grow" />
        <Reactions e={e} onChange={onChange} />
        <Link to={`/e/${encodeURIComponent(e._id)}#comments`} className="foot-btn" aria-label="Comments">💬 {e.comments || ''}</Link>
        <button type="button" className="foot-btn" aria-expanded={expanded} onClick={() => setExpanded(x => !x)}>{expanded ? 'Less' : 'Details'}</button>
      </div>
      {expanded && <Details e={e} />}
    </article>
  );
}

export function Details({ e }) {
  return (
    <div className="details">
      {e.aiBody && <div className="detail-block"><h5>From the data</h5><p>{e.body}</p></div>}
      {e.facts?.verifiedHighs?.length > 0 && <div className="detail-block"><h5>Verified</h5><ul>{e.facts.verifiedHighs.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      {e.facts?.scope && <div className="detail-block"><h5>Scope</h5><p>{e.facts.title} · {e.facts.scope}</p></div>}
      {e.facts?.contributors?.length > 0 && <div className="detail-block"><h5>During the run</h5><p>{e.facts.contributors.map(c => `${c.name} ${c.pts}`).join(' · ')}{e.facts.before ? ` · ${e.facts.before} → ${e.facts.after}` : ''}{e.facts.duration ? ` · ${e.facts.duration}` : ''}</p></div>}
      {e.facts?.scorers?.length > 0 && <div className="detail-block"><h5>Who did it</h5><p>{e.facts.scorers.map(c => `${c.name} ${c.pts}`).join(' · ')}</p></div>}
      {e.facts?.splits && <div className="detail-block"><h5>Line</h5><p>{e.facts.line} · {e.facts.splits}{e.facts.min ? ` · ${e.facts.min} min` : ''}</p></div>}
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
export const vLabel = s => ({ verified: 'Verified (ESPN + NBA.com)', consistent: 'Consistent (all checks, one source)', developing: 'Developing — live data', pending: 'Awaiting verification', failed: 'Failed verification', live: 'Live data', unverified: 'Unverified' }[s] || s || 'Unknown');

export const Empty = ({ title, children }) => <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}</div>;
export const ErrorBox = ({ error, retry }) => <div className="empty error"><h3>Couldn't load this</h3><p>{error?.message || String(error)}</p>{retry && <button className="btn" onClick={retry}>Try again</button>}</div>;
export const Loading = ({ label = 'Loading' }) => <div className="loading" role="status"><span className="spinner" />{label}…</div>;
export { ApiError };
