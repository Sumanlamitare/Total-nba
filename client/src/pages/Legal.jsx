import { Link, Logo } from '../ui.jsx';

// Change this to a real inbox before submitting to the App Store.
export const CONTACT = 'support@turnout.example';
const UPDATED = 'October 15, 2026';

function Page({ title, children }) {
  return (
    <div className="site legal">
      <header className="sitenav"><div className="wrap"><Logo /><nav><Link to="/login" className="navlink">Log in</Link></nav></div></header>
      <main className="wrap narrow"><h1>{title}</h1><p className="muted small">Last updated {UPDATED}</p>{children}</main>
    </div>
  );
}

export function Terms() {
  return (
    <Page title="Terms of Use">
      <p>Turnout helps groups organize pickup games. By creating an account you agree to these terms.</p>
      <h2>Your account</h2>
      <p>Give your real name or the name your group knows you by, keep your password private, and be at least 13 years old. You're responsible for what happens under your account.</p>
      <h2>Zero tolerance for abuse</h2>
      <p>Game chats and group details are written by members. You may not post anything abusive, harassing, hateful, sexually explicit, violent, threatening, or illegal, or impersonate anyone. Report messages from the ⋯ menu next to them and block people you don't want to hear from. We review reports within 24 hours and remove offending content and accounts.</p>
      <h2>Games are organized by players</h2>
      <p>Turnout doesn't run, supervise or insure any game. You play at your own risk, follow the rules of the venue, and settle any shared costs among yourselves.</p>
      <h2>The service</h2>
      <p>Turnout is free and provided as is, without warranties. We may change or stop features, and may suspend accounts that break these terms. You can delete your account at any time from the Account screen.</p>
      <h2>Contact</h2>
      <p>{CONTACT}</p>
    </Page>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy Policy">
      <p>Turnout collects only what it needs to organize games, and never sells data or shows ads.</p>
      <h2>What we store</h2>
      <ul>
        <li><b>Account:</b> your name, email address and a scrambled (hashed) password.</li>
        <li><b>Groups and games:</b> the groups you join, your answers (in, maybe, out, guests), messages you post, results and attendance recorded by organizers, and skill ratings organizers set to balance teams (visible only to organizers).</li>
        <li><b>App notifications:</b> if you allow them, your phone's push token and time zone, so we can tell you about new games and waitlist spots.</li>
        <li><b>Reports:</b> when you report a message, we keep the message and who reported it so we can review it.</li>
      </ul>
      <h2>Who can see it</h2>
      <p>Members of your groups see your name, your answers, results and messages. Nothing is public. We don't use tracking, analytics or advertising tools.</p>
      <h2>Where it lives</h2>
      <p>Data is stored with our hosting and database providers. Push notifications are delivered through Expo and Apple. Signing in uses a secure cookie on the web and the device keychain in the app.</p>
      <h2>Deleting your data</h2>
      <p>Delete your account any time from Account → Delete account. Your profile, answers and devices are removed immediately; groups you own alone are deleted too.</p>
      <h2>Contact</h2>
      <p>{CONTACT}</p>
    </Page>
  );
}

export function Support() {
  return (
    <Page title="Support">
      <p>Questions, bugs or something to report? Email <b>{CONTACT}</b> and we'll get back to you, usually within a day.</p>
      <h2>Common questions</h2>
      <p><b>How do I join a group?</b> Open the invite link your organizer sent, or paste it under Home → Join.</p>
      <p><b>I'm on the waitlist — will I know if I get in?</b> Yes. The app notifies you the moment a spot opens up.</p>
      <p><b>How do I delete my account?</b> Account → Delete account. Everything is removed immediately.</p>
      <p><b>Someone is being abusive.</b> Tap ⋯ next to their message to report it or block them, and email us. We review reports within 24 hours.</p>
    </Page>
  );
}
