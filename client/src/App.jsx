import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadCatalog, loadBook, store } from './api.js';
import { pack } from './shelves.js';
import { slug } from './format.js';
import { webglAvailable } from './gl.js';
import ListView from './ListView.jsx';
import Catalogue from './Catalogue.jsx';
import Reader from './Reader.jsx';
import Legend from './Legend.jsx';

const Library3D = lazy(() => import('./Library3D.jsx'));

const bookFromPath = () => (location.pathname.match(/^\/book\/(\d+)/) || [])[1] || null;
const media = q => (typeof matchMedia === 'function' ? matchMedia(q).matches : false);

export default function App() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(() => (webglAvailable() ? store.get('library.mode') || 'room' : 'list'));
  const [noGL] = useState(() => !webglAvailable());
  const [openId, setOpenId] = useState(bookFromPath);
  const [readerShown, setReaderShown] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [focus, setFocus] = useState(-1);
  const [motion, setMotion] = useState(() => store.get('library.motion') ?? !media('(prefers-reduced-motion: reduce)'));
  const [announce, setAnnounce] = useState('');
  const roomRef = useRef(null);
  const pushed = useRef(false);

  useEffect(() => {
    let live = true;
    loadCatalog(fresh => live && setCatalog(fresh)).then(d => live && setCatalog(d)).catch(e => live && setError(e.message));
    return () => { live = false; };
  }, []);

  const players = catalog?.players || null;
  const layout = useMemo(() => (players ? pack(players) : null), [players]);
  const indexOf = useMemo(() => {
    const m = new Map();
    layout?.books.forEach((b, n) => m.set(players[b.i].i, n));
    return m;
  }, [layout, players]);

  useEffect(() => { store.set('library.mode', mode); }, [mode]);
  useEffect(() => { store.set('library.motion', motion); }, [motion]);

  const playerAt = n => (n >= 0 && layout ? players[layout.books[n].i] : null);

  // Open a book: in the room the book is pulled from its shelf first; the reader appears when it's open.
  const openBook = useCallback((n, { instant = false, push = true } = {}) => {
    const p = playerAt(n); if (!p) return;
    loadBook(p.i).catch(() => {});
    if (push && bookFromPath() !== p.i) { history.pushState({ book: p.i }, '', `/book/${p.i}/${slug(p.n)}`); pushed.current = true; }
    setOpenId(p.i); setFocus(n); setSearchOpen(false); setLegendOpen(false);
    document.title = `${p.n} — The Player Library`;
    const room = roomRef.current;
    if (mode === 'room' && room) {
      if (instant) room.showBook(n, { instant: true });
      room.open(n, { instant }).then(() => setReaderShown(true));
    } else setReaderShown(true);
  }, [layout, players, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishClose = useCallback(() => {
    setReaderShown(false); setOpenId(null);
    document.title = 'The Player Library';
    roomRef.current?.close();
  }, []);

  const closeBook = useCallback(() => {
    if (pushed.current && history.state?.book) history.back();
    else { history.replaceState(null, '', '/'); finishClose(); }
  }, [finishClose]);

  // Back/forward buttons.
  useEffect(() => {
    const onPop = () => {
      const id = bookFromPath();
      if (!id) { pushed.current = false; finishClose(); }
      else if (indexOf.has(id)) openBook(indexOf.get(id), { instant: true, push: false });
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, [indexOf, openBook, finishClose]);

  // A link straight to a book: open it once the shelves exist (instantly — no camera tour on page load).
  const deepLinked = useRef(false);
  const onRoomReady = useCallback(() => {
    if (deepLinked.current || !openId) return;
    deepLinked.current = true;
    if (indexOf.has(openId)) openBook(indexOf.get(openId), { instant: true, push: false });
  }, [openId, indexOf, openBook]);
  useEffect(() => { if (layout && mode === 'list') onRoomReady(); }, [layout, mode, onRoomReady]);
  // A book that isn't shelved (e.g. a link to a player the catalog doesn't hold): open the reader on its own.
  const unshelved = openId && layout && !indexOf.has(openId);
  useEffect(() => { if (unshelved) setReaderShown(true); }, [unshelved]);

  // Players found through ESPN search join the catalog (and the shelves) straight away.
  const addPlayers = useCallback(list => {
    setCatalog(c => {
      const have = new Set(c.players.map(p => p.i));
      const extra = list.filter(p => !have.has(p.i));
      if (!extra.length) return c;
      return { ...c, players: [...c.players, ...extra].sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0)) };
    });
  }, []);

  // Search result chosen: guide the reader to its shelf.
  const goToPlayer = useCallback(id => {
    const n = indexOf.get(id); if (n == null) return false;
    setSearchOpen(false); setFocus(n);
    const p = playerAt(n);
    const cs = layout.cases[layout.books[n].c];
    setAnnounce(`${p.n}: bookcase ${cs.label}, shelf ${layout.books[n].s + 1}. Press Enter to open.`);
    if (mode === 'room') roomRef.current?.showBook(n);
    return true;
  }, [indexOf, layout, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Global shortcuts.
  useEffect(() => {
    const onKey = e => {
      if (e.target.closest?.('input, textarea, select')) return;
      if (e.key === '/' && !openId) { e.preventDefault(); setSearchOpen(true); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [openId]);

  const openPlayer = openId ? (indexOf.has(openId) ? playerAt(indexOf.get(openId)) : { i: openId, n: '', l: '' }) : null;

  if (error && !catalog) {
    return (
      <main className="fault">
        <h1>The library is closed for a moment</h1>
        <p>{error}</p>
        <button className="btn" onClick={() => location.reload()}>Try again</button>
      </main>
    );
  }

  return (
    <div className={`app mode-${mode}${readerShown ? ' reading' : ''}`}>
      <header className="masthead" aria-hidden={readerShown || undefined}>
        <a className="wordmark" href="/" onClick={e => { e.preventDefault(); if (openId) closeBook(); }}>
          <span className="wm-the">The</span> Player Library
        </a>
        <p className="tagline">{players ? `${players.length.toLocaleString('en-US')} NBA players, one book each` : 'Opening the doors…'}</p>
        <nav className="tools" aria-label="Library tools">
          <button className="btn" onClick={() => setSearchOpen(true)} aria-keyshortcuts="/"><span className="ico" aria-hidden>⌕</span> Card catalogue</button>
          {!noGL && (
            <button className="btn ghost" onClick={() => setMode(m => (m === 'room' ? 'list' : 'room'))} aria-pressed={mode === 'list'}>
              {mode === 'room' ? 'Shelf list' : 'Reading room'}
            </button>
          )}
          <button className="btn ghost" onClick={() => setLegendOpen(o => !o)} aria-expanded={legendOpen}>Reading the spines</button>
        </nav>
      </header>

      {!layout && <div className="loading" role="status"><span className="spinner" aria-hidden /> Shelving the books…</div>}

      {layout && mode === 'room' && (
        <Suspense fallback={<div className="loading" role="status"><span className="spinner" aria-hidden /> Lighting the lamps…</div>}>
        <Library3D
          ref={roomRef} players={players} layout={layout} focus={focus} setFocus={setFocus}
          motion={motion} blocked={!!openId || searchOpen} reading={readerShown}
          onOpen={n => openBook(n)} onReady={onRoomReady} onDesk={() => setSearchOpen(true)}
          onFail={() => setMode('list')} announce={setAnnounce}
        />
        </Suspense>
      )}
      {layout && mode === 'list' && (
        <ListView players={players} layout={layout} focus={focus} setFocus={setFocus} onOpen={n => openBook(n)} hidden={readerShown} />
      )}

      {legendOpen && <Legend onClose={() => setLegendOpen(false)} motion={motion} setMotion={setMotion} meta={catalog?.meta} noGL={noGL} />}

      {searchOpen && layout && (
        <Catalogue players={players} layout={layout} indexOf={indexOf} onClose={() => setSearchOpen(false)}
          onGo={goToPlayer} onOpen={id => { if (goToPlayer(id)) openBook(indexOf.get(id)); }} onAdded={addPlayers} />
      )}

      {openId && readerShown && (
        <Reader key={openId} id={openId} player={openPlayer} layout={layout} index={indexOf.get(openId)} motion={motion} onClose={closeBook} />
      )}

      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    </div>
  );
}
