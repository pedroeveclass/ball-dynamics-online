#!/usr/bin/env node
// Paginates Supabase Logs Explorer (1000-row cap per call) to dump all
// match-engine-lab TICK-PERF rows in a given UTC window to JSONL.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/dump-tick-perf-logs.mjs \
//     --start=2026-04-29T23:50:00Z \
//     --end=2026-04-30T01:30:00Z \
//     --out=logs/tick-perf-2026-04-29.jsonl

import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN env var');
  process.exit(1);
}

const PROJECT_REF = 'vbpgsdotwsfsiutydpad';
const FUNCTION_ID = 'e2408c1d-9e4b-4dcd-99f3-1eac4fbe7895';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const startIso = args.start || '2026-04-29T23:50:00Z';
const endIso = args.end || '2026-04-30T01:30:00Z';
const outPath = path.resolve(args.out || 'logs/tick-perf-logs.jsonl');

// Logflare/BigQuery: timestamp column on function_logs is microseconds-since-epoch (INT64).
// We pass ISO via TIMESTAMP() casts.
function buildSql(upperIso) {
  const upperClause = upperIso
    ? `and function_logs.timestamp < TIMESTAMP('${upperIso}')`
    : '';
  return `
select id, function_logs.timestamp, event_message,
       metadata.event_type, metadata.function_id,
       metadata.execution_id, metadata.level
from function_logs
cross join unnest(metadata) as metadata
where metadata.function_id = '${FUNCTION_ID}'
  and regexp_contains(event_message, '[TICK-PERF]')
  and function_logs.timestamp >= TIMESTAMP('${startIso}')
  ${upperClause}
order by function_logs.timestamp desc
`.trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let _printedSql = false;
async function fetchPage(upperIso) {
  const sql = buildSql(upperIso);
  if (!_printedSql) {
    console.error('--- SQL ---');
    console.error(sql);
    console.error('--- /SQL ---');
    _printedSql = true;
  }
  const url = new URL(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/logs.all`,
  );
  url.searchParams.set('sql', sql);
  url.searchParams.set('iso_timestamp_start', startIso);
  url.searchParams.set('iso_timestamp_end', upperIso || endIso);

  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (res.ok) {
      const text = await res.text();
      const data = JSON.parse(text);
      const rows = data.result || data.data || [];
      if (rows.length === 0) {
        console.error('Empty response body:', text.slice(0, 500));
      }
      return rows;
    }
    const body = await res.text();
    lastErr = `HTTP ${res.status} :: ${body.slice(0, 300)}`;
    if (res.status === 429 || res.status >= 500) {
      const wait = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s, 32s, 64s
      process.stderr.write(`[${res.status}] retry in ${wait}ms... `);
      await sleep(wait);
      continue;
    }
    throw new Error(lastErr);
  }
  throw new Error(`Exhausted retries: ${lastErr}`);
}

function rowTimestampIso(row) {
  const t = row.timestamp;
  if (typeof t === 'number') {
    // Logflare returns microseconds-since-epoch
    const ms = t > 1e15 ? t / 1000 : t;
    return new Date(ms).toISOString();
  }
  return t;
}

(async () => {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const stream = fs.createWriteStream(outPath);

  let upper = endIso;
  let total = 0;
  let page = 0;
  let lastOldestIso = null;

  while (true) {
    page++;
    process.stderr.write(`page ${page} (upper=${upper})... `);
    const rows = await fetchPage(upper);
    process.stderr.write(`${rows.length} rows\n`);
    if (rows.length === 0) break;

    for (const row of rows) {
      stream.write(JSON.stringify(row) + '\n');
      total++;
    }

    if (rows.length < 1000) break;

    const oldestIso = rowTimestampIso(rows[rows.length - 1]);
    if (!oldestIso || oldestIso === lastOldestIso) {
      console.error(
        'Pagination stuck (same oldest timestamp twice). Stopping to avoid infinite loop.',
      );
      break;
    }
    lastOldestIso = oldestIso;
    upper = oldestIso;
    await sleep(3000); // be nice to the analytics endpoint
  }

  await new Promise((resolve) => stream.end(resolve));
  console.error(`\nDone. ${total} rows -> ${outPath}`);
})().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
