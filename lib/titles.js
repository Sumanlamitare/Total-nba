// Sentence headlines for feed entries ("Tatum hits 50", "Heat complete a 22-point comeback"), from each entry's own
// facts. The short all-caps headline stays as the event label; this is the line people read first.
import { pick, possessive } from './voice.js';

const last = p => { const n = String(p?.name || '').split(' '); return n.length > 1 ? n.slice(1).join(' ').replace(/\b(Jr\.?|Sr\.?|II|III|IV)$/, '').trim() || n.at(-1) : n[0]; };
const short = t => t?.short || t?.name?.split(' ').slice(-1)[0] || t?.abbr || '';
const an = run => (/^(8|11|18)\b|^8\d/.test(String(run)) ? 'an' : 'a');
const statOf = (e, label) => e.stats?.find(s => s.label === label)?.value;

export function titleOf(e) {
  const p = e.players?.[0], who = p ? last(p) : '', team = short(e.team);
  const f = e.facts || {};
  const teams = e.game?.teams || [];
  const [a, b] = teams.map(short);
  const pts = statOf(e, 'PTS');
  switch (e.category) {
    case 'scoring':
      if (pts >= 50) return `${who} hits ${pts}`;
      if (pts >= 40) return pick(e._id, [`${who} drops ${pts}`, `${who} pours in ${pts}`]);
      return /EFFICIENT|SURGICAL/.test(e.headline) ? `${who} can't miss: ${pts} points` : `${who} scores ${pts}`;
    case 'triple-double': return e.headline === 'QUADRUPLE-DOUBLE' ? `${who} records a quadruple-double` : `${who} posts a triple-double`;
    case 'breakout': return e.headline === 'HISTORIC NIGHT' ? `${who} makes history` : /CAREER/.test(e.headline) ? `${who} sets a career high` : `Big night for ${who}`;
    case 'role-player': return f.starter === false ? `${who} delivers off the bench` : `${who} steps up`;
    case 'rookie': return `Rookie ${who} ${/DOUBLE/.test(e.headline) ? 'posts a double-double' : 'takes over'}`;
    case 'defense': return `${who} locks it down`;
    case 'clutch': return `${who} closes it out`;
    case 'disappointment': return `A rough night for ${who}`;
    case 'potn': return `${who}: Performance of the Night`;
    case 'game-winner': return f.buzzer ? `${who} wins it at the buzzer` : f.kind === 'free throws' ? `${who} seals it at the line` : `${who} hits the game-winner`;
    case 'defensive-winner': return f.kind === 'block' ? `${who} saves it with a block` : f.kind === 'steal' ? `${who} saves it with a steal` : `${who} secures the win`;
    case 'solo-run': return f.consecutive ? `${who} takes over: ${f.consecutive} straight` : `${who} carries the ${team}`;
    case 'run': return f.flipped ? `${team} flip it with ${an(f.run)} ${f.run} run` : `${team} on ${an(f.run)} ${f.run} run`;
    case 'close': return f.cls >= 3 ? `${a} and ${b} down to the wire` : `${a} and ${b} in a tight one`;
    case 'overtime': return f.n > 1 ? `${a}–${b} headed to ${f.n === 2 ? 'double' : f.n === 3 ? 'triple' : `${f.n}x`} overtime` : `${a}–${b} going to overtime`;
    case 'comeback': if (e.headline === 'COMEBACK FELL SHORT') return `${possessive(team)} ${f.deficit}-point rally falls short`;
      return f.state >= 4 ? `${team} take the lead after trailing by ${f.deficit}` : f.state === 3 ? `${team} tie it after trailing by ${f.deficit}` : `${team} cut a ${f.deficit}-point deficit to ${f.current}`;
    case 'comeback-done': return `${team} complete a ${f.deficit}-point comeback`;
    case 'collapse': return f.stage === 2 ? `${team} blow a ${f.maxLead}-point lead` : `${possessive(team)} ${f.maxLead}-point lead is slipping`;
    case 'blowout': return `${team} push the lead to ${f.lead}`;
    case 'streak': return /SNAPPED|SKID/.test(e.headline) ? (/SKID/.test(e.headline) ? `${team} end a ${f.prev}-game skid` : `${possessive(team)} ${f.prev}-game streak snapped`) : f.type === 'W' ? `${team} extend win streak to ${f.n}` : `${team} have lost ${f.n} straight`;
    case 'record': return f.state === 'approaching' ? `${who} chasing a record` : `${who} ${f.state === 'tied' ? 'ties' : 'breaks'} ${/franchise/i.test(f.category || '') ? 'a franchise' : 'a'} record`;
    case 'milestone': return f.state === 'approaching' ? `${who} closing in on ${f.title}` : `${who} reaches ${f.title}`;
    default: return e.headline;
  }
}
