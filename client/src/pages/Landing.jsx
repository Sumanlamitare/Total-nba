import { useEffect } from 'react';
import { Link, Logo, Pill, Spark } from '../ui.jsx';
import { useUser } from '../App.jsx';

export function SiteNav() {
  const { user } = useUser();
  return (
    <header className="sitenav">
      <div className="wrap">
        <Logo />
        <nav>
          <Link to="/docs">Docs</Link>
          <Link to="/pricing" className="hide-xs">Pricing</Link>
          {user ? <Link to="/app" className="btn primary sm">Dashboard</Link> : <>
            <Link to="/login" className="hide-sm">Log in</Link>
            <Link to="/signup" className="btn primary sm">Start free</Link>
          </>}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="sitefoot">
      <div className="wrap">
        <Logo />
        <nav><Link to="/docs">Docs</Link><Link to="/pricing">Pricing</Link><Link to="/login">Log in</Link><Link to="/signup">Sign up</Link></nav>
        <small>© {new Date().getFullYear()} Nightjar. Watching your jobs while you sleep.</small>
      </div>
    </footer>
  );
}

const DEMO = [
  { name: 'Nightly database backup', every: 'daily · 03:00', state: 'up', last: '6 h ago', p: 's'.repeat(30) },
  { name: 'Invoice run', every: 'hourly', state: 'up', last: '12 min ago', p: 's'.repeat(30) },
  { name: 'Search reindex', every: 'every 15 min', state: 'late', last: '24 min ago', p: 's'.repeat(27) },
  { name: 'S3 → warehouse sync', every: 'every 6 hours', state: 'down', last: '19 h ago', p: 's'.repeat(24) + 'sfsff' },
];

const FEATURES = [
  ['Silence is the alert', 'Error trackers wait for something to break loudly. Nightjar notices when nothing happens at all — the job that never started.'],
  ['Failures and exit codes', 'Ping /fail, or send the exit code, and a crashed job alerts right away instead of waiting for its deadline.'],
  ['Run times', 'Ping /start when a job begins and Nightjar times every run, so you can see the backup that went from 4 minutes to 40.'],
  ['Logs with the ping', 'POST the job\'s output to the ping URL. The first kilobyte is kept with the run, right where you\'ll look.'],
  ['Grace time', 'Jobs drift. Set how late is too late, and get no alarms for a job that runs three minutes behind.'],
  ['Status pages & badges', 'Share a public page for the checks you choose, or drop a live status badge into a README.'],
];

const TIERS = [
  { name: 'Free', price: '$0', note: 'forever', cta: 'Start free', items: ['20 checks', '3 alert channels', 'Slack, Discord, phone push, webhooks', 'Public status page & badges', 'Last 100 pings per check'] },
  { name: 'Pro', price: '$12', note: 'per month', soon: true, items: ['200 checks', '20 alert channels', 'Everything in Free', 'Priority support'], featured: true },
  { name: 'Team', price: '$39', note: 'per month', soon: true, items: ['1,000 checks', '100 alert channels', 'Everything in Pro', 'Shared team workspace'] },
];

export function Pricing() {
  return (
    <section className="section" id="pricing">
      <div className="wrap">
        <p className="eyebrow">Pricing</p>
        <h2 className="h2">Start free. Stay free for most side projects.</h2>
        <div className="tiers">
          {TIERS.map(t => (
            <div key={t.name} className={'tier' + (t.featured ? ' featured' : '')}>
              <h3>{t.name}{t.soon && <span className="soon">Coming soon</span>}</h3>
              <p className="price"><b>{t.price}</b> <span>{t.note}</span></p>
              <ul>{t.items.map(i => <li key={i}>{i}</li>)}</ul>
              {t.soon ? <span className="btn ghost block disabled">Opens after the beta</span> : <Link to="/signup" className="btn primary block">{t.cta}</Link>}
            </div>
          ))}
        </div>
        <p className="fine">Nightjar is in public beta. Paid plans open later; your Free account and its checks stay free.</p>
      </div>
    </section>
  );
}

