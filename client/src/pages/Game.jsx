import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Link, Button, Spinner, Avatar, Stepper, Modal, longDay, clock, ago, money, navigate, useToast, share } from '../ui.jsx';
import { SPORT_ICON } from './Home.jsx';
import { GameForm } from './Group.jsx';
import { useUser } from '../App.jsx';

const icsDate = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = s => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
function calendarFile(g) {
  const end = new Date(+new Date(g.startsAt) + (g.duration || 90) * 60e3);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Turnout//EN', 'BEGIN:VEVENT', `UID:${g.id}@turnout`, `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(g.startsAt)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${icsText(g.group.name)}`, `LOCATION:${icsText(g.location)}`,
    `DESCRIPTION:${icsText(`${location.origin}/game/${g.id}${g.notes ? '\n' + g.notes : ''}`)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = `${g.group.name.replace(/[^\w]+/g, '-').toLowerCase()}.ics`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Banner({ g }) {
  if (g.status === 'canceled') return <div className="banner canceled">❌ This game was canceled</div>;
  if (g.status === 'played') return <div className="banner played">🏁 {g.final?.score ? `Final: ${g.final.score.join(' – ')}` : 'Played'}</div>;
  if (g.need > 0) return <div className="banner need">Need <b>{g.need}</b> more to play · {g.taken}/{g.capacity} in</div>;
  if (g.taken >= g.capacity) return <div className="banner on">🔥 Game on — full{g.waitlist ? ` · ${g.waitlist} on the waitlist` : ''}</div>;
  return <div className="banner on">✅ Game on · {g.capacity - g.taken} spot{g.capacity - g.taken === 1 ? '' : 's'} left</div>;
}

function Rsvp({ g, onChange }) {
  const toast = useToast(), { user } = useUser();
  const [busy, setBusy] = useState(''), [guests, setGuests] = useState(g.myGuests);
  useEffect(() => setGuests(g.myGuests), [g.myGuests]);
  const want = g.me === 'waitlist' ? 'in' : g.me;
  async function send(w, n = guests) {
    setBusy(w);
    try { const r = await api(`games?id=${g.id}&action=rsvp`, { method: 'POST', body: { want: w, guests: w === 'in' ? n : 0 } }); onChange(r.game); }
    catch (e) { toast(e.message, 'bad'); }
    setBusy('');
  }
  const place = g.roster.waitlist.findIndex(r => r.userId === user.id) + 1;
  const status = g.me === 'in' ? 'You\'re in ✅' : g.me === 'waitlist' ? `You're #${place} on the waitlist — you'll move up automatically if someone drops`
    : g.me === 'maybe' ? 'Marked as maybe — commit when you know' : g.me === 'out' ? 'You\'re out this time' : 'Are you in?';
  return (
    <div className="rsvp card">
      <p className={'rsvp-status ' + (g.me || 'ask')}>{status}</p>
      <div className="seg" role="radiogroup" aria-label="Your answer">
        {[['in', 'I\'m in'], ['maybe', 'Maybe'], ['out', 'Out']].map(([k, label]) => (
          <button key={k} role="radio" aria-checked={want === k} className={want === k ? 'on ' + k : ''} disabled={!!busy} onClick={() => want !== k && send(k)}>{busy === k ? <span className="spin" /> : label}</button>
        ))}
      </div>
      {want === 'in' && (
        <div className="guests"><span>Bringing guests?</span><Stepper label="Guests" value={guests} max={5} onChange={n => { setGuests(n); send('in', n); }} /></div>
      )}
      {g.costEach != null && <p className="muted small">{money(g.cost)} total · about <b>{money(g.costEach)}</b> each right now</p>}
    </div>
  );
}

function People({ title, list, numbered, empty }) {
  return (
    <div className="people">
      <h3>{title}</h3>
      {list.length === 0 ? <p className="muted small">{empty}</p> : (
        <ul>{list.map((p, i) => (
          <li key={p.userId}>{numbered && <span className="num">{i + 1}</span>}<Avatar name={p.name} size={30} /><span>{p.name}</span>{p.guests > 0 && <span className="plus">+{p.guests}</span>}</li>
        ))}</ul>
      )}
    </div>
  );
}

function Teams({ g, onChange }) {
  const toast = useToast();
  const [n, setN] = useState(g.teams?.length || 2), [busy, setBusy] = useState(false);
  async function make(action) {
    setBusy(true);
    try { const r = await api(`games?id=${g.id}&action=${action}`, { method: 'POST', body: { n } }); onChange(r.game); } catch (e) { toast(e.message, 'bad'); }
    setBusy(false);
  }
  const canEdit = g.admin && g.status === 'scheduled';
  if (!g.teams && !canEdit) return null;
  return (
    <section className="card">
      <div className="rowhead"><h2 className="h3">Teams</h2>
        {canEdit && <div className="row">
          <select value={n} onChange={e => setN(+e.target.value)} aria-label="Number of teams">{[2, 3, 4].map(k => <option key={k} value={k}>{k} teams</option>)}</select>
          <Button className="sm" loading={busy} onClick={() => make('teams')}>{g.teams ? 'Reshuffle' : 'Make teams'}</Button>
          {g.teams && <Button kind="ghost" className="sm" onClick={() => make('clearteams')}>Clear</Button>}
        </div>}
      </div>
      {g.teams ? (
        <div className="teams">{g.teams.map((t, k) => (
          <div key={k} className={'team t' + k}><h4>{['Lights', 'Darks', 'Reds', 'Blues'][k]}{g.final?.score ? <b>{g.final.score[k]}</b> : null}</h4>
            <ul>{t.map(p => <li key={p.id}><Avatar name={p.name} size={26} />{p.name}</li>)}</ul></div>
        ))}</div>
      ) : <p className="muted small">Balanced by the skill ratings organizers set. Includes everyone who's in, plus guests.</p>}
    </section>
  );
}

function Result({ g, onChange }) {
  const toast = useToast();
  const [score, setScore] = useState(g.teams ? g.teams.map(() => '') : []);
  const [noShows, setNoShows] = useState([]), [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault(); setBusy(true);
    try { const r = await api(`games?id=${g.id}&action=result`, { method: 'POST', body: { score: g.teams ? score : null, noShows } }); toast('Result saved'); onChange(r.game); }
    catch (e2) { toast(e2.message, 'bad'); }
    setBusy(false);
  }
  return (
    <form className="card stack" onSubmit={save}>
      <h2 className="h3">Record the result</h2>
      {g.teams && <div className="scores">{g.teams.map((_, k) => (
        <label key={k}><span>{['Lights', 'Darks', 'Reds', 'Blues'][k]}</span><input type="number" min="0" max="999" inputMode="numeric" value={score[k]} onChange={e => setScore(s => s.map((v, i) => (i === k ? e.target.value : v)))} /></label>
      ))}</div>}
      <div><p className="flabel">Who didn't show up?</p>
        <div className="noshows">{g.roster.in.map(p => (
          <label key={p.userId} className={noShows.includes(p.userId) ? 'on' : ''}><input type="checkbox" checked={noShows.includes(p.userId)} onChange={e => setNoShows(s => (e.target.checked ? [...s, p.userId] : s.filter(x => x !== p.userId)))} />{p.name}</label>
        ))}</div>
      </div>
      <div className="row end"><Button type="submit" loading={busy}>Save result</Button></div>
    </form>
  );
}

function Comments({ g, onChange }) {
  const toast = useToast();
  const [text, setText] = useState(''), [busy, setBusy] = useState(false);
  async function post(e) {
    e.preventDefault(); if (!text.trim()) return; setBusy(true);
    try { const r = await api(`games?id=${g.id}&action=comment`, { method: 'POST', body: { text } }); setText(''); onChange(r.game); } catch (e2) { toast(e2.message, 'bad'); }
    setBusy(false);
  }
  async function remove(c) {
    try { const r = await api(`games?id=${g.id}&action=uncomment`, { method: 'POST', body: { commentId: c.id } }); onChange(r.game); } catch (e) { toast(e.message, 'bad'); }
  }
  return (
    <section className="card">
      <h2 className="h3">Chat</h2>
      {g.comments.length === 0 && <p className="muted small">No messages yet.</p>}
      <ul className="comments">{g.comments.map(c => (
        <li key={c.id}><Avatar name={c.name} size={30} /><div><p><b>{c.name}</b> <small className="muted">{ago(c.at)}</small></p><p className="ctext">{c.text}</p></div>
          {(c.mine || g.admin) && <button className="linkbtn small" onClick={() => remove(c)} aria-label="Delete message">Delete</button>}</li>
      ))}</ul>
      <form onSubmit={post} className="cform"><input value={text} onChange={e => setText(e.target.value)} placeholder="Running late? Need a ride?" maxLength={500} aria-label="Message" /><Button type="submit" loading={busy} disabled={!text.trim()}>Send</Button></form>
    </section>
  );
}

export default function Game({ id }) {
  const toast = useToast();
  const [g, setG] = useState(null), [err, setErr] = useState(''), [edit, setEdit] = useState(null);
  const load = useCallback(() => api(`games?id=${id}`).then(r => setG(r.game), e => setErr(e.message)), [id]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 20000);
    return () => clearInterval(t);
  }, [load]);
  if (err) return <div className="page"><p className="formerr">{err}</p><Link to="/home">← Home</Link></div>;
  if (!g) return <Spinner />;
  const end = new Date(+new Date(g.startsAt) + g.duration * 60e3);

  async function admin(action, msg, confirmText) {
    if (confirmText && !confirm(confirmText)) return;
    try {
      if (action === 'delete') { await api(`games?id=${g.id}`, { method: 'DELETE' }); toast('Game deleted'); navigate(`/g/${g.group.id}`); return; }
      const r = await api(`games?id=${g.id}&action=${action}`, { method: 'POST', body: {} }); setG(r.game); toast(msg);
    } catch (e) { toast(e.message, 'bad'); }
  }
  const next = { ...g, startsAt: new Date(+new Date(g.startsAt) + 7 * 864e5).toISOString() };

  return (
    <div className="page game">
      <Link to={`/g/${g.group.id}`} className="back">← {SPORT_ICON[g.group.sport]} {g.group.name}</Link>
      <div className="gamehead">
        <h1>{longDay(g.startsAt)}</h1>
        <p className="when">{clock(g.startsAt)} – {clock(end)}</p>
        {g.location && <a className="where" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(g.location)}`} target="_blank" rel="noreferrer">📍 {g.location}</a>}
      </div>
      <Banner g={g} />
      {g.notes && <p className="notes">{g.notes}</p>}

      {g.status === 'scheduled' && <Rsvp g={g} onChange={setG} />}
      <div className="row">
        <Button kind="ghost" className="sm" onClick={() => calendarFile(g)}>📅 Add to calendar</Button>
        <Button kind="ghost" className="sm" onClick={() => share({ title: g.group.name, text: `${g.group.name} — ${longDay(g.startsAt)} ${clock(g.startsAt)}. Are you in?`, url: location.href }, toast)}>↗ Share</Button>
      </div>

      <section className="card roster">
        <People title={`In · ${g.taken}/${g.capacity}`} list={g.roster.in} empty="Nobody yet — be the first." />
        {g.roster.waitlist.length > 0 && <People title="Waitlist" list={g.roster.waitlist} numbered />}
        {g.roster.maybe.length > 0 && <People title="Maybe" list={g.roster.maybe} />}
        {g.roster.out.length > 0 && <People title="Out" list={g.roster.out} />}
      </section>

      <Teams g={g} onChange={setG} />
      {g.admin && g.status === 'scheduled' && g.started && <Result key={(g.teams || []).length} g={g} onChange={setG} />}
      {g.status === 'played' && g.final?.noShows?.length > 0 && <p className="muted small">No-shows: {g.final.noShows.map(id => g.roster.in.find(p => p.userId === id)?.name || 'a player').join(', ')}</p>}
      <Comments g={g} onChange={setG} />

      {g.admin && (
        <section className="card">
          <h2 className="h3">Organizer</h2>
          <div className="row">
            {g.status === 'scheduled' && <Button kind="ghost" className="sm" onClick={() => setEdit('edit')}>Edit game</Button>}
            <Button kind="ghost" className="sm" onClick={() => setEdit('next')}>Post next week's game</Button>
            {g.status === 'scheduled' && <Button kind="ghost" className="sm" onClick={() => admin('cancel', 'Game canceled', 'Cancel this game? Players will see it as canceled.')}>Cancel game</Button>}
            {g.status !== 'scheduled' && <Button kind="ghost" className="sm" onClick={() => admin('reopen', 'Game reopened')}>Reopen</Button>}
            <Button kind="danger" className="sm" onClick={() => admin('delete', '', 'Delete this game and its chat?')}>Delete</Button>
          </div>
        </section>
      )}
      {edit && <GameForm group={g.group} from={edit === 'edit' ? g : next} editId={edit === 'edit' ? g.id : null} onClose={() => setEdit(null)} onSaved={load} />}
    </div>
  );
}
