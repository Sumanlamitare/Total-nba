import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Link, Button, Field, Modal, Spinner, Empty, relDay, clock, navigate, useToast } from '../ui.jsx';
import { useUser } from '../App.jsx';

export const SPORTS = {
  basketball: ['Basketball', '🏀'], soccer: ['Soccer', '⚽'], volleyball: ['Volleyball', '🏐'], pickleball: ['Pickleball', '🏓'],
  tennis: ['Tennis', '🎾'], ultimate: ['Ultimate', '🥏'], football: ['Flag football', '🏈'], hockey: ['Hockey', '🏒'],
  softball: ['Softball', '🥎'], badminton: ['Badminton', '🏸'], running: ['Running', '🏃'], other: ['Other', '🏅'],
};
export const SPORT_ICON = Object.fromEntries(Object.entries(SPORTS).map(([k, v]) => [k, v[1]]));

const ME = { in: ['You\'re in', 'in'], waitlist: ['Waitlist', 'wait'], maybe: ['Maybe', 'maybe'], out: ['Out', 'out'] };
export function MyChip({ me }) {
  if (!me) return <span className="chip ask">Are you in?</span>;
  return <span className={'chip ' + ME[me][1]}>{ME[me][0]}</span>;
}

export function GameCard({ g, showGroup }) {
  const full = g.taken >= g.capacity;
  return (
    <Link to={`/game/${g.id}`} className={'gamecard' + (g.status === 'canceled' ? ' canceled' : '')}>
      <div className="gc-when"><b>{relDay(g.startsAt)}</b><span>{clock(g.startsAt)}</span></div>
      <div className="gc-main">
        {showGroup && <small className="gc-group">{SPORT_ICON[g.sport]} {g.groupName}</small>}
        <span className="gc-loc">{g.location || 'Location TBA'}</span>
        {g.status === 'canceled' ? <small className="bad">Canceled</small>
          : g.status === 'played' ? <small>{g.score ? `Final: ${g.score.join(' – ')}` : 'Played'}</small>
          : <small>{g.taken}/{g.capacity} in{g.waitlist ? ` · ${g.waitlist} waiting` : ''}{g.need ? ` · need ${g.need}` : full ? ' · full' : ''}</small>}
        {g.status === 'scheduled' && <div className="meter sm"><i style={{ width: `${Math.min(100, (g.taken / g.capacity) * 100)}%` }} /></div>}
      </div>
      {g.status === 'scheduled' && <MyChip me={g.me} />}
    </Link>
  );
}

function NewGroup({ onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', sport: 'basketball', location: '' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await api('groups', { method: 'POST', body: f }); toast('Group created — now invite your players'); navigate(`/g/${r.id}?new=1`); }
    catch (e2) { setErr(e2.message); setBusy(false); }
  }
  return (
    <Modal title="Start a group" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <Field label="Group name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Tuesday Night Hoops" maxLength={60} /></Field>
        <div className="field"><span className="flabel">Sport</span>
          <div className="sportpick" role="radiogroup" aria-label="Sport">
            {Object.entries(SPORTS).map(([k, [name, icon]]) => (
              <button type="button" key={k} role="radio" aria-checked={f.sport === k} className={f.sport === k ? 'on' : ''} onClick={() => setF({ ...f, sport: k })}><span>{icon}</span>{name}</button>
            ))}
          </div>
        </div>
        <Field label="Usual spot (optional)" hint="Games default to this location"><input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} placeholder="Rucker Park, court 2" maxLength={120} /></Field>
        {err && <p className="formerr">{err}</p>}
        <div className="row end"><Button kind="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Create group</Button></div>
      </form>
    </Modal>
  );
}

function JoinLink({ onClose }) {
  const [v, setV] = useState(''), [err, setErr] = useState('');
  function go(e) {
    e.preventDefault();
    const code = (v.match(/join\/([A-Za-z0-9]{4,20})/) || v.trim().match(/^([A-Za-z0-9]{4,20})$/) || [])[1];
    if (!code) return setErr('Paste the whole invite link your organizer sent');
    navigate(`/join/${code}`);
  }
  return (
    <Modal title="Join a group" onClose={onClose} width={460}>
      <form onSubmit={go} className="stack">
        <Field label="Invite link"><input value={v} onChange={e => { setV(e.target.value); setErr(''); }} placeholder={`${location.host}/join/…`} /></Field>
        {err && <p className="formerr">{err}</p>}
        <div className="row end"><Button kind="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit">Continue</Button></div>
      </form>
    </Modal>
  );
}

export default function Home() {
  const { user } = useUser();
  const [games, setGames] = useState(null), [groups, setGroups] = useState(null), [err, setErr] = useState('');
  const [modal, setModal] = useState(null);
  useEffect(() => {
    api('games').then(r => setGames(r.games), e => setErr(e.message));
    api('groups').then(r => setGroups(r.groups), e => setErr(e.message));
  }, []);
  if (err) return <p className="formerr">{err}</p>;
  if (!games || !groups) return <Spinner />;
  const open = games.filter(g => g.status === 'scheduled' && !g.me).length;

  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>Hey {user.name.split(' ')[0]} 👋</h1><p className="muted">{games.length ? `${games.length} upcoming game${games.length > 1 ? 's' : ''}${open ? ` · ${open} waiting on your answer` : ''}` : 'No games on the calendar yet.'}</p></div>
      </div>

      {groups.length === 0 ? (
        <Empty title="Start your first group" action={<div className="row center"><Button onClick={() => setModal('new')}>Start a group</Button><Button kind="ghost" onClick={() => setModal('join')}>I have an invite link</Button></div>}>
          A group is your regular crew — Sunday soccer, lunchtime hoops, the Thursday pickleball ladies. Create one and share the link, or join one you've been invited to.
        </Empty>
      ) : <>
        <section>
          <h2 className="h3">Upcoming</h2>
          {games.length === 0 ? <p className="muted card pad">Nothing scheduled. Organizers can post a game from the group page.</p>
            : <div className="gamelist">{games.map(g => <GameCard key={g.id} g={g} showGroup />)}</div>}
        </section>
        <section>
          <div className="rowhead"><h2 className="h3">Your groups</h2><div className="row"><Button kind="ghost" className="sm" onClick={() => setModal('join')}>Join</Button><Button className="sm" onClick={() => setModal('new')}>+ New group</Button></div></div>
          <div className="grouplist">
            {groups.map(g => (
              <Link key={g.id} to={`/g/${g.id}`} className="groupcard">
                <span className="sporticon">{SPORT_ICON[g.sport]}</span>
                <div><b>{g.name}</b><small>{g.members} member{g.members > 1 ? 's' : ''}{g.role !== 'member' ? ` · ${g.role === 'owner' ? 'Owner' : 'Organizer'}` : ''}</small>
                  <small className="next">{g.next ? `Next: ${relDay(g.next.startsAt)} ${clock(g.next.startsAt)} · ${g.next.taken}/${g.next.capacity}` : 'No game scheduled'}</small></div>
              </Link>
            ))}
          </div>
        </section>
      </>}
      {modal === 'new' && <NewGroup onClose={() => setModal(null)} />}
      {modal === 'join' && <JoinLink onClose={() => setModal(null)} />}
    </div>
  );
}
