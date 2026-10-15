import { useState } from 'react';
import { Code, Tabs, Link } from '../ui.jsx';
import { SiteNav, SiteFooter } from './Landing.jsx';
import { snippets } from '../snippets.js';

export function SnippetTabs({ url }) {
  const list = snippets(url), [tab, setTab] = useState(list[0][0]);
  const cur = list.find(s => s[0] === tab);
  return <div><Tabs tabs={list.map(s => [s[0], s[1]])} value={tab} onChange={setTab} /><Code lang={tab}>{cur[2]}</Code></div>;
}

export default function Docs() {
  const url = `${location.origin}/p/<your-key>`;
  return (
    <div className="site">
      <SiteNav />
      <main className="wrap docs">
        <aside className="toc">
          <a href="#start">Getting started</a><a href="#ping">The ping URL</a><a href="#schedule">Schedule & grace</a>
          <a href="#states">States</a><a href="#examples">Examples</a><a href="#alerts">Alerts</a><a href="#webhook">Webhook format</a><a href="#status">Status pages & badges</a>
        </aside>
        <article>
          <h1>Documentation</h1>
          <p className="lede">Nightjar is a dead man's switch for scheduled work. Your job calls a URL when it finishes; if the call doesn't come on time, you get an alert.</p>

          <h2 id="start">Getting started</h2>
          <ol>
            <li><Link to="/signup">Create an account</Link> and click <b>New check</b>.</li>
            <li>Pick how often the job runs and how much grace time to allow.</li>
            <li>Copy the check's ping URL and call it at the end of your job.</li>
            <li>Under <b>Alerts</b>, connect Slack, Discord, your phone or a webhook.</li>
          </ol>

          <h2 id="ping">The ping URL</h2>
          <p>Every check gets a private URL. Any HTTP method works (<code>GET</code>, <code>POST</code>, <code>HEAD</code>). Treat it like a password — anyone with it can ping your check.</p>
          <table className="ref">
            <tbody>
              <tr><td><code>/p/&lt;key&gt;</code></td><td>The job finished successfully.</td></tr>
              <tr><td><code>/p/&lt;key&gt;/start</code></td><td>The job started. The next success or failure records how long it ran.</td></tr>
              <tr><td><code>/p/&lt;key&gt;/fail</code></td><td>The job failed. Alerts go out immediately.</td></tr>
              <tr><td><code>/p/&lt;key&gt;/&lt;exit code&gt;</code></td><td><code>0</code> counts as success; anything else as failure. Handy as <code>…/$?</code> in shell.</td></tr>
              <tr><td><code>/p/&lt;key&gt;/log</code></td><td>Records a message without changing the check's state.</td></tr>
            </tbody>
          </table>
          <p>Send a request body with <code>POST</code> and the first 1,000 characters are stored with that ping — the last lines of a log, a row count, an error message. The response is <code>OK</code> (200), or 404 if the key is wrong.</p>

          <h2 id="schedule">Schedule & grace time</h2>
          <p><b>Schedule</b> is how often the job is expected to ping — every 5 minutes, hourly, daily. <b>Grace time</b> is how long past that Nightjar waits before calling it down. A daily job with one hour of grace goes down if 25 hours pass without a ping.</p>
          <p>Missed deadlines are picked up within a few minutes. Failures reported with <code>/fail</code> or a non-zero exit code alert immediately.</p>

          <h2 id="states">States</h2>
          <table className="ref"><tbody>
            <tr><td><span className="pill s-new"><i />Waiting</span></td><td>Created, no ping yet. Nothing is monitored until the first ping.</td></tr>
            <tr><td><span className="pill s-up"><i />Up</span></td><td>Pinging on schedule.</td></tr>
            <tr><td><span className="pill s-running"><i />Running</span></td><td>A <code>/start</code> arrived and the job hasn't finished yet.</td></tr>
            <tr><td><span className="pill s-late"><i />Late</span></td><td>Past its schedule but inside the grace time. No alert yet.</td></tr>
            <tr><td><span className="pill s-down"><i />Down</span></td><td>Missed the deadline or reported a failure. Alerts sent.</td></tr>
            <tr><td><span className="pill s-paused"><i />Paused</span></td><td>Not monitored. The next ping resumes it.</td></tr>
          </tbody></table>

          <h2 id="examples">Examples</h2>
          <SnippetTabs url={url} />

          <h2 id="alerts">Alerts</h2>
          <ul>
            <li><b>Slack</b> — create an <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer">incoming webhook</a> and paste its URL.</li>
            <li><b>Discord</b> — channel settings → Integrations → Webhooks → New webhook → Copy URL.</li>
            <li><b>Phone push</b> — install the free <a href="https://ntfy.sh" target="_blank" rel="noreferrer">ntfy</a> app, subscribe to a long, hard-to-guess topic name, and add the same topic in Nightjar.</li>
            <li><b>Webhook</b> — any https endpoint; we POST the JSON below.</li>
          </ul>
          <p>Every channel receives every check's alerts: once when it goes down, once when it's back up. Use <b>Send test</b> to try a channel.</p>

          <h2 id="webhook">Webhook format</h2>
          <Code lang="json">{`{
  "event": "down",            // "down" | "up" | "test"
  "check": {
    "id": "6710c0…",
    "name": "Nightly backup",
    "status": "down",
    "lastPing": "2026-10-14T03:00:12.000Z",
    "period": 86400,          // seconds
    "grace": 3600
  },
  "message": "🔴 Nightly backup is DOWN\\nNo ping received — expected every 1 day. …",
  "at": "2026-10-15T04:02:00.000Z"
}`}</Code>

          <h2 id="status">Status pages & badges</h2>
          <p>Under <b>Status page</b>, choose an address and switch on the checks you want to show. The page lists each one with 30 days of history — names and states only, never ping URLs.</p>
          <p>Each check also has a badge for READMEs and dashboards:</p>
          <Code lang="md">{`![backup status](${location.origin}/b/<badge-id>.svg)`}</Code>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
