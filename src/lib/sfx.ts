// Tiny synthesized sound system (WebAudio, no asset files). Safe to call anywhere:
// it no-ops when muted, when AudioContext is unavailable, or before a user gesture.

export type Sfx = 'select' | 'reveal' | 'correct' | 'incorrect' | 'tick' | 'fanfare' | 'whoosh';

const MUTE_KEY = 'jeop3:sfxMuted';

let ctx: AudioContext | null = null;
let muted: boolean | null = null;

export function isSfxMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setSfxMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

function tone(
  c: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = 'sine',
  gain = 0.08,
  slideTo?: number,
) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.05);
}

export function playSfx(name: Sfx): void {
  if (isSfxMuted()) return;
  const c = getCtx();
  if (!c) return;
  switch (name) {
    case 'select':
      tone(c, 520, 0, 0.09, 'triangle', 0.06);
      tone(c, 780, 0.05, 0.12, 'triangle', 0.06);
      break;
    case 'reveal':
      tone(c, 330, 0, 0.18, 'sine', 0.07, 660);
      break;
    case 'whoosh':
      tone(c, 900, 0, 0.22, 'sawtooth', 0.025, 200);
      break;
    case 'tick':
      tone(c, 1200, 0, 0.04, 'square', 0.03);
      break;
    case 'correct':
      tone(c, 523, 0, 0.12, 'triangle', 0.08);
      tone(c, 659, 0.09, 0.12, 'triangle', 0.08);
      tone(c, 784, 0.18, 0.22, 'triangle', 0.08);
      break;
    case 'incorrect':
      tone(c, 220, 0, 0.22, 'sawtooth', 0.06, 110);
      tone(c, 165, 0.16, 0.3, 'sawtooth', 0.06, 80);
      break;
    case 'fanfare':
      [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.13, 0.22, 'triangle', 0.08));
      tone(c, 1047, 0.55, 0.7, 'triangle', 0.09);
      tone(c, 784, 0.55, 0.7, 'sine', 0.05);
      break;
  }
}
