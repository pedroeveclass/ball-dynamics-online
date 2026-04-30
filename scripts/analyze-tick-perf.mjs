#!/usr/bin/env node
// Reads logs/tick-perf-*.jsonl and prints aggregate engine performance stats.
// Usage: node scripts/analyze-tick-perf.mjs logs/tick-perf-2026-04-29.jsonl

import fs from 'node:fs';
import readline from 'node:readline';

const file = process.argv[2] || 'logs/tick-perf-2026-04-29.jsonl';

function quantile(arr, q) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * q);
  return sorted[Math.min(idx, sorted.length - 1)];
}
const avg = (arr) =>
  arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

function parseFields(msg) {
  const out = {};
  const re = /(\w+)=([^\s]+)/g;
  let m;
  while ((m = re.exec(msg)) !== null) out[m[1]] = m[2];
  return out;
}

const phases = {};
const exitCounts = {};
const matchTurns = new Map();
const allTicks = []; // { phase, total, turn, match, exit }
const otherClasses = {};
const errorSamples = [];

const stream = fs.createReadStream(file, 'utf8');
const rl = readline.createInterface({ input: stream });

let totalLines = 0;
let tickPerfLines = 0;
let otherLines = 0;

for await (const line of rl) {
  if (!line) continue;
  totalLines++;
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  const msg = (row.event_message || '').trim();
  if (!msg.startsWith('[TICK-PERF]')) {
    otherLines++;
    // Classify other lines by first 40 chars / common prefixes
    let key = msg.slice(0, 60);
    // collapse uuids/numbers
    key = key
      .replace(/[0-9a-f-]{36}/g, '<uuid>')
      .replace(/match=[^\s]+/g, 'match=<id>')
      .replace(/\d+/g, '<n>');
    otherClasses[key] = (otherClasses[key] || 0) + 1;
    if (
      (row.level === 'error' ||
        msg.toLowerCase().includes('error') ||
        msg.toLowerCase().includes('fail') ||
        msg.toLowerCase().includes('timeout')) &&
      errorSamples.length < 40
    ) {
      errorSamples.push({ level: row.level, msg: msg.slice(0, 250) });
    }
    continue;
  }
  tickPerfLines++;
  const f = parseFields(msg);
  const phase = f.phase || 'unknown';
  const exit = f.exit || 'unknown';
  const total = parseInt(f.total) || 0;
  const players = parseInt(f.players) || 0;
  const memMB = parseInt(f.mem) || 0;

  if (!phases[phase]) {
    phases[phase] = {
      count: 0,
      totals: [],
      subphases: {},
      players: [],
      mem: [],
      exits: {},
    };
  }
  const p = phases[phase];
  p.count++;
  p.totals.push(total);
  p.players.push(players);
  p.mem.push(memMB);
  p.exits[exit] = (p.exits[exit] || 0) + 1;
  exitCounts[exit] = (exitCounts[exit] || 0) + 1;

  for (const [key, val] of Object.entries(f)) {
    if (key === 'total' || key === 'mem' || key === 'phase' ||
        key === 'exit' || key === 'match' || key === 'turn' ||
        key === 'players') continue;
    if (typeof val === 'string' && val.endsWith('ms')) {
      const ms = parseInt(val);
      if (!Number.isFinite(ms)) continue;
      if (!p.subphases[key]) p.subphases[key] = [];
      p.subphases[key].push(ms);
    }
  }

  if (f.match) {
    if (!matchTurns.has(f.match)) matchTurns.set(f.match, new Set());
    matchTurns.get(f.match).add(f.turn);
  }
  allTicks.push({ phase, total, turn: f.turn, match: f.match, exit });
}

console.log('=== INPUT ===');
console.log(`File: ${file}`);
console.log(`Total lines: ${totalLines}`);
console.log(`TICK-PERF lines: ${tickPerfLines}`);
console.log(`Other lines: ${otherLines}`);
console.log(`Distinct matches: ${matchTurns.size}`);
const turnCounts = [...matchTurns.values()].map((s) => s.size);
console.log(
  `Turns/match: avg=${avg(turnCounts).toFixed(1)} p50=${quantile(turnCounts, 0.5)} max=${Math.max(...turnCounts)}`,
);

