"""Checks that NBA.com's stats API (via swar/nba_api) answers from this machine; writes results to probe-out/."""
import json, os, time, traceback
from nba_api.stats.endpoints import leaguegamelog
from nba_api.live.nba.endpoints import scoreboard

os.makedirs('probe-out', exist_ok=True)
out = {}
def run(name, fn):
    t = time.time()
    try:
        out[name] = {'ok': True, **fn(), 'secs': round(time.time() - t, 1)}
    except Exception as e:
        out[name] = {'ok': False, 'error': repr(e)[:400], 'secs': round(time.time() - t, 1)}
    print(name, out[name], flush=True)

def gamelog(season, kind='Regular Season'):
    def f():
        r = leaguegamelog.LeagueGameLog(season=season, player_or_team_abbreviation='P', season_type_all_star=kind, timeout=60)
        d = r.get_dict()['resultSets'][0]
        return {'rows': len(d['rowSet']), 'headers': d['headers'], 'sample': d['rowSet'][:2]}
    return f

run('gamelog_2025-26', gamelog('2025-26'))
run('gamelog_2025-26_playoffs', gamelog('2025-26', 'Playoffs'))
run('gamelog_2015-16', gamelog('2015-16'))
run('live_scoreboard', lambda: {'games': len(scoreboard.ScoreBoard().get_dict()['scoreboard']['games'])})
json.dump(out, open('probe-out/nba_api.json', 'w'), indent=1)
