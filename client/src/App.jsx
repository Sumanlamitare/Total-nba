import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadCatalog, loadBook, store } from './api.js';
import { shelve, teamCloth, spineOf, letterOf, luminance, contrast, mix, RETIRED } from './shelves.js';
import { slug } from './format.js';
import Shelf from './Shelf.jsx';
import SearchBox from './SearchBox.jsx';
import Reader from './Reader.jsx';
import { buildPull } from './pull.js';

const bookFromPath = () => (location.pathname.match(/^\/book\/(\d+)/) || [])[1] || null;
const media = q => (typeof matchMedia === 'function' ? matchMedia(q).matches : false);
const frame = () => new Promise(r => requestAnimationFrame(() => r()));

// The back of the shelf: a colour the visitor can change. The giant letter re-tones itself to stay visible.
const WALLS = [['#ffffff', 'White'], ['#f3ead8', 'Cream'], ['#dbe5d8', 'Sage'], ['#d9e6f0', 'Mist'], ['#f1dcd6', 'Blush'], ['#3a3d45', 'Slate'], ['#16202e', 'Midnight']];
function ghostFor(wall) {
  const dark = luminance(wall) < 0.179;
  let t = 0.05, g = mix(wall, dark ? '#ffffff' : '#000000', t);
  while (contrast(g, wall) < 1.3 && t < 0.9) { t += 0.02; g = mix(wall, dark ? '#ffffff' : '#000000', t); }
  return { ghost: g, dark };
}