const FAQ = [
  ['What is a check?', 'One scheduled job you want watched. You tell Nightjar how often it runs; it gives you a unique URL for the job to call each time it finishes.'],
  ['Do I need to install anything?', 'No. Anything that can make an HTTP request can ping: curl, wget, PowerShell, Python, Node, a GitHub Action, a Kubernetes CronJob.'],
  ['How fast will I hear about a missed job?', 'Within a few minutes of the deadline (schedule + grace time). Failures you report with /fail alert immediately.'],
  ['What happens to my data?', 'We keep each check\'s settings, its last 100 pings and its up/down history. Ping URLs are long random keys. Delete your account and all of it is deleted with it.'],
];

export default function Landing() {
  useEffect(() => { if (location.pathname === '/pricing') document.getElementById('pricing')?.scrollIntoView(); }, []);
  return (
    <div className="site">
      <SiteNav />
      <section className="hero">
        <div className="stars" aria-hidden="true" />
        <div className="wrap herogrid">
          <div>
            <p className="eyebrow">Cron job monitoring</p>
            <h1>Know the moment a scheduled job <em>doesn't</em> run.</h1>
            <p className="lede">Backups, invoices, syncs and cleanups fail quietly. Add one line to the end of a job — if Nightjar doesn't hear from it on time, you hear from Nightjar, in Slack, Discord or on your phone.</p>
            <div className="ctas">
              <Link to="/signup" className="btn primary lg">Start free — no card</Link>
              <Link to="/docs" className="btn ghost lg">How it works</Link>
            </div>
            <p className="micro">Free in beta · 20 checks · set up in two minutes</p>
          </div>
          <div className="demo" aria-label="Example dashboard">
            <div className="term"><span className="c"># crontab</span>{'\n'}0 3 * * *  /opt/backup.sh <b>&& curl -fsS {location.host}/p/K7fQ2…</b></div>
            <div className="demolist">
              {DEMO.map(d => (
                <div key={d.name} className="demorow">
                  <div><b>{d.name}</b><small>{d.every} · last ping {d.last}</small></div>
                  <Spark pings={[...d.p].map(k => ({ kind: k === 'f' ? 'fail' : 'success' }))} n={30} />
                  <Pill state={d.state} />
                </div>
              ))}
            </div>
            <div className="notif"><span className="nlogo">#ops</span><div><b>🔴 S3 → warehouse sync is DOWN</b><small>No ping received — expected every 6 hours. Last ping: 19 hours ago.</small></div></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h2 className="h2">Three steps. One line of code.</h2>
          <ol className="steps">
            <li><b>Create a check</b><span>Name the job and say how often it runs — every 5 minutes, nightly, weekly — plus how late is too late.</span></li>
            <li><b>Add the ping</b><span>Put <code>curl</code> on the end of the job. It calls your check's URL each time the job succeeds.</span></li>
            <li><b>Sleep</b><span>If a ping is late or the job reports a failure, your alerts go out. When it recovers, you get the all-clear.</span></li>
          </ol>
        </div>
      </section>

      <section className="section alt">
        <div className="wrap">
          <p className="eyebrow">Features</p>
          <h2 className="h2">Built for the jobs nobody watches.</h2>
          <div className="features">{FEATURES.map(([t, d]) => <div key={t} className="feature"><h3>{t}</h3><p>{d}</p></div>)}</div>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div>
            <p className="eyebrow">Alerts</p>
            <h2 className="h2">Told where you already are.</h2>
            <p className="body">Connect as many places as you like. Every check alerts all of them when it goes down, and again when it's back.</p>
          </div>
          <ul className="channels">
            <li><b>Slack</b><span>Incoming webhook into any channel</span></li>
            <li><b>Discord</b><span>A channel webhook — great for small teams</span></li>
            <li><b>Phone push</b><span>Free push notifications through the ntfy app</span></li>
            <li><b>Webhooks</b><span>JSON to your own endpoint, for anything else</span></li>
          </ul>
        </div>
      </section>

      <Pricing />

      <section className="section alt">
        <div className="wrap narrow">
          <p className="eyebrow">Questions</p>
          <h2 className="h2">Good to know</h2>
          <div className="faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      <section className="section cta-end">
        <div className="wrap narrow center">
          <h2 className="h2">Your jobs run at 3 a.m. So should someone's attention.</h2>
          <Link to="/signup" className="btn primary lg">Create your first check</Link>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
