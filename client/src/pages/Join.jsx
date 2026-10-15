import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Link, Logo, Button, Spinner, navigate, useToast } from '../ui.jsx';
import { useUser } from '../App.jsx';
import { SPORT_ICON } from './Home.jsx';

export default function Join({ code }) {
  const { user } = useUser(), toast = useToast();
  const [g, setG] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { api(`groups?invite=${code}`).then(r => setG(r.group), e => setErr(e.message)); }, [code]);

  async function join() {
    setBusy(true);
    try { const r = await api(`groups?invite=${code}&action=join`, { method: 'POST', body: {} }); toast(`Welcome to ${g.name}!`); navigate(`/g/${r.id}`); }
    catch (e) { setErr(e.message); setBusy(false); }
  }
  const next = encodeURIComponent(`/join/${code}`);
  return (
    <div className="center-page">
      <div className="card narrow joincard">
        <Logo />
        {err ? <><h1>Hmm.</h1><p className="formerr">{err}</p><Link to="/" className="btn ghost">Go to Turnout</Link></>
          : !g || user === undefined ? <Spinner />
          : <>
            <p className="muted">You're invited to join</p>
            <div className="joinhead"><span className="sporticon big">{SPORT_ICON[g.sport]}</span><div><h1>{g.name}</h1><p className="muted">{[g.location, `${g.members} member${g.members === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</p></div></div>
            {g.about && <p className="about">{g.about}</p>}
            {g.joined ? <Link to={`/g/${g.id}`} className="btn primary lg block">You're a member — open group</Link>
              : user ? <Button className="lg block" loading={busy} onClick={join}>Join group</Button>
              : <div className="stack">
                <Link to={`/signup?next=${next}`} className="btn primary lg block">Sign up to join</Link>
                <Link to={`/login?next=${next}`} className="btn ghost block">I already have an account</Link>
              </div>}
          </>}
      </div>
    </div>
  );
}
