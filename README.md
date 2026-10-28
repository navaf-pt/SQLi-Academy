# SQLi Academy

<img width="1908" height="933" alt="Screenshot From 2026-10-28 17-00-17" src="https://github.com/user-attachments/assets/56b4c474-def3-4a44-bb5b-17313787db99" />
An interactive SQL injection training site: **21 hands-on labs**, full written walkthroughs, and faithful reconstructions of real-world injection bugs — every one of them running a genuine SQLite database compiled to WebAssembly inside the browser tab.

There is no backend, no mock data and no simulated output. You type a payload, the application concatenates it into a SQL string, the engine executes it, and you see both the exact statement the app sent and the real rows that came back. `UNION SELECT` really returns other tables, `admin'--` really logs you in, `; UPDATE users SET role='admin'` really escalates privileges.

---

## Features

**Real execution, 100% client-side.** SQLite via [sql.js](https://github.com/sql-js/sql.js) (WebAssembly). Each attempt starts from a freshly seeded database, so labs are reproducible and repeatable, and nothing you do can affect anyone else.

**Six attack families, 21 labs.** In-band/classic, UNION-based, blind and inferential, advanced (second-order, stacked, error-based), filter/WAF bypass, and real-world application scenarios.

**The query is the lesson.** After every request the playground shows:

- the concatenated SQL the application actually sent;
- notes from the deliberately flawed sanitizer (e.g. *"filter stripped `union`"*, *"spaces removed"*);
- driver errors, verbatim;
- one result table per statement, so stacked queries are readable individually;
- the post-query database state where the lab defines a follow-up query;
- a verdict banner telling you whether the objective was met.

**Tiered hints, then a full walkthrough.** Hints escalate from a nudge to near-spoilers. The walkthrough is a step-by-step narrative with copyable payloads and the expected result of each step, so you can follow it when stuck and compare it with what you actually got.

**Automated solvability.** `npm run verify` runs every lab end to end: seed SQL validity, documented solution, oracle probe, and a check that the default input does *not* solve the lab. 162 assertions.

**Progress that persists.** Solved labs are stored in `localStorage` under `sqli-academy.solved.v1` and surfaced in the sidebar, home page and per-family counters.

**A reference, not just labs.** A separate page documents 13 attack classes — including out-of-band exfiltration, write sinks, identifier injection and an impact ladder — with per-DBMS payloads, plus cheat sheets for SQLite, MySQL/MariaDB, PostgreSQL, MSSQL and Oracle.

**Keyboard-friendly, responsive, no tracking.** Hash-based routing (`#/lab/login-bypass`) means the site is a static bundle with no server rewrite rules. The only third-party request is the Google Fonts stylesheet for Inter and JetBrains Mono; the app makes no API calls, sets no cookies and ships no analytics.

---

## Quick start

Requirements: **Node.js 20 or newer** (developed and tested on Node 24) and npm.

```bash
git clone https://github.com/navaf-pt/SQLi-Academy.git
cd SQLi-Academy/
npm ci          # install exactly what package-lock.json pins
npm run dev     # Vite dev server on 0.0.0.0:3000
```

Open <http://localhost:3000>, pick a lab, and start with the first field. If you would rather read before typing, every lab's walkthrough is visible from its sidebar entry.

---

## Run with Docker

`Dockerfile` is a two-stage build: Node compiles the Vite bundle (running `tsc --noEmit` first, so a type error fails the image), then nginx serves it. The runtime stage contains no Node process and no application server — every lab executes SQLite in the browser, so there is no database to run and nothing to scale.

```bash
git clone https://github.com/navaf-pt/SQLi-Academy.git
cd SQLi-Academy/

# build the image
docker build -t sqli-academy .

# serve it on http://localhost:8080
docker run --rm -p 8080:80 sqli-academy
```

A `compose.yaml` file is included in the project. Start the application with Docker Compose and rebuild the image if source files have changed:

```bash
docker compose up --build

# Stop the application with Ctrl+C, then remove the container
docker compose down
```

---

## Lab catalogue

<img width="1904" height="922" alt="Screenshot From 2026-10-28 17-07-49" src="https://github.com/user-attachments/assets/51c3e161-b4b4-4846-b6ab-175c7ebf97de" />

21 labs across 6 families. Difficulty is honest: **Apprentice** labs are approachable with no prior injection experience, **Practitioner** labs assume you have read the basics, and **Expert** labs require reasoning about a specific mechanism (recursive filters, blind oracles, second-order sinks).

### In-band / classic 

| # | id | Lab | Difficulty | Engine |
|---|---|---|---|---|
| 01 | `login-bypass` | Login Bypass at Acme Portal — a form pastes your username straight into the `WHERE` clause. Become the administrator without the password. | Apprentice | SQLite |
| 02 | `numeric-idor` | Numeric Parameter in the Product Catalogue — no quotes, no errors, just an integer ID. Dump the catalogue including the unreleased prototype. | Apprentice | SQLite |
| 03 | `order-by` | Sort Parameter Injection — column names cannot be parameterised, so the sort key is concatenated. Turn `ORDER BY` into a boolean oracle. | Expert | SQLite |

### UNION-based 

| # | id | Lab | Difficulty | Engine |
|---|---|---|---|---|
| 04 | `union-columns` | Counting Columns, Then Stealing Rows — the category filter echoes product rows. Append a second `SELECT` and print the secrets table into the page. | Apprentice | SQLite |
| 05 | `union-multirow` | Dumping Many Rows Through One Column — only one text column is echoed, but the secrets table has six rows. Collapse them with `group_concat`. | Practitioner | SQLite |
| 06 | `union-schema` | Schema Discovery with `sqlite_master` — you are not told which table holds the flag. Enumerate the schema first, then read it. | Practitioner | SQLite |

### Blind & inferential

| # | id | Lab | Difficulty | Engine |
|---|---|---|---|---|
| 07 | `blind-boolean` | Boolean Oracle: One Bit Per Request — no data is echoed, the page only says whether the user exists. Ask yes/no questions until a secret falls out. | Practitioner | SQLite |
| 08 | `blind-time` | Time-Based Blind: When Nothing Changes — identical responses, status codes and lengths. The only signal left is how long the query takes. | Expert | SQLite + `SLEEP()` UDF |

### Advanced techniques 

| # | id | Lab | Difficulty | Engine |
|---|---|---|---|---|
| 09 | `error-disclosure` | Verbose Errors: Mapping the Schema — the app prints raw database errors. Use them as a debugger for someone else's schema, then extract. | Practitioner | SQLite |
| 10 | `second-order` | Second-Order Injection: Stored, Then Fired — the signup form is safely parameterised. It also stores your payload, and another endpoint later pastes it into a query. | Expert | SQLite |
| 11 | `stacked-queries` | Stacked Queries: Escalating Privileges — the driver allows multiple statements per call. Stop reading data and start writing it. | Expert | SQLite, stacked enabled |

### Filter & WAF bypass 

| # | id | Lab | Difficulty | Engine |
|---|---|---|---|---|
| 12 | `waf-case` | Case-Sensitive Blacklist — the filter removes `union` and `select`, but only in lowercase. SQL keywords were never case-sensitive. | Practitioner | SQLite |
| 13 | `waf-spaces` | Space Filtering and Comment Whitespace — all spaces are stripped. SQL has five other ways to separate tokens. | Practitioner | SQLite |
| 14 | `waf-quotes` | Quote Filtering: Injection Without Quotes — both quote characters are stripped. That only matters if you needed a string, and you do not. | Practitioner | SQLite |
| 15 | `waf-recursive` | Recursive Stripping — the filter removes banned words once, in a single pass. Nested keywords reassemble after removal. | Expert | SQLite |

### Real-world scenarios

| # | id | Lab | Difficulty | Engine |
|---|---|---|---|---|
| 16 | `api-json-login` | JSON Auth API — a mobile backend pulls two fields from a JSON body and concatenates both into an auth query. Scanners that only fuzz form fields miss it. | Practitioner | SQLite |
| 17 | `ecommerce-search` | Product Search → Customer Card Data — a public search box, no authentication, and a payments table in the same schema. This is the bug that ends up in breach notifications. | Practitioner | SQLite |
| 18 | `support-tickets` | Support Portal Ticket Lookup — the query filters tickets by your own username. That filter is part of the SQL string, so it is part of the attack surface. | Practitioner | SQLite |
| 19 | `reset-token-blind` | Password Reset Token Enumeration — the reset endpoint validates tokens with a boolean response and no rate limiting. Tokens are the keys to every account. | Expert | SQLite |
| 20 | `session-cookie` | Session Cookie Injection — the session token from your cookie is looked up in SQL. Nothing stops the lookup from returning a forged row. | Practitioner | SQLite |
| 21 | `log-ingest-insert` | Log Ingestion: Injection in an INSERT — everyone tests `SELECT`s. This endpoint only writes, and the write is built by concatenation, which makes it an exfiltration path. | Expert | SQLite |

---

## Attack reference

The `#/reference` page documents 13 classes, each with what it looks like in the wild, the signals that reveal it, its realistic impact, per-DBMS payloads, and links back to the labs that demonstrate it:

`in-band` · `union` · `boolean` · `time` · `oob` (out-of-band) · `second-order` · `stacked` · `identifier` (`ORDER BY`/`LIMIT`/table names) · `write-sink` (`INSERT`/`UPDATE`/`DELETE`) · `headers` (cookies, JSON, `User-Agent`) · `waf` (evasion) · `impact` (escalation ladder) · `prevention`

Plus five cheat sheets — **SQLite, MySQL/MariaDB, PostgreSQL, MSSQL, Oracle** — covering comment syntax, concatenation, version/current user, table and column enumeration, pagination, row aggregation, delay functions, error-based extraction, file read/write, OOB and stacked-query support.

The prevention section is deliberately blunt: parameterisation, allow-listed identifiers, least privilege and schema separation are structural; WAFs and escaping are compensating controls.

---

## Limitations

- **SQLite only.** The engine is sql.js, so payloads targeting `information_schema`, `pg_sleep`, `WAITFOR DELAY` or `xp_cmdshell` are documented in the reference and walkthroughs but cannot execute live here. Dialect differences are called out in the cheat sheets.
- **Simulated application layer.** Inputs stand in for HTTP requests, headers and JSON bodies. The injection mechanics are real; the surrounding web server is a faithful sketch, not a full one.
- **Deliberately small schemas.** Each lab has just enough tables to make the bug legible, and the "production" data is fake by design.
- **No accounts.** Progress lives in `localStorage`, so it is per browser and per device.
- **Verification is headless.** The harness proves every lab is solvable and that the engine behaves correctly, but visual layout and interaction were validated by hand in a browser rather than with screenshot tests.

---

## Ethics and legal use

Everything here is a self-contained simulation. There is no backend to attack, no network traffic, and no third-party data. The lab databases are fabricated and exist only inside your browser tab.

The techniques are the same ones used against real systems, which means the same rules apply:

> Only test systems you own or have explicit written permission to test. Unauthorised access to a computer system is a criminal offence in most jurisdictions, regardless of intent.

If you want to practise against real infrastructure, use a range built for it (DVWA, Juice Shop, PortSwigger Web Security Academy, HackTheBox) or your own local stack.

The most useful thing you can take from this site is not a payload — it is the habit of looking at a query and asking *"where does the data stop and the code begin?"*

---

## Author

SQLi Academy is created by **Navaf PT**.

- GitHub: https://github.com/navaf-pt
- LinkedIn: https://www.linkedin.com/in/navaf-pt/

Copyright © 2026 Navaf PT. All rights reserved.

