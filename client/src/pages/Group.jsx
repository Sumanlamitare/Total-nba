import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Link, Button, Field, Modal, Spinner, Empty, Avatar, Copy, navigate, useToast, share } from '../ui.jsx';
import { GameCard, SPORTS, SPORT_ICON } from './Home.jsx';

const pad = n => String(n).padStart(2, '0');
const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Create or edit a game. `from` pre-fills (editing, or "post next week's game").
export function GameForm({ group, sports, from, editId, onClose, onSaved }) {
  const toast = useToast();
  const start = from ? new Date(from.startsAt) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(19, 0, 0, 0); return d; })();
  const size = from?.capacity ?? sports?.[group.sport]?.size ?? 10;
  const [f, setF] = useState({
    date: localDate(start), time: localTime(start), duration: from?.duration ?? 90, capacity: size,
    minPlayers: from?.minPlayers ?? Math.min(size, Math.max(2, Math.round(size * 0.8))), location: from?.location ?? group.location ?? '',
    cost: from?.cost || '', notes: from?.notes ?? '', imIn: !editId,
  });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    const startsAt = new Date(`${f.date}T${f.time}`);
    if (Number.isNaN(+startsAt)) { setErr('Pick a date and time'); setBusy(false); return; }
    const body = { startsAt: startsAt.toISOString(), duration: +f.duration, capacity: +f.capacity, minPlayers: +f.minPlayers, location: f.location, cost: f.cost === '' ? 0 : +f.cost, notes: f.notes };
    try {
      if (editId) { await api(`games?id=${editId}`, { method: 'PATCH', body }); toast('Game updated'); onSaved?.(); onClose(); }
      else { const r = await api('games', { method: 'POST', body: { ...body, groupId: group.id, imIn: f.imIn } }); toast('Game posted — share it with the group'); navigate(`/game/${r.id}`); }
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }
  return (
    <Modal title={editId ? 'Edit game' : 'Post a game'} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="grid2">
          <Field label="Date"><input type="date" value={f.date} onChange={set('date')} required /></Field>
          <Field label="Start time"><input type="time" value={f.time} onChange={set('time')} required /></Field>
          <Field label="Spots" hint="Including guests"><input type="number" min="2" max="200" value={f.capacity} onChange={set('capacity')} /></Field>
          <Field label="Need at least" hint="To call it on"><input type="number" min="0" max="200" value={f.minPlayers} onChange={set('minPlayers')} /></Field>
          <Field label="Length"><select value={f.duration} onChange={set('duration')}>{[45, 60, 90, 120, 150, 180, 240].map(m => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hour${m > 60 ? 's' : ''}`}</option>)}</select></Field>
          <Field label="Total cost (optional)" hint="Split across players"><input type="number" min="0" step="0.01" inputMode="decimal" value={f.cost} onChange={set('cost')} placeholder="0" /></Field>
        </div>
        <Field label="Location"><input value={f.location} onChange={set('location')} placeholder="Court, field or address" maxLength={120} /></Field>
        <Field label="Notes (optional)"><textarea rows="2" value={f.notes} onChange={set('notes')} placeholder="Bring a light and a dark shirt" maxLength={1000} /></Field>
        {!editId && <label className="check"><input type="checkbox" checked={f.imIn} onChange={set('imIn')} /> I'm playing</label>}
        {err && <p className="formerr">{err}</p>}
        <div className="row end"><Button kind="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>{editId ? 'Save' : 'Post game'}</Button></div>
      </form>
    </Modal>
  );
}

function InviteCard({ group, onNew, big }) {
  const toast = useToast();
  const url = `${location.origin}/join/${group.invite}`;
  return (
    <div className={'invite' + (big ? ' big' : '')}>
      <div><b>{big ? 'Now invite your players' : 'Invite link'}</b><p className="muted small">{big ? 'Paste this into your group chat. Anyone with it can join.' : 'Anyone with this link can join the group.'}</p></div>
      <div className="invrow"><code>{url.replace(/^https?:\/\//, '')}</code>
        <Copy text={url} className="btn primary sm" label="Copy" />
        <Button kind="ghost" className="sm" onClick={() => share({ title: group.name, text: `Join ${group.name} on Turnout`, url }, toast)}>Share</Button>
      </div>
      {onNew && <button className="linkbtn small" onClick={onNew}>Replace link (the old one stops working)</button>}
    </div>
  );
}

function Table({ stats, me }) {
  if (!stats.length) return <Empty title="No results yet">Once an organizer records a game's score and attendance, the table fills in.</Empty>;
  const rows = [...stats].sort((a, b) => b.played - a.played || b.wins - a.wins || a.name.localeCompare(b.name));
  return (
    <div className="card flush">
      <div className="tablewrap"><table className="tbl">
        <thead><tr><th>Player</th><th title="Games played">GP</th><th title="Wins–losses–draws">W–L–D</th><th title="Showed up when committed, counting late drops">Reliable</th><th title="No-shows">NS</th><th title="Dropped out within 24 hours">Late</th></tr></thead>
        <tbody>{rows.map(s => (
          <tr key={s.userId} className={s.userId === me ? 'mine' : ''}>
            <td><span className="who"><Avatar name={s.name} size={26} />{s.name}</span></td>
            <td>{s.played}</td><td>{s.wins}–{s.losses}–{s.draws}</td>
            <td><span className={'rel ' + (s.reliability == null ? '' : s.reliability >= 0.9 ? 'good' : s.reliability >= 0.7 ? 'ok' : 'poor')}>{s.reliability == null ? '—' : `${Math.round(s.reliability * 100)}%`}</span></td>
            <td>{s.noShows || ''}</td><td>{s.lateDrops || ''}</td>
          </tr>))}
        </tbody>
      </table></div>
      <p className="muted small pad">Reliable = games shown up to ÷ (games committed + late drops).</p>
    </div>
  );
}

function Members({ data, reload }) {
  const toast = useToast(), admin = data.me.admin;
  async function act(action, body, msg) {
    try { await api(`groups?id=${data.group.id}&action=${action}`, { method: 'POST', body }); if (msg) toast(msg); reload(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  const order = { owner: 0, admin: 1, member: 2 };
  return (
    <div className="card flush">
      {admin && <p className="muted small pad">Skill (1–5) is only visible to organizers and is used to balance teams.</p>}
      <ul className="members">
        {[...data.members].sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name)).map(m => (
          <li key={m.userId}>
            <Avatar name={m.name} size={36} />
            <div className="mname"><b>{m.name}{m.userId === data.me.userId ? ' (you)' : ''}</b><small>{m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Organizer' : 'Player'}</small></div>
            {admin && <div className="skill" role="radiogroup" aria-label={`Skill for ${m.name}`}>
              {[1, 2, 3, 4, 5].map(n => <button key={n} role="radio" aria-checked={m.skill === n} className={n <= m.skill ? 'on' : ''} onClick={() => act('skill', { userId: m.userId, skill: n })} title={`Skill ${n}`} />)}
            </div>}
            {admin && m.role !== 'owner' && m.userId !== data.me.userId && (
              <select className="mmenu" value="" aria-label={`Options for ${m.name}`} onChange={e => {
                const v = e.target.value;
                if (v === 'admin' || v === 'member') act('role', { userId: m.userId, role: v }, v === 'admin' ? `${m.name} is now an organizer` : `${m.name} is now a player`);
                if (v === 'owner' && confirm(`Hand ${data.group.name} over to ${m.name}? You'll become an organizer.`)) act('role', { userId: m.userId, role: 'owner' }, `${m.name} now owns the group`);
                if (v === 'remove' && confirm(`Remove ${m.name} from the group?`)) act('remove', { userId: m.userId }, `${m.name} removed`);
              }}>
                <option value="">⋯</option>
                {m.role === 'member' ? <option value="admin">Make organizer</option> : <option value="member">Make player</option>}
                {data.me.role === 'owner' && <option value="owner">Make owner</option>}
                <option value="remove">Remove from group</option>
              </select>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Settings({ data, reload }) {
  const toast = useToast(), g = data.group;
  const [f, setF] = useState({ name: g.name, sport: g.sport, location: g.location, about: g.about });
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api(`groups?id=${g.id}`, { method: 'PATCH', body: f }); toast('Saved'); reload(); } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }
  async function del() {
    if (!confirm(`Delete ${g.name} and all of its games? This can't be undone.`)) return;
    try { await api(`groups?id=${g.id}`, { method: 'DELETE' }); toast('Group deleted'); navigate('/home'); } catch (e) { toast(e.message, 'bad'); }
  }
  return (
    <div className="stack">
      <form onSubmit={save} className="card stack">
        <h3>Group details</h3>
        <Field label="Name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={60} /></Field>
        <Field label="Sport"><select value={f.sport} onChange={e => setF({ ...f, sport: e.target.value })}>{Object.entries(SPORTS).map(([k, [n, i]]) => <option key={k} value={k}>{i} {n}</option>)}</select></Field>
        <Field label="Usual spot"><input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} maxLength={120} /></Field>
        <Field label="About" hint="Level, rules, what to bring — shown on the invite page"><textarea rows="3" value={f.about} onChange={e => setF({ ...f, about: e.target.value })} maxLength={600} /></Field>
        {err && <p className="formerr">{err}</p>}
        <div className="row end"><Button type="submit" loading={busy}>Save</Button></div>
      </form>
      {data.me.role === 'owner' && <div className="card danger"><h3>Delete group</h3><p className="muted small">Removes the group, its games and its history for everyone.</p><div className="row end"><Button kind="danger" onClick={del}>Delete group</Button></div></div>}
    </div>
  );
}

