import type { Outcome, QueryResult } from '../types';

const FLAG_RE = /FLAG\{[A-Za-z0-9_!-]+\}/;

export function flatten(results: QueryResult[]): string[] {
  const out: string[] = [];
  for (const rs of results) {
    for (const row of rs.values) {
      for (const cell of row) {
        if (cell === null || cell === undefined) continue;
        if (typeof cell === 'string') out.push(cell);
        else if (typeof cell === 'number') out.push(String(cell));
      }
    }
  }
  return out;
}

export function findFlag(outcome: Outcome): string | null {
  for (const cell of flatten(outcome.results)) {
    const m = cell.match(FLAG_RE);
    if (m) return m[0];
  }
  return null;
}

export function rowCount(outcome: Outcome): number {
  return outcome.results.reduce((n, rs) => n + rs.values.length, 0);
}

export function firstRow(outcome: Outcome): string[] {
  const rs = outcome.results[0];
  if (!rs || rs.values.length === 0) return [];
  return rs.values[0].map((c) => (c === null ? '' : String(c)));
}

/** Check that the DB now holds `expected` in a single-cell query. */
export function scalar(db: { exec(sql: string): QueryResult[] }, sql: string): string | null {
  try {
    const res = db.exec(sql);
    const v = res[0]?.values[0]?.[0];
    return v === null || v === undefined ? null : String(v);
  } catch {
    return null;
  }
}

export const fail = (message: string) => ({ solved: false, message });
export const pass = (message: string) => ({ solved: true, message });
