import { useCallback, useEffect, useState } from 'react';
import { Home } from './components/Home';
import { LabView } from './components/LabView';
import { Reference } from './components/Reference';
import { Sidebar } from './components/Sidebar';
import { Footer } from './components/Footer';
import { LABS, labById } from './data/labs';
import { loadSolved, saveSolved } from './lib/progress';

type Route = { name: 'home' } | { name: 'lab'; id: string } | { name: 'reference' };

function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  if (clean.startsWith('lab/')) {
    const id = clean.slice(4);
    if (labById.has(id)) return { name: 'lab', id };
  }
  if (clean === 'reference') return { name: 'reference' };
  return { name: 'home' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [solved, setSolved] = useState<Set<string>>(() => loadSolved());
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    saveSolved(solved);
  }, [solved]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    setMenuOpen(false);
  }, [route]);

  const navigate = useCallback((hash: string) => {
    if (window.location.hash === hash) {
      setRoute(parseRoute(hash));
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    } else {
      window.location.hash = hash;
    }
  }, []);

  const markSolved = useCallback((id: string) => {
    setSolved((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  if (route.name === 'home') {
    return (
      <div className="app">
        <header className="topbar">
          <button type="button" className="brand" onClick={() => navigate('#/')}>
            <span className="brand__glyph">'</span>
            <span className="brand__text">
              SQLi<span>Academy</span>
            </span>
          </button>
          <nav className="topnav">
            <button type="button" onClick={() => document.getElementById('labs')?.scrollIntoView({ behavior: 'smooth' })}>
              All labs
            </button>
            <button type="button" onClick={() => navigate('#/reference')}>
              Reference
            </button>
            <button type="button" className="btn btn--small btn--primary" onClick={() => navigate(`#/lab/${LABS[0].id}`)}>
              Start lab 01
            </button>
          </nav>
          <div className="topbar__progress">
            {solved.size}/{LABS.length}
          </div>
        </header>
        <Home solved={solved} onNavigate={navigate} />
      </div>
    );
  }

  const lab = route.name === 'lab' ? labById.get(route.id) ?? null : null;

  return (
    <div className="app app--split">
      <div className={`sidebar-wrap${menuOpen ? ' sidebar-wrap--open' : ''}`}>
        <Sidebar
          activeLabId={lab?.id}
          solved={solved}
          onNavigate={navigate}
          onClose={() => setMenuOpen(false)}
        />
      </div>
      {menuOpen && <div className="overlay" onClick={() => setMenuOpen(false)} role="presentation" />}

      <div className="main">
        <div className="mobilebar">
          <button type="button" className="mobilebar__menu" onClick={() => setMenuOpen(true)} aria-label="Open lab navigation">
            ☰
          </button>
          <button type="button" className="brand brand--small" onClick={() => navigate('#/')}>
            <span className="brand__glyph">'</span>
            <span className="brand__text">
              SQLi<span>Academy</span>
            </span>
          </button>
          <span className="topbar__progress">
            {solved.size}/{LABS.length}
          </span>
        </div>

        {lab ? (
          <LabView lab={lab} solved={solved} onSolved={markSolved} onNavigate={navigate} />
        ) : route.name === 'reference' ? (
          <Reference onNavigate={navigate} />
        ) : (
          <div className="notfound">
            <h1>Lab not found</h1>
            <button type="button" className="btn btn--primary" onClick={() => navigate('#/')}>
              Back to the academy
            </button>
          </div>
        )}
        <Footer />
      </div>
    </div>
  );
}