export default function Group({ id }) {
  const toast = useToast();
  const [data, setData] = useState(null), [err, setErr] = useState('');
  const [tab, setTab] = useState('games'), [posting, setPosting] = useState(false);
  const fresh = new URLSearchParams(location.search).has('new');
  const reload = useCallback(() => api(`groups?id=${id}`).then(setData, e => setErr(e.message)), [id]);
  useEffect(() => { reload(); }, [reload]);

  if (err) return <div className="page"><p className="formerr">{err}</p><Link to="/home">← Home</Link></div>;
  if (!data) return <Spinner />;
  const g = data.group, admin = data.me.admin;

  async function newInvite() {
    if (!confirm('Replace the invite link? The current link will stop working.')) return;
    try { await api(`groups?id=${g.id}&action=invite`, { method: 'POST', body: {} }); toast('New invite link ready'); reload(); } catch (e) { toast(e.message, 'bad'); }
  }
  async function leave() {
    if (!confirm(`Leave ${g.name}?`)) return;
    try { await api(`groups?id=${g.id}&action=leave`, { method: 'POST', body: {} }); toast(`You left ${g.name}`); navigate('/home'); } catch (e) { toast(e.message, 'bad'); }
  }
  const tabs = [['games', 'Games'], ['table', 'Table'], ['members', `Members · ${data.members.length}`], ...(admin ? [['settings', 'Settings']] : [])];

  return (
    <div className="page">
      <Link to="/home" className="back">← Home</Link>
      <div className="grouphead">
        <span className="sporticon big">{SPORT_ICON[g.sport]}</span>
        <div><h1>{g.name}</h1><p className="muted">{[SPORTS[g.sport]?.[0], g.location].filter(Boolean).join(' · ')}</p></div>
      </div>
      {g.about && <p className="about">{g.about}</p>}
      {admin && (fresh || data.members.length < 3) && <InviteCard group={g} big />}

      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'games' && <>
        {admin && <Button className="block lg" onClick={() => setPosting(true)}>+ Post a game</Button>}
        {data.upcoming.length === 0
          ? <Empty title="No games scheduled">{admin ? 'Post one and everyone in the group can answer in, maybe or out.' : 'Your organizer hasn\'t posted the next game yet.'}</Empty>
          : <div className="gamelist">{data.upcoming.map(x => <GameCard key={x.id} g={x} />)}</div>}
        {data.past.length > 0 && <><h2 className="h3">Past games</h2><div className="gamelist">{data.past.map(x => <GameCard key={x.id} g={x} />)}</div></>}
      </>}
      {tab === 'table' && <Table stats={data.stats} me={data.me.userId} />}
      {tab === 'members' && <>
        {admin && <InviteCard group={g} onNew={newInvite} />}
        <Members data={data} reload={reload} />
        {data.me.role !== 'owner' && <div className="row end"><Button kind="ghost" className="sm" onClick={leave}>Leave group</Button></div>}
      </>}
      {tab === 'settings' && admin && <Settings data={data} reload={reload} />}
      {posting && <GameForm group={g} sports={data.sports} onClose={() => setPosting(false)} />}
    </div>
  );
}
