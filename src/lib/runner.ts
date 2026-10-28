import type { Lab, Outcome, SqlDb, StatementRun } from '../data/types';

export type { StatementRun };

/**
 * Split a SQL string into individual statements, respecting quoted strings and
 * comments. This is what makes stacked-query labs deterministic: every lab runs
 * through the same splitter the database would effectively apply.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLine = false;
  let inBlock = false;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLine) {
      cur += ch;
      if (ch === '\n') inLine = false;
      i += 1;
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        cur += '*/';
        inBlock = false;
        i += 2;
        continue;
      }
      cur += ch;
      i += 1;
      continue;
    }
    if (inSingle) {
      if (ch === "'" && next === "'") {
        cur += "''";
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      cur += ch;
      i += 1;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      cur += ch;
      i += 1;
      continue;
    }

    if (ch === '-' && next === '-') {
      inLine = true;
      cur += '--';
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      cur += '/*';
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      cur += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      cur += ch;
      i += 1;
      continue;
    }
    if (ch === ';') {
      out.push(cur);
      cur = '';
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }
  out.push(cur);

  return out.map((s) => s.trim()).filter((s) => s.length > 0 && !/^[-/\s]*$/.test(s));
}

function cleanError(e: unknown): string {
  const raw = typeof e === 'string' ? e : e instanceof Error ? e.message : String(e);
  return raw.replace(/^Error:\s*/, '').trim();
}

export function seedDatabase(db: SqlDb, lab: Lab): void {
  for (const stmt of lab.seed) {
    for (const part of splitStatements(stmt)) db.exec(part);
  }
}

/**
 * Runs one attempt against a lab: optional (flawed) filter, optional application
 * step, then the vulnerable string-built query.
 */
export function runLab(db: SqlDb, lab: Lab, rawValues: Record<string, string>): Outcome {
  const notes: string[] = [];
  let values = { ...rawValues };

  if (lab.filter) {
    const filtered = lab.filter(values);
    values = filtered.values;
    notes.push(...filtered.notes);
  }

  const log: string[] = [];
  if (lab.setup) {
    try {
      log.push(...lab.setup(db, values));
    } catch (e) {
      log.push(`Application error: ${cleanError(e)}`);
    }
  }

  const sentSQL = lab.query(values);
  const started = performance.now();
  const statements: StatementRun[] = [];
  let error: string | undefined;

  for (const stmt of splitStatements(sentSQL)) {
    try {
      statements.push({ sql: stmt, results: db.exec(stmt) });
    } catch (e) {
      error = cleanError(e);
      statements.push({ sql: stmt, results: [], error });
      break;
    }
  }

  const elapsedMs = Math.round(performance.now() - started);

  return {
    sentSQL,
    statements,
    results: statements.flatMap((s) => s.results),
    error,
    elapsedMs,
    log,
    notes,
  };
}

export function evaluate(lab: Lab, out: Outcome, db: SqlDb, values: Record<string, string>) {
  try {
    return lab.check(out, db, values);
  } catch (e) {
    return { solved: false, message: `Lab check failed: ${cleanError(e)}` };
  }
}

export function followUp(lab: Lab, db: SqlDb) {
  if (!lab.followUp) return null;
  try {
    return lab.followUp(db);
  } catch {
    return null;
  }
}
