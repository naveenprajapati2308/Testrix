import { useState, useEffect } from 'react';
import ThemeToggle from './ThemeToggle';

/* ═══════════════════════════════════════════════════════════════════════
   NAVBAR — Sticky, glass-blur, responsive with mobile menu & theme toggle
   ═══════════════════════════════════════════════════════════════════════ */

const NAV_LINKS = [
  { label: 'Products', href: '#products' },
  { label: 'Features', href: '#features' },
  { label: 'Architecture', href: '#architecture' },
  { label: 'Documentation', href: '/document' },
  { label: 'Why Testrix', href: '#why' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="navbar-inner">
        {/* Brand */}
        <a href="#" className="navbar-brand">
          <img src={`${import.meta.env.BASE_URL}testrix_logo.png`} alt="Testrix" className="navbar-logo" />
          <span className="navbar-brand-text">Testrix</span>
        </a>

        {/* Mobile Menu & Drawer */}
        <div className={`navbar-menu ${mobileOpen ? 'open' : ''}`}>
          <ul className="navbar-links">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setMobileOpen(false)}>{l.label}</a>
              </li>
            ))}
          </ul>
          <div className="mobile-only-actions">
            <a href="/" className="btn btn-ghost">
              Login
            </a>
            <a href="/" className="btn btn-primary">
              Request Workspace
            </a>
          </div>
        </div>

        {/* Navbar Actions Container in navbar-inner */}
        <div className="navbar-actions">
          <ThemeToggle />
          <div className="action-buttons">
            <a href="/" className="btn btn-ghost">
              Login
            </a>
            <a href="/" className="btn btn-primary">
              Request Workspace
            </a>
          </div>
          <button
            className={`mobile-menu-btn ${mobileOpen ? 'active' : ''}`}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <span /><span /><span />
          </button>
        </div>
      </div>
    </nav>
  );
}