export default function App() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(() => (store.get('library.tab') === RETIRED ? RETIRED : 'active'));
  const [teamId, setTeamId] = useState(() => store.get('library.team'));
  const [open, setOpen] = useState(() => (bookFromPath() ? { id: bookFromPath(), phase: 'open', deep: true } : null));
  const [returning, setReturning] = useState(null);
  const [target, setTarget] = useState(null);
  const [letter, setLetter] = useState('');
  const [wall, setWall] = useState(() => (/^#[0-9a-f]{6}$/i.test(store.get('library.wall') || '') ? store.get('library.wall') : '#ffffff'));
  const [motion] = useState(() => !media('(prefers-reduced-motion: reduce)'));
  const [announce, setAnnounce] = useState('');
  const pushed = useRef(false), pull = useRef(null), search = useRef(null), wantOpen = useRef(null);

  useEffect(() => {
    let live = true;
    loadCatalog(fresh => live && setCatalog(fresh)).then(d => live && setCatalog(d)).catch(e => live && setError(e.message));
    return () => { live = false; };
  }, []);

  const players = catalog?.players || null;
  const lib = useMemo(() => (players ? shelve(players, catalog?.meta?.teams || []) : null), [players, catalog?.meta?.teams]);
  const byId = useMemo(() => new Map((players || []).map(p => [p.i, p])), [players]);
  const team = lib && tab !== RETIRED ? lib.teams.find(t => t.id === teamId) || lib.teams[0] : null;
  const books = !lib ? [] : tab === RETIRED ? lib.retired : team?.books || [];
  const shelfKey = tab === RETIRED ? RETIRED : team?.id || '';
  const teamOf = useCallback(p => lib?.teamById.get(p.tm), [lib]);

  useEffect(() => { store.set('library.tab', tab); }, [tab]);
  useEffect(() => { if (team) store.set('library.team', team.id); }, [team]);
  useEffect(() => { store.set('library.wall', wall); document.documentElement.style.setProperty('--wall', wall); }, [wall]);

  // Which shelf a book is on, for the reader's title page and endpapers.
  const shelfOf = p => {
    if (!p || !lib) return null;
    const t = lib.teamById.get(p.tm) || null;
    return { team: t, retired: !p.a, label: !p.a ? 'Retired players' : t ? t.name : 'No current team' };
  };

  // Bring a player's book to the pointer on its shelf.
  const goToPlayer = useCallback((id, { openIt = false } = {}) => {
    const pl = lib?.placeOf.get(id); if (!pl) return false;
    if (pl.shelf === RETIRED) setTab(RETIRED); else { setTab('active'); setTeamId(pl.shelf); }
    setTarget({ at: pl.at, flash: true, focus: !openIt, smooth: false, n: Date.now() });
    if (openIt) wantOpen.current = id;
    const p = byId.get(id);
    setAnnounce(`${p.n}: on the ${pl.shelf === RETIRED ? 'retired players' : lib.teamById.get(pl.shelf)?.name || 'no current team'} shelf. Press Enter to open.`);
    return true;
  }, [lib, byId]);

  // Take a book down: the reader mounts unseen (so its cover's place is known), the book flies there, the reader shows.
  const openFromShelf = useCallback((p, spineEl) => {
    if (open || returning) return;
    loadBook(p.i).catch(() => {});
    if (bookFromPath() !== p.i) { history.pushState({ book: p.i }, '', `/book/${p.i}/${slug(p.n)}`); pushed.current = true; }
    document.title = `${p.n} · Player Library`;
    setOpen({ id: p.i, phase: motion ? 'pulling' : 'open', spine: spineEl, color: spineOf(p, teamOf(p)).bg });
  }, [open, returning, motion, teamOf]);

  useEffect(() => {
    if (open?.phase !== 'pulling') return;
    let live = true;
    (async () => {
      let cover = null;
      for (let k = 0; k < 90 && live && !cover; k++) { await frame(); cover = document.querySelector('.reader .book .cover'); }
      if (!live) return;
      if (!cover || !open.spine?.isConnected) { setOpen(o => o && { ...o, phase: 'open' }); return; }
      const scale = parseFloat(getComputedStyle(open.spine.closest('.shelf')).getPropertyValue('--s')) || 1;
      const pr = buildPull(open.spine, cover, { scale, color: open.color });
      pull.current = { id: open.id, pr };
      await pr.out();
      if (!live) { pr.done(); return; }
      setOpen(o => o && { ...o, phase: 'open' });
      await frame(); await frame();
      pr.done();
    })();
    return () => { live = false; };
  }, [open?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // A player chosen with "Open": once the shelf shows the book, take it down.
  useEffect(() => {
    const id = wantOpen.current; if (!id) return;
    wantOpen.current = null;
    frame().then(() => {
      const el = document.querySelector(`.shelf .vol[data-id="${id}"] .spine`);
      const p = byId.get(id);
      if (el && p) openFromShelf(p, el);
    });
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishClose = useCallback(() => {
    const was = open; if (!was) return;
    setOpen(null); document.title = 'Player Library';
    const pr = pull.current?.id === was.id ? pull.current.pr : null;
    pull.current = null;
    const pl = lib?.placeOf.get(was.id);
    if (pr) {
      setReturning(was.id);
      frame().then(() => {
        const el = document.querySelector(`.shelf .vol[data-id="${was.id}"] .spine`);
        return pr.back(el, { instant: !motion });
      }).then(() => { setReturning(null); document.querySelector(`.shelf .vol[data-id="${was.id}"]`)?.focus({ preventScroll: true }); });
    } else if (pl) {
      // Opened from a link: show where the book lives.
      if (pl.shelf === RETIRED) setTab(RETIRED); else { setTab('active'); setTeamId(pl.shelf); }
      setTarget({ at: pl.at, flash: true, focus: true, n: Date.now() });
    }
  }, [open, lib, motion]);

  const closeBook = useCallback(() => {
    if (pushed.current && history.state?.book) history.back();
    else { history.replaceState(null, '', '/'); finishClose(); }
  }, [finishClose]);

  // Back/forward buttons.
  useEffect(() => {
    const onPop = () => {
      const id = bookFromPath();
      if (!id) { pushed.current = false; finishClose(); }
      else if (!open) setOpen({ id, phase: 'open', deep: true });
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, [open, finishClose]);

  // A deep link: once the shelves exist, stand at the book's shelf so closing the book shows where it lives.
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || !lib || !open?.deep) return;
    placed.current = true;
    const pl = lib.placeOf.get(open.id); if (!pl) return;
    if (pl.shelf === RETIRED) setTab(RETIRED); else { setTab('active'); setTeamId(pl.shelf); }
  }, [lib, open]);

  // Players found through ESPN search join the catalogue (and the shelves) straight away.
  const addPlayers = useCallback(list => {
    setCatalog(c => {
      const have = new Set(c.players.map(p => p.i));
      const extra = list.filter(p => !have.has(p.i));
      if (!extra.length) return c;
      return { ...c, players: [...c.players, ...extra].sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0)) };
    });
  }, []);

  useEffect(() => {
    const onKey = e => {
      if (e.target.closest?.('input, textarea, select')) return;
      if (e.key === '/' && !open) { e.preventDefault(); search.current?.focus(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  // Letters on the retired shelf, for jumping.
  const letters = useMemo(() => {
    if (!lib) return [];
    const out = [];
    lib.retired.forEach((i, at) => { const L = letterOf(players[i]); if (!out.length || out[out.length - 1].L !== L) out.push({ L, at }); });
    return out;
  }, [lib, players]);

  const { ghost, dark } = ghostFor(wall);
  const openPlayer = open ? byId.get(open.id) || { i: open.id, n: '', l: '' } : null;
  const total = players?.length || 0;

  if (error && !catalog) {
    return (
      <main className="fault">
        <h1>The library can't open right now</h1>
        <p>{error}</p>
        <button className="btn" onClick={() => location.reload()}>Try again</button>
      </main>
    );
  }
  const away = open ? { inert: '', 'aria-hidden': true } : {};

  return (
    <div className="app">
      <header className="nav" {...away}>
        <a className="brand" href="/" onClick={e => e.preventDefault()}>
          <svg width="26" height="22" viewBox="0 0 26 22" aria-hidden><rect x="1" y="3" width="6" height="18" rx="1" fill="currentColor" /><rect x="9" y="1" width="6" height="20" rx="1" fill="currentColor" opacity=".7" /><rect x="17" y="5" width="6" height="16" rx="1" fill="currentColor" opacity=".45" /></svg>
          Player Library
        </a>
        <span className="nav-note">{total ? `${total.toLocaleString('en-US')} NBA players on ESPN's record` : 'Opening…'}</span>
      </header>

      <main {...away}>
        <section className="tools" aria-label="Find a shelf">
          <div className="top-row">
            <div className="lib-head">
              <h1>{tab === RETIRED ? 'Retired players' : team ? team.name : 'Active players'}</h1>
              <p className="count" aria-live="polite">{lib ? `${books.length.toLocaleString('en-US')} ${books.length === 1 ? 'player' : 'players'}` : ''}</p>
            </div>
            <div className="top-controls">
              {lib && <SearchBox ref={search} players={players} placeOf={lib.placeOf} teamById={lib.teamById} onGo={id => goToPlayer(id)} onOpen={id => goToPlayer(id, { openIt: true })} onAdded={addPlayers} />}
            </div>
          </div>
          <div className="filters">
            {lib && tab !== RETIRED && (
              <div className="fgroup">
                <label className="flabel" htmlFor="team-pick">Team</label>
                <div className="team-select" style={{ '--dot': teamCloth(team) }}>
                  <select id="team-pick" value={team?.id || ''} onChange={e => setTeamId(e.target.value)}>
                    {lib.teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.books.length})</option>)}
                  </select>
                </div>
              </div>
            )}
            {lib && tab === RETIRED && (
              <div className="fgroup wide">
                <span className="flabel" id="jump-label">Jump to</span>
                <div className="chips" role="group" aria-labelledby="jump-label">
                  {letters.map(({ L, at }) => <button key={L} type="button" className="chip" aria-pressed={letter === L} onClick={() => setTarget({ at, smooth: true, n: Date.now() })}>{L}</button>)}
                </div>
              </div>
            )}
          </div>
          <nav className="tabs" aria-label="Library sections">
            <button className="tab" type="button" aria-current={tab !== RETIRED ? 'page' : undefined} onClick={() => setTab('active')}>Active players{lib && <span className="tab-n">{(total - lib.retired.length).toLocaleString('en-US')}</span>}</button>
            <button className="tab" type="button" aria-current={tab === RETIRED ? 'page' : undefined} onClick={() => setTab(RETIRED)}>Retired players{lib && <span className="tab-n">{lib.retired.length.toLocaleString('en-US')}</span>}</button>
          </nav>
        </section>

        <section className={`floor${dark ? ' on-dark' : ''}`} style={{ '--wall': wall, '--ghost': ghost }} aria-label="Shelf">
          {letter && <div className="ghost" aria-hidden><span>{letter}</span></div>}
          <div className="library">
            {!lib ? <p className="loading" role="status"><span className="spinner" aria-hidden /> Shelving the books…</p>
              : <Shelf players={players} books={books} teamOf={teamOf} shelfKey={shelfKey} hiddenId={open && !open.deep ? open.id : returning}
                  target={target} onOpen={openFromShelf} onLetter={setLetter} motion={motion} />}
          </div>
          <div className="wallpick" role="group" aria-label="Shelf back colour">
            <span className="wp-label">Shelf back</span>
            <div className="swatches">
              {WALLS.map(([c, name]) => <button key={c} type="button" className="sw" style={{ '--c': c }} aria-pressed={wall === c} aria-label={`Shelf back: ${name}`} title={name} onClick={() => setWall(c)} />)}
              <label className="sw custom" title="Pick any colour" data-on={!WALLS.some(w => w[0] === wall)}>
                <input type="color" value={wall} aria-label="Shelf back: any colour" onChange={e => setWall(e.target.value)} />
              </label>
            </div>
          </div>
        </section>
      </main>

      {open && (
        <Reader key={open.id} id={open.id} player={openPlayer} shelf={shelfOf(openPlayer)} hidden={open.phase === 'pulling'} arrived={!open.deep}
          motion={motion} onClose={closeBook} />
      )}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    </div>
  );
}
