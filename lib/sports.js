// Per-sport settings. Every number here is a starting value from the research report, to be re-tuned
// on the tool's own logged results (walk-forward only).

// ESPN's prop names -> which game-log stats they sum, and which distribution prices them
const nflMarket = name => {
  const n = name.replace(/\s*\(incl\. overtime\)/i, '').trim();
  const M = {
    'Total Passing Yards': { stats: ['passingYards'], dist: 'normal', label: 'Pass Yds' },
    'Total Pass Completions': { stats: ['completions'], dist: 'count', label: 'Completions' },
    'Total Passing Attempts': { stats: ['passingAttempts'], dist: 'count', label: 'Pass Att' },
    'Total Passing Touchdowns': { stats: ['passingTouchdowns'], dist: 'count', label: 'Pass TD' },
    'Total Passing Interceptions': { stats: ['interceptions'], dist: 'count', label: 'INT' },
    'Total Carries': { stats: ['rushingAttempts'], dist: 'count', label: 'Carries' },
    'Total Rushing Yards': { stats: ['rushingYards'], dist: 'normal', label: 'Rush Yds' },
    'Total Receiving Yards': { stats: ['receivingYards'], dist: 'normal', label: 'Rec Yds' },
    'Total Receptions': { stats: ['receptions'], dist: 'count', label: 'Receptions' },
    'Total Passing Plus Rushing Yards': { stats: ['passingYards', 'rushingYards'], dist: 'normal', label: 'Pass+Rush Yds' },
    'Total Rushing Plus Receiving Yards': { stats: ['rushingYards', 'receivingYards'], dist: 'normal', label: 'Rush+Rec Yds' },
    'Anytime Touchdown Scorer': { stats: ['rushingTouchdowns', 'receivingTouchdowns'], dist: 'td', label: 'Anytime TD' },
  };
  return M[n] || null;
};

// NBA prop names are built from parts ("Total Points", "Points + Rebounds + Assists", "Three Pointers Made"...)
const nbaMarket = name => {
  if (/quarter|half|first|1st|2nd|3rd|4th|double|team|game|milestone/i.test(name)) return null;
  const parts = [];
  if (/three|3-?pt|3-?point/i.test(name)) parts.push('threes');
  if (/\bpoints?\b/i.test(name.replace(/three[- ]?points?|3-?points?/ig, ''))) parts.push('points');
  if (/rebound/i.test(name)) parts.push('rebounds');
  if (/assist/i.test(name)) parts.push('assists');
  if (/steal/i.test(name)) parts.push('steals');
  if (/block/i.test(name)) parts.push('blocks');
  if (/turnover/i.test(name)) parts.push('turnovers');
  if (!parts.length) return null;
  const short = { points: 'PTS', rebounds: 'REB', assists: 'AST', threes: '3PM', steals: 'STL', blocks: 'BLK', turnovers: 'TOV' };
  return { stats: parts, dist: parts.includes('points') || parts.length > 2 ? 'normal' : 'count', label: parts.map(p => short[p]).join('+') };
};

export const SPORTS = {
  nba: {
    name: 'NBA',
    market: nbaMarket,
    // game-log stat name candidates for each part (ESPN names differ slightly across endpoints)
    keys: { points: ['points'], rebounds: ['totalRebounds', 'rebounds'], assists: ['assists'], threes: ['threePointFieldGoalsMade'],
      steals: ['steals'], blocks: ['blocks'], turnovers: ['turnovers'], minutes: ['minutes'] },
    // per-minute rates padded with k minutes of the prior (Medvedovsky-style padding)
    padMinutes: { points: 250, rebounds: 300, assists: 300, threes: 400, steals: 600, blocks: 600, turnovers: 400 },
    vmr: { points: 2.0, rebounds: 1.3, assists: 1.3, threes: 1.3, steals: 1.1, blocks: 1.3, turnovers: 1.1 }, // variance-to-mean priors
    rateHalfLife: 15, // games
    minutesBlend: 0.75, // season share of projected minutes (rest from last 5)
    blowoutSpread: 10, blowoutCut: 0.96, backToBackCut: 0.97,
    lastFiveLine: ['minutes', 'points', 'rebounds', 'assists', 'threes', 'steals', 'blocks', 'turnovers'],
    game: { hfa: 2.0, sdMargin: 12, sdTotal: 18, priorGames: 10 },
  },
  nfl: {
    name: 'NFL',
    market: nflMarket,
    keys: {},
    halfLife: 4, padGames: 3, // per-game volume, padded with 3 games of last season
    cv: { passingYards: 0.32, rushingYards: 0.55, receivingYards: 0.65 }, // spread of yards, relative to the mean
    vmr: { receptions: 1.2, completions: 1.15, passingAttempts: 1.15, rushingAttempts: 1.3, passingTouchdowns: 1.1, interceptions: 1.05 },
    lastFiveLine: ['completions', 'passingAttempts', 'passingYards', 'passingTouchdowns', 'rushingAttempts', 'rushingYards', 'receptions', 'receivingTargets', 'receivingYards', 'receivingTouchdowns', 'rushingTouchdowns'],
    game: { hfa: 1.5, sdMargin: 13.3, sdTotal: 13, priorGames: 4 },
  },
};
export const MODEL = { maxModel: 0.8, wProp: 0.4, wGame: 0.3, minEdgeProp: 0.03, minEdgeAssumed: 0.06, minEdgeGame: 0.02, kellyFrac: 0.25, kellyCap: 0.02, assumedPrice: -110 };

// ESPN game log -> rows newest first: { id, date, oppId, opp, home, result, score, season, post, s: { stat: number } }
export function parseGamelog(gl, seasonYear) {
  if (!gl?.names) return [];
  const names = gl.names, rows = [];
  for (const st of gl.seasonTypes || []) {
    if (/pre-?season|all-?star/i.test(st.displayName || '')) continue;
    const post = /post|playoff|play-in/i.test(st.displayName || '');
    for (const cat of st.categories || []) {
      for (const e of cat.events || []) {
        const ev = gl.events?.[e.eventId];
        if (!ev) continue;
        const s = {};
        names.forEach((n, i) => {
          const v = e.stats?.[i];
          if (n.includes('-')) { const [a, b] = n.split('-'), [x, y] = String(v ?? '').split('-'); s[a] = +x || 0; s[b] = +y || 0; } else s[n] = parseFloat(v) || 0;
        });
        rows.push({ id: e.eventId, date: (ev.gameDate || '').slice(0, 10), oppId: ev.opponent?.id, opp: ev.opponent?.abbreviation, home: ev.atVs === 'vs',
          result: ev.gameResult, score: ev.score, season: seasonYear, post, s });
      }
    }
  }
  const seen = new Set();
  return rows.filter(r => (seen.has(r.id) ? false : seen.add(r.id))).sort((a, b) => (a.date < b.date ? 1 : -1));
}
