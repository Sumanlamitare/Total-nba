// Arena sounds, made in the browser (no audio files). Off when the player turns them off.
//   tick — a reel clicking past   lock — a reel landing   pick — a player signed   swish — a made basket
//   buzzer — the final horn       cheer — the crowd
import { store } from './api.js';

let ctx = null, noise = null;
let enabled = store.get('btd.sound') ?? true;

export const soundOn = () => enabled;
export function setSound(on) { enabled = !!on; store.set('btd.sound', enabled); }

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(a, t, { type = 'sine', f0, f1 = f0, dur, gain = 0.08 }) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function hiss(a, t, { dur, from, to, q = 0.8, gain = 0.1, attack = 0.02 }) {
  const src = a.createBufferSource(); src.buffer = noise;
  const band = a.createBiquadFilter(); band.type = 'bandpass'; band.Q.value = q;
  band.frequency.setValueAtTime(from, t); band.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(band).connect(g).connect(a.destination); src.start(t, Math.random() * 0.5, dur + 0.05);
}

export function sfx(kind) {
  if (!enabled) return;
  try {
    const a = audio(); if (!a) return;
    const t = a.currentTime + 0.005;
    if (kind === 'tick') tone(a, t, { type: 'square', f0: 1800, f1: 1200, dur: 0.025, gain: 0.025 });
    else if (kind === 'lock') { tone(a, t, { type: 'triangle', f0: 520, f1: 260, dur: 0.12, gain: 0.09 }); hiss(a, t, { dur: 0.08, from: 4000, to: 2000, gain: 0.04 }); }
    else if (kind === 'pick') { tone(a, t, { type: 'triangle', f0: 660, dur: 0.12, gain: 0.07 }); tone(a, t + 0.08, { type: 'triangle', f0: 990, dur: 0.18, gain: 0.07 }); }
    else if (kind === 'swish') hiss(a, t, { dur: 0.32, from: 6000, to: 1500, q: 1.4, gain: 0.08, attack: 0.05 });
    else if (kind === 'buzzer') { tone(a, t, { type: 'sawtooth', f0: 220, dur: 0.9, gain: 0.06 }); tone(a, t, { type: 'square', f0: 223, dur: 0.9, gain: 0.03 }); }
    else if (kind === 'cheer') { hiss(a, t, { dur: 2.2, from: 1400, to: 900, q: 0.5, gain: 0.09, attack: 0.4 }); hiss(a, t + 0.1, { dur: 1.8, from: 2600, to: 1800, q: 0.7, gain: 0.05, attack: 0.3 }); }
    else if (kind === 'groan') hiss(a, t, { dur: 1.2, from: 700, to: 300, q: 0.6, gain: 0.07, attack: 0.2 });
  } catch { /* no audio: fine */ }
}
