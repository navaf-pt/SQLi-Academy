import { useState } from 'react';
import type { Lab, Outcome, QueryResult, Verdict } from '../data/types';
import { evaluate, followUp, runLab, seedDatabase } from '../lib/runner';
import { getSQL, registerUdfs } from '../lib/sqljs.web';
import { CodeBlock } from './CodeBlock';
import { RichText } from './RichText';

interface Props {
  lab: Lab;
  solved: boolean;
  onSolved: (id: string) => void;
}

function ResultTable({ result }: { result: QueryResult }) {
  return (
    <div className="table-wrap">
      <table className="rtable">
        <thead>
          <tr>
            {result.columns.map((c, i) => (
              <th key={`${c}-${i}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.values.length === 0 ? (
            <tr>
              <td className="rtable__empty" colSpan={Math.max(1, result.columns.length)}>
                0 rows
              </td>
            </tr>
          ) : (
            result.values.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>
                    {cell === null ? <span className="null">NULL</span> : typeof cell === 'string' ? cell : String(cell)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function LabPlayground({ lab, solved, onSolved }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(lab.fields.map((f) => [f.id, f.value])),
  );
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [later, setLater] = useState<{ label: string; results: QueryResult[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [answerState, setAnswerState] = useState<'idle' | 'wrong' | 'correct'>('idle');

  async function run() {
    setBusy(true);
    setEngineError(null);
    try {
      const SQL = await getSQL();
      const db = new SQL.Database();
      registerUdfs(db);
      try {
        seedDatabase(db, lab);
        const result = runLab(db, lab, values);
        const checked = evaluate(lab, result, db, values);
        const after = followUp(lab, db);
        setOutcome(result);
        setVerdict(checked);
        setLater(after);
        if (checked.solved) onSolved(lab.id);
      } finally {
        db.close();
      }
    } catch (e) {
      setEngineError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!lab.answer) return;
    const ok = answer.trim().toLowerCase() === lab.answer.expected.trim().toLowerCase();
    setAnswerState(ok ? 'correct' : 'wrong');
    if (ok) onSolved(lab.id);
  }

  function resetInputs() {
    setValues(Object.fromEntries(lab.fields.map((f) => [f.id, f.value])));
    setOutcome(null);
    setVerdict(null);
    setLater(null);
    setAnswer('');
    setAnswerState('idle');
  }

  const showSolved = solved || answerState === 'correct' || Boolean(verdict?.solved);

  return (
    <div className="playground">
      <div className="chrome">
        <div className="chrome__dots">
          <span />
          <span />
          <span />
        </div>
        <div className="chrome__url">
          <span className="chrome__lock">🔒</span>
          {lab.appURL}
        </div>
        <div className="chrome__meta">{lab.dbms}</div>
      </div>

      <div className="playground__body">
        <div className="playground__form">
          {lab.fields.map((field) => (
            <label className="field" key={field.id}>
              <span className="field__label">
                {field.label}
                {field.hint && <em>{field.hint}</em>}
              </span>
              {field.multiline ? (
                <textarea
                  className="input input--mono"
                  rows={3}
                  spellCheck={false}
                  value={values[field.id] ?? ''}
                  placeholder={field.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
                />
              ) : (
                <input
                  className="input input--mono"
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  value={values[field.id] ?? ''}
                  placeholder={field.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void run();
                  }}
                />
              )}
            </label>
          ))}

          <div className="playground__actions">
            <button type="button" className="btn btn--primary" onClick={() => void run()} disabled={busy}>
              {busy ? 'Running…' : 'Send request'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={resetInputs}>
              Reset inputs
            </button>
            {showSolved && <span className="pill pill--ok">solved</span>}
          </div>
        </div>

        {engineError && <div className="msg msg--err">Engine error: {engineError}</div>}

        {outcome && (
          <div className="response">
            <div className="response__head">
              <span className="response__title">Response</span>
              <span className={`pill ${outcome.elapsedMs > 800 ? 'pill--warn' : ''}`}>{outcome.elapsedMs} ms</span>
              {outcome.error && <span className="pill pill--err">error</span>}
            </div>

            {outcome.notes.length > 0 && (
              <div className="msg msg--warn">
                <strong>Input sanitizer:</strong>
                <ul>
                  {outcome.notes.map((n, i) => (
                    <li key={i}>{n.replace(/`/g, '')}</li>
                  ))}
                </ul>
              </div>
            )}

            {outcome.log.length > 0 && (
              <ul className="applog">
                {outcome.log.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}

            <CodeBlock code={outcome.sentSQL} label="SQL sent to the database" tone="mint" />

            {outcome.error && <div className="msg msg--err">{outcome.error}</div>}

            {outcome.statements.map((stmt, i) =>
              stmt.results.map((result, j) => (
                <div className="stmt" key={`${i}-${j}`}>
                  {outcome.statements.length > 1 && <div className="stmt__label">statement {i + 1}</div>}
                  <ResultTable result={result} />
                </div>
              )),
            )}

            {outcome.statements.every((s) => s.results.length === 0) && !outcome.error && (
              <div className="msg msg--info">The database returned no rows. That is still information: the statement executed.</div>
            )}

            {later && (
              <div className="followup">
                <div className="stmt__label">database state → {later.label}</div>
                {later.results.map((r, i) => (
                  <ResultTable result={r} key={i} />
                ))}
              </div>
            )}

            {verdict && (
              <div className={`verdict ${verdict.solved ? 'verdict--ok' : 'verdict--info'}`}>
                <span className="verdict__icon">{verdict.solved ? '✓' : 'i'}</span>
                <RichText text={verdict.message} />
              </div>
            )}
          </div>
        )}

        {lab.answer && (
          <form className="answerbox" onSubmit={submitAnswer}>
            <div className="answerbox__head">
              <strong>Submit the value you extracted</strong>
              <span>{lab.answer.label}</span>
            </div>
            {lab.answer.note && <p className="answerbox__note">{lab.answer.note}</p>}
            <div className="answerbox__row">
              <input
                className="input input--mono"
                value={answer}
                placeholder={lab.answer.placeholder}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => {
                  setAnswer(e.target.value);
                  setAnswerState('idle');
                }}
              />
              <button type="submit" className="btn btn--primary">
                Verify
              </button>
            </div>
            {answerState === 'correct' && <div className="msg msg--ok">Correct — that is the value the oracle was hiding.</div>}
            {answerState === 'wrong' && <div className="msg msg--err">Not quite. Keep extracting; the oracle is still there.</div>}
          </form>
        )}
      </div>
    </div>
  );
}
