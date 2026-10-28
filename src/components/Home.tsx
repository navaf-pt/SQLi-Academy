import { CATEGORIES } from '../data/types';
import { LABS, labsInCategory, labNumber } from '../data/labs';
import { Footer } from './Footer';

interface Props {
  solved: Set<string>;
  onNavigate: (hash: string) => void;
}

export function Home({ solved, onNavigate }: Props) {
  const first = LABS[0];

  return (
    <div className="home">
      <section className="hero">
        <div className="hero__glow" aria-hidden />
        <p className="hero__eyebrow">
          <span className="dot" /> {LABS.length} labs · real database · zero setup
        </p>
        <h1>
          Break the query.
          <br />
          <em>Then learn why it broke.</em>
        </h1>
        <p className="hero__lede">
          Every lab on this site runs a genuine SQLite database inside your browser tab. You type a payload, the application
          concatenates it into SQL, the engine executes it, and you see the exact statement and the real rows that came back.
          No mock data, no pretend errors.
        </p>
        <div className="hero__actions">
          <button type="button" className="btn btn--primary btn--lg" onClick={() => onNavigate(`#/lab/${first.id}`)}>
            Start with lab 01 →
          </button>
          <button type="button" className="btn btn--ghost btn--lg" onClick={() => onNavigate('#/reference')}>
            Attack reference
          </button>
        </div>
        <dl className="stats">
          <div>
            <dt>{LABS.length}</dt>
            <dd>interactive labs</dd>
          </div>
          <div>
            <dt>{CATEGORIES.length}</dt>
            <dd>attack families</dd>
          </div>
          <div>
            <dt>5</dt>
            <dd>DBMS cheat sheets</dd>
          </div>
          <div>
            <dt>{solved.size}</dt>
            <dd>solved by you</dd>
          </div>
        </dl>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Attack families</h2>
          <p>Six progression paths, from your first stray quote to second-order bugs that scanners never see.</p>
        </div>
        <div className="cat-grid">
          {CATEGORIES.map((cat) => {
            const labs = labsInCategory(cat.id);
            const done = labs.filter((l) => solved.has(l.id)).length;
            return (
              <button
                type="button"
                className="cat-card"
                key={cat.id}
                onClick={() => onNavigate(`#/lab/${labs[0].id}`)}
              >
                <span className="cat-card__glyph">{cat.glyph}</span>
                <span className="cat-card__tag">{cat.tagline}</span>
                <h3>{cat.name}</h3>
                <p>{cat.description}</p>
                <span className="cat-card__meta">
                  {labs.length} labs · {done}/{labs.length} solved
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="section" id="labs">
        <div className="section__head">
          <h2>All labs</h2>
          <p>Pick anything. Difficulty is honest, not decorative.</p>
        </div>
        <ul className="labrows">
          {LABS.map((lab) => (
            <li key={lab.id}>
              <button type="button" className="labrow" onClick={() => onNavigate(`#/lab/${lab.id}`)}>
                <span className="labrow__num">{labNumber(lab.id)}</span>
                <span className="labrow__main">
                  <strong>{lab.title}</strong>
                  <em>{lab.summary}</em>
                </span>
                <span className={`badge badge--${lab.difficulty.toLowerCase()}`}>{lab.difficulty}</span>
                <span className="labrow__cat">{CATEGORIES.find((c) => c.id === lab.category)?.name}</span>
                <span className={`labrow__tick${solved.has(lab.id) ? ' labrow__tick--on' : ''}`}>
                  {solved.has(lab.id) ? '✓' : '→'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="section section--split">
        <div>
          <h2>How the labs work</h2>
          <ol className="howto">
            <li>
              <strong>A real engine, locally.</strong> sql.js compiles SQLite to WebAssembly. Each request seeds a fresh
              database, so every attempt is reproducible and nothing persists between labs.
            </li>
            <li>
              <strong>The bug is visible.</strong> After every request you see the concatenated SQL the application actually
              built. That single pane teaches more than a thousand words of theory.
            </li>
            <li>
              <strong>Walkthroughs that match the lab.</strong> Every payload in a walkthrough is executed by the test suite
              against the same schema before this site ships, so the solutions really solve.
            </li>
          </ol>
        </div>
        <div className="ethics">
          <h3>Use this legally</h3>
          <p>
            Everything here is a self-contained simulation that runs in your own browser — there is no backend to attack and
            no data to leak. The techniques are identical to the ones used against real systems, which means the same rules
            apply: only test systems you own or have explicit written permission to test.
          </p>
          <p className="ethics__small">
            Unauthorised access to a computer system is a criminal offence in most jurisdictions, regardless of intent.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
