// Taking a book off the shelf, in CSS 3D. The book is built as a box at the size the reader shows its cover,
// then scaled down to sit exactly over its spine on the shelf. It tips out by the top of its spine, comes off the
// shelf, and turns as it moves to the middle so its front cover faces you, landing exactly on the reader's cover.
// Putting it back runs the other way. Built after the reference shelf design; no WebGL.
const EASE = 'cubic-bezier(.45,.05,.25,1)';

function mk(cls, css) { const e = document.createElement('div'); e.className = cls; if (css) e.style.cssText = css; return e; }
function face(cls, w, h, tf, child) {
  const f = mk(`face ${cls}`, `width:${w}px;height:${h}px;left:${-w / 2}px;top:${-h / 2}px;transform:${tf}`);
  if (child) f.append(child);
  return f;
}
const anim = (el, from, to, ms, delay = 0) => el.animate([{ transform: from }, { transform: to }], { duration: ms, delay, easing: EASE, fill: 'both' }).finished.catch(() => {});

// spine: the .spine element on the shelf; cover: the reader's cover element (already laid out, invisible).
export function buildPull(spine, cover, { scale = 1, color = '#333' } = {}) {
  const sr = spine.getBoundingClientRect(), cr = cover.getBoundingClientRect();
  const H = cr.height, D = cr.width, S = H / sr.height, W = Math.max(8, sr.width * S);
  const s0 = 1 / S;

  const spineFace = spine.cloneNode(true);
  spineFace.style.setProperty('--s', String(scale * S));
  spineFace.style.visibility = 'visible';
  const coverFace = cover.cloneNode(true);

  const root = mk('b3');
  root.append(
    face('f-spine', W, H, `translate3d(0,0,${D / 2}px)`, spineFace),
    face('f-cloth', D, H, `translate3d(${-W / 2}px,0,0) rotateY(-90deg)`),
    face('f-fore', W, H, `translate3d(0,0,${-D / 2}px) rotateY(180deg)`),
    face('f-edge', W, D, `translate3d(0,${-H / 2}px,0) rotateX(90deg)`),
    face('f-edge', W, D, `translate3d(0,${H / 2}px,0) rotateX(-90deg)`),
    face('f-cover', D, H, `translate3d(${W / 2}px,0,0) rotateY(90deg)`, coverFace),
  );
  root.querySelectorAll('.f-cloth').forEach(f => { f.style.background = color; });

  const stage = mk('stage'), scrim = mk('scrim'), scene = mk('scene'), fly = mk('fly'), turn = mk('fly');
  stage.setAttribute('aria-hidden', 'true');
  turn.append(root); fly.append(turn); scene.append(fly); stage.append(scrim, scene);

  const at = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const T = r => {
    const c = at(r), z0 = -(D / 2) * s0;
    return {
      start: `translate3d(${c.x}px,${c.y}px,${z0}px) scale(${s0})`,
      pull: `translate3d(${c.x}px,${c.y - 18}px,${z0 + 130}px) scale(${s0})`,
    };
  };
  const c = at(cr);
  const center = `translate3d(${c.x}px,${c.y}px,${-W / 2}px) scale(1)`;
  // Tip: the top of the spine comes towards you first (a finger hooked over the top of the book).
  const R0 = 'rotateX(0deg) rotateY(0deg)', RT = 'rotateX(-9deg) rotateY(0deg)', R1 = 'rotateX(0deg) rotateY(-90deg)';

  return {
    // Off the shelf and round to face you. Resolves when the book sits exactly where the reader's cover is.
    async out({ instant = false } = {}) {
      const t = T(sr);
      fly.style.transform = t.start;
      document.body.append(stage);
      if (instant) { stage.remove(); return; }
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 480, fill: 'both' });
      await Promise.all([anim(fly, t.start, t.pull, 380), anim(turn, R0, RT, 380)]);
      await Promise.all([anim(fly, t.pull, center, 760), anim(turn, RT, R1, 760)]);
    },
    done() { stage.remove(); },
    // Back onto the shelf at the spine's current place (or just fade away if the spine isn't on screen).
    async back(spineNow, { instant = false } = {}) {
      const r = spineNow?.getBoundingClientRect();
      const visible = r && r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
      if (instant || !visible) { stage.remove(); return; }
      document.body.append(stage);
      fly.style.transform = center; turn.style.transform = R1;
      const t = T(r);
      scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 560, delay: 520, fill: 'both' });
      await Promise.all([anim(fly, center, t.pull, 700), anim(turn, R1, RT, 700)]);
      await Promise.all([anim(fly, t.pull, t.start, 340), anim(turn, RT, R0, 340)]);
      stage.remove();
    },
  };
}
