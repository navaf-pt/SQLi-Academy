export type CategoryId = 'classic' | 'union' | 'blind' | 'advanced' | 'bypass' | 'realworld';

export type Difficulty = 'Apprentice' | 'Practitioner' | 'Expert';

export type SqlValue = string | number | Uint8Array | null;

/** Minimal surface of sql.js Database that lab definitions are allowed to touch. */
export interface SqlDb {
  run(sql: string, params?: SqlValue[]): unknown;
  exec(sql: string): QueryResult[];
}

export interface QueryResult {
  columns: string[];
  values: SqlValue[][];
}

export interface StatementRun {
  sql: string;
  results: QueryResult[];
  error?: string;
}

export interface Field {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  multiline?: boolean;
  hint?: string;
}

export interface WalkthroughStep {
  title: string;
  text: string[];
  payload?: string;
  result?: string;
}

export interface AnswerSpec {
  label: string;
  placeholder: string;
  expected: string;
  note?: string;
}

/** How the automated verification script probes a lab. */
export interface Probe {
  values: Record<string, string>;
  expect: 'flag' | 'rows' | 'slow' | 'error' | 'empty';
  minElapsedMs?: number;
}

export interface Outcome {
  /** Exactly what was handed to the database engine. */
  sentSQL: string;
  /** Per-statement results, so stacked queries can be shown individually. */
  statements: StatementRun[];
  results: QueryResult[];
  error?: string;
  elapsedMs: number;
  /** Messages produced by the application layer (parameterised writes, redirects, ...). */
  log: string[];
  /** Notes produced by the (deliberately weak) input filter. */
  notes: string[];
}

export interface Verdict {
  solved: boolean;
  message: string;
}

export interface Lab {
  id: string;
  title: string;
  category: CategoryId;
  difficulty: Difficulty;
  dbms: string;
  summary: string;
  brief: string[];
  objective: string;
  fields: Field[];
  seed: string[];
  /** Simulated browser chrome for the fake vulnerable app. */
  appURL: string;
  /** Optional application layer step that runs before the vulnerable query. */
  setup?: (db: SqlDb, values: Record<string, string>) => string[];
  /** Deliberately flawed sanitizer, to demonstrate filter bypass. */
  filter?: (values: Record<string, string>) => { values: Record<string, string>; notes: string[] };
  /** Builds the string-concatenated SQL that the app sends to the database. */
  query: (values: Record<string, string>) => string;
  /** Extra read performed after the injected query, to show database state. */
  followUp?: (db: SqlDb) => { label: string; results: QueryResult[] } | null;
  hints: string[];
  walkthrough: WalkthroughStep[];
  check: (out: Outcome, db: SqlDb, values: Record<string, string>) => Verdict;
  answer?: AnswerSpec;
  solution: Record<string, string>;
  probe?: Probe;
}

export interface Category {
  id: CategoryId;
  name: string;
  tagline: string;
  description: string;
  glyph: string;
}

export const CATEGORIES: Category[] = [
  {
    id: 'classic',
    name: 'In-Band / Classic',
    tagline: 'The fundamentals',
    description:
      'Data leaves through the same channel you attacked. Error messages, login forms and numeric parameters — where every SQL injection journey starts.',
    glyph: "'",
  },
  {
    id: 'union',
    name: 'UNION-Based',
    tagline: 'Turn one query into two',
    description:
      'Append a second SELECT to the original query and print arbitrary tables straight into the page. Column counting, schema discovery and multi-row exfiltration.',
    glyph: '∪',
  },
  {
    id: 'blind',
    name: 'Blind & Inferential',
    tagline: 'No output? No problem',
    description:
      'When the page shows nothing, ask it yes/no questions. Boolean oracles, time delays, and how to automate character-by-character extraction.',
    glyph: '◐',
  },
  {
    id: 'advanced',
    name: 'Advanced Techniques',
    tagline: 'Break the query, not just the value',
    description:
      'Second-order injections stored for later, stacked queries that execute whole new statements, and verbose error disclosure that leaks your schema.',
    glyph: '⌘',
  },
  {
    id: 'bypass',
    name: 'Filter & WAF Bypass',
    tagline: 'Beat the blacklist',
    description:
      'Every filter here is written the way real ones are: naively. Case tricks, comment-based whitespace, recursive stripping and quote-free payloads.',
    glyph: '⊘',
  },
  {
    id: 'realworld',
    name: 'Real-World Scenarios',
    tagline: 'Bugs as they ship',
    description:
      'Faithful reconstructions of vulnerabilities found in production: JSON APIs, e-commerce search, support portals, session cookies, and log ingestion.',
    glyph: '⌗',
  },
];
