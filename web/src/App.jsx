import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import { Icon } from './lib.jsx';
import Guide from './Guide.jsx';

import Home from './pages/Home.jsx';
import Give from './pages/Give.jsx';
import PlannedGiving from './pages/PlannedGiving.jsx';
import Calculators from './pages/Calculators.jsx';
import Vault from './pages/Vault.jsx';
import Impact from './pages/Impact.jsx';
import Counsel from './pages/Counsel.jsx';
import About from './pages/About.jsx';
import Portal from './pages/Portal.jsx';

const NAV = [
  ['/', 'Home'],
  ['/give', 'Give Now'],
  ['/planned-giving', 'Legacy Giving'],
  ['/calculators', 'Calculators'],
  ['/vault', 'Document Vault'],
  ['/impact', 'My Impact'],
  ['/about', 'About Gurudev'],
];

function Mark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="brand-mark" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="none" stroke="var(--saffron)" strokeWidth="1" opacity=".55" />
      <path d="M20 7c3.1 3.6 4.7 6.9 4.7 10.1a4.7 4.7 0 0 1-9.4 0C15.3 13.9 16.9 10.6 20 7Z" fill="var(--indigo)" />
      <path d="M20 33c-5.6 0-10-2.9-10-6.5 0-1.4.7-2.7 1.9-3.8C13.7 25 16.7 26.2 20 26.2s6.3-1.2 8.1-3.5c1.2 1.1 1.9 2.4 1.9 3.8 0 3.6-4.4 6.5-10 6.5Z" fill="var(--saffron)" />
    </svg>
  );
}

function Nav() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <nav className="nav" aria-label="Primary">
      <div className="wrap nav-inner">
        <Link to="/" className="brand" aria-label="Sankalpa home">
          <Mark />
          <div>
            <div className="brand-name">SANKALPA</div>
            <div className="brand-sub">Gurudev Legacy Endowment</div>
          </div>
        </Link>
        <div className={`nav-links${open ? ' open' : ''}`}>
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
          ))}
          <NavLink to="/portal" style={{ color: 'var(--earth)' }}>Finance Portal</NavLink>
          <Link to="/give" className="btn btn-gold btn-sm" style={{ marginLeft: 6 }}>Give Now</Link>
        </div>
        <button className="nav-toggle" onClick={() => setOpen(!open)}
          aria-expanded={open} aria-label="Toggle navigation menu">
          {open ? <Icon.x width={24} height={24} /> : <Icon.menu />}
        </button>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="footer-light">
      <div className="wrap">
        <div className="grid g4" style={{ gap: 44, marginBottom: 56 }}>
          <div>
            <div className="row" style={{ gap: 12, marginBottom: 18 }}>
              <Mark size={38} />
              <div>
                <div className="brand-name">SANKALPA</div>
                <div className="brand-sub">Legacy Endowment</div>
              </div>
            </div>
            <p className="muted small" style={{ maxWidth: '30ch' }}>
              Your legacy. His mission. Our world. A permanent endowment for the Art of Living Foundation's
              global humanitarian and educational work.
            </p>
          </div>
          <div>
            <div className="overline">Give</div>
            {[['/give', 'Make a gift today'], ['/planned-giving', 'Legacy & planned giving'],
              ['/calculators', 'Gift calculators'], ['/counsel', 'Complex assets']].map(([to, t]) => (
              <div key={to} style={{ marginBottom: 9 }}>
                <Link to={to} className="small">{t}</Link>
              </div>
            ))}
          </div>
          <div>
            <div className="overline">Platform</div>
            {[['/impact', 'My impact dashboard'], ['/vault', 'Secure document vault'],
              ['/portal', 'Finance & accounting portal'], ['/about', 'About Gurudev']].map(([to, t]) => (
              <div key={to} style={{ marginBottom: 9 }}>
                <Link to={to} className="small">{t}</Link>
              </div>
            ))}
          </div>
          <div>
            <div className="overline">Assurance</div>
            <p className="muted small">
              AES-256 at rest · TLS 1.3 in transit · PCI DSS SAQ A · WCAG 2.1 AA ·
              FASB ASC 958 and ASU 2016-14 fund accounting · immutable audit trail.
            </p>
          </div>
        </div>
        <hr className="rule" />
        <div className="between" style={{ paddingTop: 26 }}>
          <p className="muted tiny" style={{ margin: 0, maxWidth: '62ch' }}>
            Sankalpa is a demonstration platform built to the Sri Sri Gurudev Ravishankar Foundation
            requirements specification. Campaign figures are generated sample data, not the Foundation's
            actual financial records. Nothing here is legal or tax advice — please consult your own adviser.
          </p>
          <p className="muted tiny" style={{ margin: 0 }}>Peace starts within.</p>
        </div>
      </div>
    </footer>
  );
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' }); }, [pathname]);
  return null;
}

export default function App() {
  const loc = useLocation();
  const isPortal = loc.pathname.startsWith('/portal');
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <ScrollTop />
      {!isPortal && <Nav />}
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/give" element={<Give />} />
          <Route path="/planned-giving" element={<PlannedGiving />} />
          <Route path="/calculators" element={<Calculators />} />
          <Route path="/vault" element={<Vault />} />
          <Route path="/impact" element={<Impact />} />
          <Route path="/counsel" element={<Counsel />} />
          <Route path="/about" element={<About />} />
          <Route path="/portal" element={<Portal />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      {!isPortal && <Footer />}
      <Guide />
    </>
  );
}
