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

// Roar = layered crowd noise that fades in then out, like a stadium reaction.
function playCrowdRoar(duration = 1.2, peakVol = 0.18) {
  try {
    const ctx = getCtx();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Pink-ish noise (smoother than white) — sounds more like a crowd than static.
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const w = Math.random() * 2 - 1;
      last = 0.97 * last + 0.03 * w;
      data[i] = last * 5;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    // Quick attack + slow decay (cheers swell then fade).
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(peakVol, ctx.currentTime + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    // Low-pass to take the harshness off.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1500;
    source.connect(filter).connect(gain).connect(ctx.destination);
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
  // Goal = referee whistle short + crowd roar swell. Simple but reads as celebration.
  goal() {
    // Quick double-blip whistle confirming the goal.
    playTone(1400, 0.12, 'square', 0.09);
    setTimeout(() => playTone(1400, 0.18, 'square', 0.09), 130);
    // Crowd reaction starts right after the whistle.
    setTimeout(() => playCrowdRoar(1.4, 0.2), 300);
  },
  // Single sharp whistle — kickoff, restart of play.
  whistle() {
    playTone(2000, 0.18, 'square', 0.12);
    setTimeout(() => playTone(2200, 0.1, 'square', 0.08), 90);
  },
  // Sustained whistle — half/full time.
  whistleLong() {
    playTone(1900, 0.6, 'square', 0.12);
  },
  phaseChange() {
    playTone(440, 0.06, 'sine', 0.05);
  },
  error() {
    playTone(200, 0.2, 'sawtooth', 0.06);
  },
  // Two short whistle blasts — foul / dead ball.
  foul() {
    playTone(1900, 0.16, 'square', 0.11);
    setTimeout(() => playTone(1900, 0.16, 'square', 0.11), 220);
  },
  // Triple short whistle — corner / set piece signal.
  setPiece() {
    playTone(2000, 0.1, 'square', 0.1);
    setTimeout(() => playTone(2000, 0.1, 'square', 0.1), 140);
    setTimeout(() => playTone(2000, 0.1, 'square', 0.1), 280);
  },
};
