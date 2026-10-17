// The sound of a page turning, made in the browser (no audio files): a short burst of filtered noise that sweeps
// down as the paper slides, with a soft low thump when it lands. Off when the visitor turns it off.
import { store } from './api.js';

let ctx = null, noise = null;
let enabled = store.get('library.sound') ?? true;

export const soundOn = () => enabled;
export function setSound(on) { enabled = !!on; store.set('library.sound', enabled); }

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// kind: 'page' (a leaf), 'cover' (a stiff board, deeper), 'tap' (a book touched on the shelf).
export function playTurn(kind = 'page') {
  if (!enabled) return;
  try {
    const a = audio(); if (!a) return;
    const t = a.currentTime + 0.005;
    const dur = kind === 'cover' ? 0.42 : kind === 'tap' ? 0.12 : 0.34;
    const src = a.createBufferSource(); src.buffer = noise;
    const band = a.createBiquadFilter(); band.type = 'bandpass'; band.Q.value = 0.8;
    band.frequency.setValueAtTime(kind === 'cover' ? 1600 : 3200, t);
    band.frequency.exponentialRampToValueAtTime(kind === 'cover' ? 380 : 900, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(kind === 'tap' ? 0.05 : 0.12, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(band).connect(g).connect(a.destination);
    src.start(t, Math.random() * 0.2, dur + 0.05);
    if (kind !== 'tap') {
      // The page settling.
      const o = a.createOscillator(), og = a.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(kind === 'cover' ? 95 : 140, t + dur * 0.8);
      og.gain.setValueAtTime(0.0001, t + dur * 0.8);
      og.gain.exponentialRampToValueAtTime(kind === 'cover' ? 0.09 : 0.03, t + dur * 0.85);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.8 + 0.12);
      o.connect(og).connect(a.destination);
      o.start(t + dur * 0.8); o.stop(t + dur * 0.8 + 0.14);
    }
  } catch { /* no audio: fine */ }
}
