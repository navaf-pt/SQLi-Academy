import { useState } from 'react';
import type { Lab } from '../data/types';
import { CATEGORIES } from '../data/types';
import { neighbours, labNumber } from '../data/labs';
import { CodeBlock } from './CodeBlock';
import { LabPlayground } from './LabPlayground';
import { RichText } from './RichText';

interface Props {
  lab: Lab;
  solved: Set<string>;
  onSolved: (id: string) => void;
  onNavigate: (hash: string) => void;
}

type Tab = 'brief' | 'hints' | 'walkthrough';

export function LabView({ lab, solved, onSolved, onNavigate }: Props) {
  const [tab, setTab] = useState<Tab>('brief');
  const category = CATEGORIES.find((c) => c.id === lab.category);
  const { prev, next } = neighbours(lab.id);

  return (
    <article className="labview">
      <div className="crumbs">
        <button type="button" onClick={() => onNavigate('#/')}>
          Academy
        </button>
        <span>/</span>
        <span>{category?.name}</span>
        <span>/</span>
        <span className="crumbs__current">Lab {labNumber(lab.id)}</span>
      </div>

      <header className="labhead">
        <div className="labhead__badges">
          <span className="badge badge--num">LAB {labNumber(lab.id)}</span>
          <span className={`badge badge--${lab.difficulty.toLowerCase()}`}>{lab.difficulty}</span>
          <span className="badge badge--ghost">{category?.name}</span>
          <span className="badge badge--ghost">{lab.dbms}</span>
        </div>
        <h1>{lab.title}</h1>
        <p className="labhead__summary">{lab.summary}</p>
      </header>

      <div className="objective">
        <span className="objective__label">Objective</span>
        <RichText text={lab.objective} />
      </div>

      <LabPlayground lab={lab} solved={solved.has(lab.id)} onSolved={onSolved} />

      <div className="tabs">
        <div className="tabs__bar" role="tablist">
          {(['brief', 'hints', 'walkthrough'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`tabs__tab${tab === t ? ' tabs__tab--active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'brief' ? 'Brief' : t === 'hints' ? `Hints (${lab.hints.length})` : 'Walkthrough'}
            </button>
          ))}
        </div>

        {tab === 'brief' && (
          <div className="panel">
            {lab.brief.map((p, i) => (
              <RichText key={i} text={p} className="prose" />
            ))}
            <div className="callout">
              <strong>How to use this lab.</strong> The database above is real — seeded fresh for every request you send. Every
              payload genuinely executes. Nothing leaves your browser, and there is no rate limit.
            </div>
          </div>
        )}

        {tab === 'hints' && (
          <div className="panel">
            <p className="prose">Reveal one at a time. The last hint is very close to the answer.</p>
            {lab.hints.map((hint, i) => (
              <details className="hint" key={i}>
                <summary>Hint {i + 1}</summary>
                <RichText text={hint} />
              </details>
            ))}
          </div>
        )}

        {tab === 'walkthrough' && (
          <div className="panel">
            <p className="prose">
              Full solution, step by step. Try the lab first — the walkthrough is much more useful once something has failed
              in an interesting way.
            </p>
            <ol className="steps">
              {lab.walkthrough.map((step, i) => (
                <li className="step" key={i}>
                  <div className="step__num">{String(i + 1).padStart(2, '0')}</div>
                  <div className="step__body">
                    <h3>{step.title}</h3>
                    {step.text.map((t, j) => (
                      <RichText key={j} text={t} className="prose" />
                    ))}
                    {step.payload && <CodeBlock code={step.payload} label="payload" />}
                    {step.result && (
                      <p className="step__result">
                        <span>▸</span> {step.result}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <nav className="labnav">
        {prev ? (
          <button type="button" className="labnav__btn" onClick={() => onNavigate(`#/lab/${prev.id}`)}>
            <span>← Previous</span>
            <strong>{prev.title}</strong>
          </button>
        ) : (
          <span />
        )}
        {next && (
          <button type="button" className="labnav__btn labnav__btn--next" onClick={() => onNavigate(`#/lab/${next.id}`)}>
            <span>Next →</span>
            <strong>{next.title}</strong>
          </button>
        )}
      </nav>
    </article>
  );
}
