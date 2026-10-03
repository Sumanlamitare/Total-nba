"""Load NBA history into MongoDB with swar/nba_api (https://github.com/swar/nba_api).

Run this on your own computer: stats.nba.com blocks cloud servers (GitHub, Vercel), but answers home
connections. One LeagueGameLog request returns every player's box score line for a whole season, so each
season costs 6 requests (players + teams, for regular season, play-in and playoffs).

    pip install -r scripts/requirements.txt
    MONGODB_URI="mongodb+srv://..." python scripts/history_nba_api.py --from 2015-16 --to 2025-26

Seasons loaded here replace whatever Big Balls stored for them, and the app's scheduled Big Balls job
skips them from then on. Safe to re-run: each season is rewritten as a whole.
"""
import argparse
import os
import sys
import time
from datetime import datetime, timezone

from nba_api.stats.endpoints import leaguegamelog
from pymongo import MongoClient, ReplaceOne, UpdateOne

TYPES = ['Regular Season', 'PlayIn', 'Playoffs']
PAUSE = 1.5  # seconds between requests, to be polite to stats.nba.com


def nick(team_name):
    return 'Trail Blazers' if team_name.endswith('Trail Blazers') else team_name.split(' ')[-1]


def season_label(y):
    return f'{y}-{str(y + 1)[2:]}'


def fetch(season, kind, who):
    for attempt in range(3):
        try:
            r = leaguegamelog.LeagueGameLog(season=season, season_type_all_star=kind,
                                            player_or_team_abbreviation=who, timeout=60)
            d = r.get_dict()['resultSets'][0]
            h = {k: i for i, k in enumerate(d['headers'])}
            return [{k: row[i] for k, i in h.items()} for row in d['rowSet']]
        except Exception as e:  # stats.nba.com times out now and then
            print(f'    retry {attempt + 1} ({type(e).__name__})', flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f'stats.nba.com did not answer for {season} {kind} {who}')


def load_season(db, y):
    season = season_label(y)
    games, lines = {}, []
    for kind in TYPES:
        teams = fetch(season, kind, 'T'); time.sleep(PAUSE)
        players = fetch(season, kind, 'P'); time.sleep(PAUSE)
        nick_of = {t['TEAM_ABBREVIATION']: nick(t['TEAM_NAME']) for t in teams}
        for t in teams:
            g = games.setdefault(t['GAME_ID'], {'_id': t['GAME_ID'], 'date': t['GAME_DATE'][:10], 'season': y,
                                                'type': kind, 'boxed': True, 'source': 'nba_api'})
            side = 'home' if ' vs. ' in t['MATCHUP'] else 'away'
            g[side] = nick(t['TEAM_NAME'])
            g['hs' if side == 'home' else 'as'] = t['PTS'] or 0
        for p in players:
            opp_abbr = p['MATCHUP'].replace(' vs. ', ' @ ').split(' @ ')[-1]
            lines.append({
                'key': str(p['PLAYER_ID']), 'playerId': str(p['PLAYER_ID']), 'nbaId': p['PLAYER_ID'],
                'name': p['PLAYER_NAME'], 'team': nick(p['TEAM_NAME']), 'opp': nick_of.get(opp_abbr, opp_abbr),
                'pts': p['PTS'] or 0, 'reb': p['REB'] or 0, 'ast': p['AST'] or 0, 'stl': p['STL'] or 0,
                'blk': p['BLK'] or 0, 'tpm': p['FG3M'] or 0, 'min': round(float(p['MIN'] or 0)),
                'gameId': p['GAME_ID'], 'date': p['GAME_DATE'][:10], 'season': y, 'type': kind,
            })
        print(f'  {kind}: {len(teams) // 2} games, {len(players)} player lines', flush=True)
    if not games:
        print('  nothing returned, skipped')
        return

    # Replace this season wholesale (drops any Big Balls copies, whose game ids differ)
    db.lines.delete_many({'season': y})
    db.games.delete_many({'season': y})
    for i in range(0, len(lines), 5000):
        db.lines.bulk_write([ReplaceOne({'gameId': l['gameId'], 'key': l['key']}, l, upsert=True)
                             for l in lines[i:i + 5000]], ordered=False)
    db.games.bulk_write([ReplaceOne({'_id': g['_id']}, g, upsert=True) for g in games.values()], ordered=False)
    dates = sorted({g['date'] for g in games.values()})
    now = int(time.time() * 1000)
    db.days.bulk_write([UpdateOne({'_id': d}, {'$set': {'complete': True, 'checkedAt': now, 'source': 'nba_api'}}, upsert=True)
                        for d in dates], ordered=False)
    regular = sum(1 for g in games.values() if g['type'] == 'Regular Season')
    db.schedules.replace_one({'_id': y}, {'_id': y, 'games': len(games), 'regular': regular, 'at': datetime.now(timezone.utc)}, upsert=True)
    # tells the Big Balls job and live pulls that this season is fully stored
    db.seasons.replace_one({'_id': y}, {'_id': y, 'source': 'nba_api', 'complete': y < current_start_year(),
                                        'first': dates[0], 'last': dates[-1], 'at': datetime.now(timezone.utc)}, upsert=True)
    print(f'  saved {len(games)} games, {len(lines)} lines ({dates[0]} to {dates[-1]})', flush=True)


def current_start_year():
    now = datetime.now()
    return now.year if now.month >= 8 else now.year - 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--from', dest='first', default='2015-16', help='first season, e.g. 1996-97')
    ap.add_argument('--to', dest='last', default=season_label(current_start_year() - 1), help='last season, e.g. 2025-26')
    args = ap.parse_args()
    uri = os.environ.get('MONGODB_URI')
    if not uri:
        sys.exit('Set MONGODB_URI first (the same connection string the app uses).')
    db = MongoClient(uri)[os.environ.get('MONGODB_DB', 'totalnba')]
    db.lines.create_index([('gameId', 1), ('key', 1)], unique=True)
    for y in range(int(args.last[:4]), int(args.first[:4]) - 1, -1):  # newest first
        print(f'{season_label(y)}', flush=True)
        load_season(db, y)
    print('done')


if __name__ == '__main__':
    main()