console.log('\n=== PHASES (sorted by p95) ===');
const phaseRows = Object.entries(phases).sort(
  (a, b) => quantile(b[1].totals, 0.95) - quantile(a[1].totals, 0.95),
);
for (const [phase, p] of phaseRows) {
  const tAvg = avg(p.totals);
  const tP50 = quantile(p.totals, 0.5);
  const tP95 = quantile(p.totals, 0.95);
  const tP99 = quantile(p.totals, 0.99);
  const tMax = Math.max(...p.totals);
  console.log(`\n[${phase}] n=${p.count}`);
  console.log(
    `  total ms  avg=${tAvg.toFixed(0)} p50=${tP50} p95=${tP95} p99=${tP99} max=${tMax}`,
  );
  console.log(
    `  players   avg=${avg(p.players).toFixed(1)} max=${Math.max(...p.players)}`,
  );
  console.log(
    `  mem MB    avg=${avg(p.mem).toFixed(1)} max=${Math.max(...p.mem)}`,
  );

  const subs = Object.entries(p.subphases)
    .map(([k, arr]) => ({
      k,
      n: arr.length,
      avg: avg(arr),
      p95: quantile(arr, 0.95),
      max: Math.max(...arr),
    }))
    .sort((a, b) => b.p95 - a.p95);
  for (const s of subs) {
    console.log(
      `    ${s.k.padEnd(28)} n=${s.n} avg=${s.avg.toFixed(0)} p95=${s.p95} max=${s.max}`,
    );
  }
  // Top exits
  const topExits = Object.entries(p.exits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  console.log(
    `  exits: ${topExits.map(([e, n]) => `${e}=${n}`).join(' | ')}`,
  );
}

console.log('\n=== EXIT TYPES (overall) ===');
const exitRows = Object.entries(exitCounts).sort((a, b) => b[1] - a[1]);
for (const [exit, n] of exitRows.slice(0, 25)) {
  console.log(`  ${n.toString().padStart(6)}  ${exit}`);
}

console.log('\n=== TOP 30 SLOWEST TICKS ===');
allTicks.sort((a, b) => b.total - a.total);
for (const t of allTicks.slice(0, 30)) {
  console.log(
    `  ${t.total.toString().padStart(6)}ms  match=${t.match} turn=${t.turn} phase=${t.phase} exit=${t.exit}`,
  );
}

console.log('\n=== TICKS > 1000ms BY PHASE ===');
const slowByPhase = {};
for (const t of allTicks) {
  if (t.total > 1000) {
    slowByPhase[t.phase] = (slowByPhase[t.phase] || 0) + 1;
  }
}
for (const [p, n] of Object.entries(slowByPhase).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n.toString().padStart(4)}  ${p}`);
}

console.log('\n=== TICKS > 3000ms (severe stalls) ===');
const severe = allTicks.filter((t) => t.total > 3000).slice(0, 50);
for (const t of severe) {
  console.log(
    `  ${t.total.toString().padStart(6)}ms  match=${t.match} turn=${t.turn} phase=${t.phase} exit=${t.exit}`,
  );
}
console.log(`  (total severe: ${allTicks.filter((t) => t.total > 3000).length})`);

console.log('\n=== TOP 25 NON-TICK-PERF LINE CLASSES ===');
const otherSorted = Object.entries(otherClasses).sort((a, b) => b[1] - a[1]);
for (const [pat, n] of otherSorted.slice(0, 25)) {
  console.log(`  ${n.toString().padStart(6)}  ${pat}`);
}

console.log('\n=== ERROR/FAIL/TIMEOUT SAMPLES ===');
for (const e of errorSamples) {
  console.log(`  [${e.level || 'info'}] ${e.msg}`);
}
