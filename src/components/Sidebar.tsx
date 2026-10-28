import { useMemo, useState } from 'react';
import { CATEGORIES } from '../data/types';
import { LABS, labNumber } from '../data/labs';

interface Props {
  activeLabId?: string;
  solved: Set<string>;
  onNavigate: (hash: string) => void;
  onClose?: () => void;
}

export function Sidebar({ activeLabId, solved, onNavigate, onClose }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LABS;
    return LABS.filter(
      (lab) =>
        lab.title.toLowerCase().includes(q) ||
        lab.summary.toLowerCase().includes(q) ||
        lab.category.toLowerCase().includes(q) ||
        lab.dbms.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <aside className="sidebar">
      <div className="sidebar__top">
        <button type="button" className="brand brand--small" onClick={() => onNavigate('#/')}>
          <span className="brand__glyph">'</span>
          <span className="brand__text">
            SQLi<span>Academy</span>
          </span>
        </button>
        {onClose && (
          <button type="button" className="sidebar__close" onClick={onClose} aria-label="Close navigation">
            ×
          </button>
        )}
      </div>

      <div className="sidebar__progress">
        <div className="sidebar__progress-row">
          <span>Labs solved</span>
          <strong>
            {solved.size}/{LABS.length}
          </strong>
        </div>
        <div className="progressbar">
          <div className="progressbar__fill" style={{ width: `${(solved.size / LABS.length) * 100}%` }} />
        </div>
      </div>

      <input
        className="sidebar__search"
        type="search"
        placeholder="Filter labs…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Filter labs"
      />

      <nav className="sidebar__nav">
        {CATEGORIES.map((cat) => {
          const labs = filtered.filter((lab) => lab.category === cat.id);
          if (labs.length === 0) return null;
          return (
            <div className="sidegroup" key={cat.id}>
              <div className="sidegroup__head">
                <span className="sidegroup__glyph">{cat.glyph}</span>
                {cat.name}
              </div>
              <ul>
                {labs.map((lab) => (
                  <li key={lab.id}>
                    <button
                      type="button"
                      className={`sidelink${activeLabId === lab.id ? ' sidelink--active' : ''}${
                        solved.has(lab.id) ? ' sidelink--solved' : ''
                      }`}
                      onClick={() => onNavigate(`#/lab/${lab.id}`)}
                    >
                      <span className="sidelink__num">{labNumber(lab.id)}</span>
                      <span className="sidelink__title">{lab.title}</span>
                      {solved.has(lab.id) && <span className="sidelink__tick">✓</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="sidebar__empty">No labs match “{query}”.</p>}
      </nav>

      <button type="button" className="sidebar__ref" onClick={() => onNavigate('#/reference')}>
        <span>≡</span> Attack reference &amp; cheat sheet
      </button>
    </aside>
  );
}
