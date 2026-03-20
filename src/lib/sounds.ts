// ─── Procedural sound effects via Web Audio API ───────────────
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', vol = 0.15) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch { /* silent fail */ }
}

function playNoise(duration: number, vol = 0.08) {
  try {
    const ctx = getCtx();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(gain).connect(ctx.destination);
    source.start();
  } catch { /* silent fail */ }
}

export const sounds = {
  kick() {
    playNoise(0.08, 0.12);
    playTone(200, 0.1, 'triangle', 0.1);
  },
  pass() {
    playTone(500, 0.08, 'sine', 0.08);
    playNoise(0.05, 0.06);
  },
  goal() {
    playTone(523, 0.15, 'square', 0.1);
    setTimeout(() => playTone(659, 0.15, 'square', 0.1), 150);
    setTimeout(() => playTone(784, 0.3, 'square', 0.12), 300);
  },
  whistle() {
    playTone(900, 0.4, 'sine', 0.1);
    setTimeout(() => playTone(1100, 0.3, 'sine', 0.08), 200);
  },
  phaseChange() {
    playTone(440, 0.06, 'sine', 0.05);
  },
  error() {
    playTone(200, 0.2, 'sawtooth', 0.06);
  },
  foul() {
    playTone(600, 0.3, 'sine', 0.1);
    setTimeout(() => playTone(600, 0.3, 'sine', 0.1), 400);
  },
};
