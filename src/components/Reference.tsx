import { useState } from 'react';
import { ATTACK_CLASSES, CHEAT_SHEETS } from '../data/reference';
import { CodeBlock } from './CodeBlock';
import { RichText } from './RichText';

interface Props {
  onNavigate: (hash: string) => void;
}

export function Reference({ onNavigate }: Props) {
  const [dbms, setDbms] = useState(CHEAT_SHEETS[0].dbms);
  const sheet = CHEAT_SHEETS.find((s) => s.dbms === dbms) ?? CHEAT_SHEETS[0];

  return (
    <div className="reference">
      <header className="refhead">
        <span className="badge badge--ghost">Reference</span>
        <h1>SQL injection, end to end</h1>
        <p>
          Every family of SQL injection, what it looks like in the wild, and the payloads that matter in each database
          dialect. Labs that cover a technique are linked at the bottom of each card.
        </p>
      </header>

      <section className="section">
        <div className="section__head">
          <h2>Attack classes</h2>
          <p>Ordered roughly by how you will meet them on an engagement.</p>
        </div>
        <div className="ref-grid">
          {ATTACK_CLASSES.map((cls) => (
            <article className="refcard" key={cls.id}>
              <header>
                <span className="refcard__aka">{cls.aka}</span>
                <h3>{cls.name}</h3>
              </header>
              <p className="prose">{cls.summary}</p>

              {cls.signals.length > 0 && (
                <>
                  <h4>How you spot it</h4>
                  <ul className="bullets">
                    {cls.signals.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </>
              )}

              <h4>Impact</h4>
              <p className="prose">{cls.impact}</p>

              <div className="refcard__payloads">
                {cls.payloads.map((p) => (
                  <div key={p.label} className="refpayload">
                    <span className="refpayload__label">{p.label}</span>
                    <code>{p.sql}</code>
                  </div>
                ))}
              </div>

              {cls.labs.length > 0 && (
                <div className="refcard__labs">
                  <span>Practise:</span>
                  {cls.labs.map((id) => (
                    <button type="button" key={id} onClick={() => onNavigate(`#/lab/${id}`)}>
                      {id.replace(/-/g, ' ')}
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Dialect cheat sheet</h2>
          <p>The same five goals, five different syntaxes. Getting this wrong is the usual reason a payload fails.</p>
        </div>
        <div className="cheat">
          <div className="cheat__tabs">
            {CHEAT_SHEETS.map((s) => (
              <button
                type="button"
                key={s.dbms}
                className={`cheat__tab${s.dbms === dbms ? ' cheat__tab--active' : ''}`}
                onClick={() => setDbms(s.dbms)}
              >
                {s.dbms}
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table className="rtable rtable--cheat">
              <thead>
                <tr>
                  <th>Goal</th>
                  <th>Syntax</th>
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row) => (
                  <tr key={row.goal}>
                    <td className="nowrap">{row.goal}</td>
                    <td>
                      <code>{row.payload}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>The one-page defence</h2>
        </div>
        <CodeBlock
          tone="mint"
          label="parameterised queries — the fix"
          code={`// node-postgres
await db.query('SELECT id, name FROM products WHERE id = $1', [req.params.id]);

# Python / sqlite3
cur.execute('SELECT id, name FROM products WHERE id = ?', (product_id,))

// Java / JDBC
PreparedStatement ps = conn.prepareStatement("SELECT * FROM products WHERE id = ?");
ps.setInt(1, productId);

-- Identifiers cannot be bound: use an allow-list, never concatenation
sort = {'price': 'price', 'name': 'name'}.get(param, 'id')`}
        />
        <ul className="bullets bullets--wide">
          <li>Bind every value. Escape nothing by hand.</li>
          <li>Allow-list anything that must be an identifier or a keyword.</li>
          <li>Give the application the least database privilege it can survive on.</li>
          <li>Never display raw driver errors to users.</li>
          <li>Store secrets outside the schema the web user can read.</li>
          <li>Treat a WAF as a speed bump, not a control.</li>
          <li>Assume every stored value is hostile when it reaches a sink — second-order bugs are real.</li>
        </ul>
        <RichText
          className="prose reference__note"
          text="Every payload above is exercised in the labs. If you want to see a class working against a live engine, start at the lab links inside each card."
        />
      </section>
    </div>
  );
}
