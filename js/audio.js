// Small synthesised sound kit. Nothing plays until the player has tapped once.

let ctx = null;
let master = null;
let enabled = true;

function context() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function setSoundEnabled(on) {
  enabled = on;
  if (!on && ctx) ctx.suspend().catch(() => {});
}

export function unlockAudio() {
  context();
}

function noiseBuffer(ac, seconds) {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function noise(ac, { at = 0, length = 0.05, gain = 0.4, type = 'bandpass', freq = 2000, q = 1, attack = 0.002, sweepTo = null }) {
  const t = ac.currentTime + at;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, length + 0.05);
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + length);
  filter.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + length + 0.05);
}

function tone(ac, { at = 0, freq = 440, to = null, length = 0.2, gain = 0.3, type = 'sine', attack = 0.005 }) {
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + length);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + length + 0.02);
  return osc;
}

const sounds = {
  dice(ac, count = 1) {
    const hits = 4 + count * 2;
    for (let i = 0; i < hits; i++) {
      const at = i * 0.07 + Math.random() * 0.05;
      noise(ac, { at, length: 0.035, gain: 0.35 * (1 - i / (hits + 2)), freq: 2400 + Math.random() * 2400, q: 3 });
    }
  },
  land(ac) {
    noise(ac, { length: 0.06, gain: 0.5, freq: 1800, q: 2 });
    tone(ac, { freq: 180, to: 90, length: 0.08, gain: 0.15 });
  },
  whistle(ac, long = false) {
    const length = long ? 0.9 : 0.35;
    const osc = tone(ac, { freq: 2650, length, gain: 0.12, type: 'sine', attack: 0.02 });
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = 28;
    depth.gain.value = 90;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start();
    lfo.stop(ac.currentTime + length + 0.05);
    if (long) {
      const second = tone(ac, { at: length + 0.12, freq: 2650, length: 0.45, gain: 0.12, attack: 0.02 });
      const lfo2 = ac.createOscillator();
      const depth2 = ac.createGain();
      lfo2.frequency.value = 28;
      depth2.gain.value = 90;
      lfo2.connect(depth2).connect(second.frequency);
      lfo2.start(ac.currentTime + length + 0.12);
      lfo2.stop(ac.currentTime + length + 0.62);
    }
  },
  thud(ac, big = false) {
    tone(ac, { freq: big ? 140 : 110, to: 40, length: big ? 0.35 : 0.2, gain: big ? 0.6 : 0.35 });
    noise(ac, { length: big ? 0.18 : 0.1, gain: big ? 0.5 : 0.25, type: 'lowpass', freq: 600 });
  },
  kick(ac) {
    tone(ac, { freq: 160, to: 60, length: 0.12, gain: 0.45 });
    noise(ac, { at: 0.03, length: 0.5, gain: 0.12, type: 'bandpass', freq: 600, sweepTo: 3000, q: 0.8, attack: 0.05 });
  },
  cheer(ac) {
    noise(ac, { length: 2.2, gain: 0.35, type: 'bandpass', freq: 900, q: 0.6, attack: 0.35 });
    noise(ac, { at: 0.1, length: 1.8, gain: 0.18, type: 'bandpass', freq: 2200, q: 0.9, attack: 0.3 });
  },
  groan(ac) {
    noise(ac, { length: 1.1, gain: 0.25, type: 'lowpass', freq: 700, sweepTo: 250, attack: 0.15 });
  },
  tick(ac) {
    tone(ac, { freq: 900, length: 0.04, gain: 0.08, type: 'triangle' });
  },
  // Two low thumps, for rolls where everything rides on one die.
  heartbeat(ac, beats = 2) {
    for (let i = 0; i < beats; i++) {
      tone(ac, { at: i * 0.75, freq: 70, to: 45, length: 0.14, gain: 0.5 });
      tone(ac, { at: i * 0.75 + 0.2, freq: 60, to: 40, length: 0.16, gain: 0.35 });
    }
  },
  drumroll(ac, seconds = 1) {
    const hits = Math.floor(seconds * 22);
    for (let i = 0; i < hits; i++) noise(ac, { at: i / 22, length: 0.05, gain: 0.08 + (0.22 * i) / hits, type: 'bandpass', freq: 260, q: 1.4 });
  },
  beep(ac) {
    tone(ac, { freq: 1320, length: 0.09, gain: 0.08, type: 'square' });
    tone(ac, { at: 0.14, freq: 1320, length: 0.09, gain: 0.08, type: 'square' });
  },
  post(ac) {
    for (const [f, g] of [[520, 0.25], [1310, 0.12], [2210, 0.06]]) tone(ac, { freq: f, length: 0.9, gain: g, type: 'triangle', attack: 0.002 });
  },
  whoosh(ac) {
    noise(ac, { length: 0.45, gain: 0.25, type: 'bandpass', freq: 400, sweepTo: 2600, q: 0.7, attack: 0.12 });
  },
  roar(ac) {
    noise(ac, { length: 3.2, gain: 0.5, type: 'bandpass', freq: 800, q: 0.5, attack: 0.25 });
    noise(ac, { at: 0.05, length: 2.8, gain: 0.25, type: 'bandpass', freq: 1900, q: 0.8, attack: 0.3 });
    noise(ac, { at: 0.1, length: 2.4, gain: 0.18, type: 'lowpass', freq: 400, attack: 0.3 });
  },
  ooh(ac) {
    noise(ac, { length: 1.2, gain: 0.3, type: 'bandpass', freq: 520, sweepTo: 340, q: 2, attack: 0.25 });
  },
  stamp(ac) {
    tone(ac, { freq: 95, to: 38, length: 0.3, gain: 0.7 });
    noise(ac, { length: 0.12, gain: 0.45, type: 'lowpass', freq: 900 });
  },
  coin(ac) {
    for (let i = 0; i < 6; i++) tone(ac, { at: i * 0.09, freq: 3200 + (i % 2) * 400, length: 0.05, gain: 0.05, type: 'triangle' });
  },
};

export function play(name, arg) {
  const ac = context();
  if (!ac || !sounds[name]) return;
  try {
    sounds[name](ac, arg);
  } catch {
    // Audio is decoration; never let it break play.
  }
}

export function buzz(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported on this device.
  }
}
