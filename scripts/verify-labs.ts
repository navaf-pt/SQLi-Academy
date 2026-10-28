import initSqlJs from 'sql.js';
import { LABS } from '../src/data/labs';
import { runLab, seedDatabase, evaluate, splitStatements } from '../src/lib/runner';
import type { Lab, Outcome, SqlDb } from '../src/data/types';

/**
 * Verifies every lab end to end against a real SQLite engine:
 *  - the seed SQL is valid
 *  - the documented solution payload actually satisfies the lab check
 *  - answer-based labs expose a working oracle (probe)
 *  - the "no-op" baseline does NOT solve the lab
 */

const sleepUdf = (db: SqlDb): void => {
  (db as unknown as { create_function: (n: string, f: (...a: unknown[]) => unknown) => void }).create_function(
    'sleep',
    (seconds: unknown) => {
      const secs = Math.max(0, Math.min(Number(seconds) || 0, 5));
      const end = Date.now() + secs * 1000;
      while (Date.now() < end) {
        /* block */
      }
      return 1;
    },
  );
};

let failures = 0;
let checks = 0;

function assert(condition: boolean, message: string): void {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`   ✗ ${message}`);
  }
}

function freshDb(SQL: Awaited<ReturnType<typeof initSqlJs>>, lab: Lab): SqlDb {
  const db = new SQL.Database() as unknown as SqlDb;
  sleepUdf(db);
  seedDatabase(db, lab);
  return db;
}

function summarize(out: Outcome): string {
  if (out.error) return `error: ${out.error}`;
  const rows = out.results.reduce((n, r) => n + r.values.length, 0);
  return `${rows} row(s), ${out.elapsedMs}ms`;
}

function firstCell(out: Outcome): string {
  const rs = out.results[0];
  const v = rs?.values[0]?.[0];
  return v === null || v === undefined ? '(none)' : String(v);
}

const SQL = await initSqlJs();

console.log(`\nVerifying ${LABS.length} labs against SQLite\n`);

const ids = new Set<string>();
for (const lab of LABS) {
  console.log(`▸ ${lab.id} — ${lab.title}`);
  assert(!ids.has(lab.id), `duplicate lab id: ${lab.id}`);
  ids.add(lab.id);

  assert(lab.fields.length > 0, 'lab has no input fields');
  assert(lab.walkthrough.length >= 3, 'walkthrough needs at least 3 steps');
  assert(lab.hints.length >= 2, 'lab needs at least 2 hints');
  assert(lab.seed.length > 0, 'lab has no seed SQL');

  // 1. baseline: the default values must not solve the lab
  const baseline = freshDb(SQL, lab);
  const baseOut = runLab(baseline, lab, Object.fromEntries(lab.fields.map((f) => [f.id, f.value])));
  const baseVerdict = evaluate(lab, baseOut, baseline, {});
  assert(!baseVerdict.solved, 'default input already solves the lab');

  // 2. solution (or probe for answer-based labs)
  if (lab.answer) {
    const probe = lab.probe;
    assert(Boolean(probe), 'answer-based lab has no probe');
    if (probe) {
      const db = freshDb(SQL, lab);
      const out = runLab(db, lab, probe.values);
      const rows = out.results.reduce((n, r) => n + r.values.length, 0);
      if (probe.expect === 'rows') {
        assert(rows > 0, `probe returned no rows (${summarize(out)})`);
      } else if (probe.expect === 'slow') {
        assert(out.elapsedMs >= (probe.minElapsedMs ?? 500), `probe was not slow (${out.elapsedMs}ms)`);
      } else if (probe.expect === 'error') {
        assert(Boolean(out.error), 'probe did not error');
      } else if (probe.expect === 'flag') {
        assert(/FLAG\{/.test(firstCell(out)), `probe did not return a flag (${firstCell(out)})`);
      }
      console.log(`   oracle probe: ${summarize(out)}`);
    }
    assert(lab.answer.expected.startsWith('FLAG{'), 'answer is not a flag');
  } else {
    const db = freshDb(SQL, lab);
    const out = runLab(db, lab, lab.solution);
    const verdict = evaluate(lab, out, db, lab.solution);
    assert(verdict.solved, `solution failed: ${verdict.message} [${summarize(out)}]`);
    console.log(`   solution: ${summarize(out)}`);
    if (out.error) console.error(`   ! solution produced an error: ${out.error}`);
  }

  // 3. every filter-bypass lab should actually mangle the naive payload
  if (lab.filter) {
    const naive = lab.fields.reduce<Record<string, string>>((acc, f) => ({ ...acc, [f.id]: "' union select 1,2,3--" }), {});
    const res = lab.filter(naive);
    assert(res.notes.length > 0, 'filter did not react to a naive payload');
  }
}

// 4. statement splitter sanity
const split = splitStatements(`SELECT ';' AS a; UPDATE t SET x=1; SELECT 2 -- ; not a separator`);
assert(split.length === 3, `splitter returned ${split.length} statements (expected 3)`);
const argued = splitStatements(`SELECT * FROM t WHERE c='x' UNION SELECT 1,2,3--`);
assert(argued.length === 1, 'splitter broke a UNION comment payload');
const stacked = splitStatements(`1; UPDATE users SET role='admin' WHERE username='jdoe'`);
assert(stacked.length === 2, 'splitter failed on stacked query');

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`\n${failures} check(s) failed\n`);
  process.exit(1);
}
console.log('All labs verified.\n');
