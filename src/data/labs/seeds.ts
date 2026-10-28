/** Reusable seed fragments. Every lab gets its own database instance. */

export function usersSeed(adminPassword = 'S3cr3t_Adm1n!', extraRows = ''): string[] {
  return [
    `CREATE TABLE users (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       username TEXT NOT NULL UNIQUE,
       password TEXT NOT NULL,
       role TEXT NOT NULL DEFAULT 'user',
       email TEXT
     );`,
    `INSERT INTO users (username, password, role, email) VALUES
       ('admin', '${adminPassword}', 'admin', 'admin@acme.io'),
       ('jdoe', 'hunter2', 'user', 'jdoe@acme.io'),
       ('mjones', 'p@ssw0rd!', 'user', 'mjones@acme.io'),
       ('svc_backup', 'b4ckup_svc', 'service', 'ops@acme.io')${extraRows};`,
  ];
}

export function productsSeed(extraRows = ''): string[] {
  return [
    `CREATE TABLE products (
       id INTEGER PRIMARY KEY,
       name TEXT,
       price REAL,
       category TEXT,
       status TEXT,
       notes TEXT
     );`,
    `INSERT INTO products (id, name, price, category, status, notes) VALUES
       (1, 'Trail Runner 2', 89.00, 'shoes',   'released', 'Lightweight trail shoe.'),
       (2, 'Alpine Shell', 149.50, 'jackets',  'released', 'Waterproof 3-layer shell.'),
       (3, 'Base Layer Merino', 54.00, 'baselayers', 'released', 'Odour resistant.'),
       (4, 'Summit Pack 30L', 129.00, 'packs',  'released', 'Hydration compatible.'),
       (5, 'Grip Stick Poles', 74.95, 'packs',  'released', 'Carbon, pair.'),
       (6, 'Down Vest', 119.00, 'jackets', 'released', '800 fill power.'),
       (9, 'Project Nightfall', 0.00, 'packs', 'unreleased', 'Prototype unit. Internal note: FLAG{numeric_injection_101}')${extraRows};`,
  ];
}

export function secretsSeed(flag: string, name = 'stripe_live_key', extra: Array<[string, string]> = []): string[] {
  const rows = [[name, flag], ...extra]
    .map(([n, v]) => `('${n}', '${v}')`)
    .join(',\n         ');
  return [
    `CREATE TABLE secrets (id INTEGER PRIMARY KEY, name TEXT, value TEXT);`,
    `INSERT INTO secrets (name, value) VALUES
         ${rows};`,
  ];
}
