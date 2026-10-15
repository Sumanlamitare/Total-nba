import { Link, Logo, Avatar } from '../ui.jsx';

const IN = ['Marcus Bell', 'Ana Ruiz', 'Sam Cole', 'Jo Park', 'Dee Grant', 'Eli Shaw', 'Ben Ito', 'Fay Nolan', 'Cy Ford'];
const SPORTS = ['🏀 Basketball', '⚽ Soccer', '🏐 Volleyball', '🏓 Pickleball', '🎾 Tennis', '🥏 Ultimate', '🏈 Flag football', '🏒 Hockey', '🥎 Softball', '🏸 Badminton', '🏃 Run clubs'];

const FEATURES = [
  ['One tap: in, maybe, out', 'Players answer from a link on their phone. No more counting thumbs-up emojis in a 200-message thread.'],
  ['Waitlist that runs itself', 'When the game is full, newcomers queue in order. Someone drops — the next person is in, automatically.'],
  ['Fair teams in a second', 'Rate players 1–5 privately and Turnout drafts balanced teams. Don\'t like them? Reshuffle.'],
  ['Know who shows up', 'Record the score and no-shows after the game. Everyone gets an attendance and reliability record.'],
  ['Bring a friend', 'Players can add guests, who count toward the spots. Turnout splits court or field costs per head.'],
  ['Talk it out', 'Every game has its own thread — for "running 5 late", "bring both colors", and "good run" afterwards.'],
];

const FAQ = [
  ['Is it really free?', 'Yes — for organizers and players. No ads, no paid tier.'],
  ['Do my players need an account?', 'They sign up once with a name and email (about 20 seconds), then it\'s one tap per game.'],
  ['What about leagues with fixed teams?', 'Turnout is built for pickup and drop-in play, where who\'s coming changes every week. Many rec teams use it for practices too.'],
  ['Who can see my group?', 'Only members. People join with your invite link, and you can replace the link any time.'],
];

export default function Landing() {
  return (
    <div className="site">
      <header className="sitenav">
        <div className="wrap">
          <Logo />
          <nav><Link to="/login" className="navlink">Log in</Link><Link to="/signup" className="btn primary sm">Start a group</Link></nav>
        </div>
      </header>

      <section className="hero">
        <div className="wrap herogrid">
          <div>
            <p className="kicker">Free for pickup games & rec groups</p>
            <h1>Run the game,<br />not the group chat.</h1>
            <p className="lede">One link for your crew. One tap to say you're in. Turnout handles the headcount, the waitlist, fair teams and who actually showed up.</p>
            <div className="ctas">
              <Link to="/signup" className="btn primary lg">Start a group — free</Link>
              <a href="#how" className="btn ghost lg">See how it works</a>
            </div>
          </div>
          <div className="phone" aria-label="Example game">
            <div className="ph-top"><span>🏀 Tuesday Night Hoops</span><span className="pill wait">1 spot left</span></div>
            <h3>Tuesday · 7:00 PM</h3>
            <p className="muted small">Rucker Park · $3 each</p>
            <div className="meter"><i style={{ width: '90%' }} /></div>
            <p className="small"><b>9 of 10 in</b> · 2 on the waitlist</p>
            <div className="seg demo-seg"><span className="on">I'm in</span><span>Maybe</span><span>Out</span></div>
            <div className="faces">{IN.map(n => <Avatar key={n} name={n} size={34} ring />)}</div>
            <div className="ph-chat"><Avatar name="Jo Park" size={24} /><p><b>Jo</b> running 5 late, save me a spot 🙏</p></div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap sports">{SPORTS.map(s => <span key={s}>{s}</span>)}</div>
      </section>

      <section className="section" id="how">
        <div className="wrap">
          <h2 className="h2">Set up in a minute.</h2>
          <ol className="steps">
            <li><b>Start a group</b><span>Name it, pick the sport and your usual spot.</span></li>
            <li><b>Share the link</b><span>Drop the invite in your existing chat. Players join with one tap.</span></li>
            <li><b>Post a game</b><span>Set the time and the number of spots. Everyone answers in, maybe or out.</span></li>
            <li><b>Play</b><span>Make teams, record the score, and see who's reliable over the season.</span></li>
          </ol>
        </div>
      </section>

      <section className="section alt">
        <div className="wrap">
          <h2 className="h2">Everything the group chat can't do.</h2>
          <div className="features">{FEATURES.map(([t, d]) => <div key={t} className="feature"><h3>{t}</h3><p>{d}</p></div>)}</div>
        </div>
      </section>

      <section className="section">
        <div className="wrap narrow">
          <h2 className="h2">Questions</h2>
          <div className="faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      <section className="section finale">
        <div className="wrap narrow center">
          <h2 className="h2">Next run starts here.</h2>
          <Link to="/signup" className="btn primary lg">Start a group — free</Link>
        </div>
      </section>

      <footer className="sitefoot"><div className="wrap"><Logo /><nav className="footlinks"><Link to="/support">Support</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></nav><small>Made for the people who bring the ball.</small></div></footer>
    </div>
  );
}
