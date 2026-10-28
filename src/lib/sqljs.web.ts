import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
// Vite serves the wasm binary as a static asset and hands us its URL.
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let sqlPromise: Promise<SqlJsStatic> | null = null;

export function getSQL(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ locateFile: () => wasmUrl });
  }
  return sqlPromise;
}

/**
 * SLEEP() is not part of SQLite. We register it so the time-based labs behave
 * like MySQL: the call blocks the query engine for the requested duration.
 */
export function registerUdfs(db: Database): void {
  db.create_function('sleep', (seconds: unknown) => {
    const secs = Math.max(0, Math.min(Number(seconds) || 0, 5));
    const end = Date.now() + secs * 1000;
    // Deliberately synchronous: a busy loop is exactly what SLEEP does to a real server.
    while (Date.now() < end) {
      /* block */
    }
    return 1;
  });
}

export type { Database };
