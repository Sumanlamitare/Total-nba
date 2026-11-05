// AI writing for the feed: a short summary in the house voice for the most significant entries, written only from the
// entry's own facts (scores, clock, statistics, record context, sources). The rule-based text is always kept; the AI
// text is stored separately and shown labelled as AI-written. Needs an Anthropic API key (ANTHROPIC_API_KEY, or saved
// encrypted in Settings → Integrations); without one, the feed simply uses the rule-based text.
import Anthropic from '@anthropic-ai/sdk';
import { credential } from './secrets.js';

export const MODEL = 'claude-opus-5-5';

const VOICE = {
  balanced: 'Informative first, entertaining second: a sharp basketball writer — specific, conversational, a little personality.',
  straight: 'Straight news: crisp, factual, no flourish.',
  lively: 'Lively broadcast energy — punchy and vivid — but every claim still comes from the facts.',
};

const RULES = `You write one short feed post for Around the NBA, a live NBA event feed.
- Use only the facts in the JSON. No numbers, records, history, comparisons or player details that aren't there; never estimate.
- Keep scope exact: a "box-score era" record is not an all-time NBA record; franchise is not league; regular season is not playoffs; tied is not broken; a developing story (status "developing") is not final — write in the present tense and say what's still to be decided.
- Describe scoring and possession patterns; don't present "momentum" as a measured fact.
- Refer to players by name, not pronouns. No hashtags, no emoji, no invented crowd reactions, no hype words.
- Two or three sentences, under 320 characters. Return only the post text.`;

async function client(d) {
  const c = await credential(d, 'anthropic');
  return c ? new Anthropic({ apiKey: c.apiKey, maxRetries: 1, timeout: 45_000 }) : null;
}
export const aiAvailable = async d => !!(await credential(d, 'anthropic'));

export async function feedSummary(d, entry, style = 'balanced') {
  const ai = await client(d);
  if (!ai) return { needsKey: true };
  const facts = {
    category: entry.category, status: entry.status, headline: entry.headline, ruleText: entry.body, facts: entry.facts, stats: entry.stats,
    players: entry.players?.map(p => ({ name: p.name, team: p.team })), team: entry.team?.name || entry.team?.abbr,
    game: { teams: entry.game?.teams?.map(t => `${t.abbr} ${t.score ?? ''}`), status: entry.game?.label, moment: entry.game?.moment, playoffs: entry.game?.stype === 3 },
    verification: entry.verification?.status,
  };
  const res = await ai.beta.messages.create({
    model: MODEL, max_tokens: 2000,
    system: `${RULES}\nVoice: ${VOICE[style] || VOICE.balanced}`,
    messages: [{ role: 'user', content: JSON.stringify(facts) }],
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
  });
  if (res.stop_reason === 'refusal') return { error: 'model declined' };
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
  return text ? { text: text.slice(0, 600), model: res.model || MODEL } : { error: 'empty response' };
}
