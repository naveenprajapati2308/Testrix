/* ═══════════════════════════════════════════════════════════════════════
   FOOTER — Links, brand, social & credit line
   ═══════════════════════════════════════════════════════════════════════ */

const FOOTER_COLS = [
  {
    title: 'Products',
    links: [
      { label: 'Automation Testing', href: '#' },
      { label: 'API Testing', href: '#' },
      { label: 'Performance Testing', href: '#' },
      { label: 'GenAI Assistant', href: '#' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { label: 'Architecture', href: '#architecture' },
      { label: 'Features', href: '#features' },
      { label: 'Security', href: '#features' },
      { label: 'Contact Us', href: '#' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Getting Started', href: '#' },
      { label: 'API Reference', href: '#' },
      { label: 'Deployment Guide', href: '#' },
      { label: 'Changelog', href: '#' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          {/* Brand */}
          <div>
            <div className="navbar-brand">
              <img src={`${import.meta.env.BASE_URL}testrix_logo.png`} alt="Testrix" className="navbar-logo" />
              <span className="navbar-brand-text">Testrix</span>
            </div>
            <p className="footer-brand-desc">
              Unified Testing Platform — one login, four products, zero compromise.
              Built for engineering teams who ship with confidence.
            </p>
          </div>

          {/* Link Columns */}
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <h4 className="footer-col-title">{col.title}</h4>
              <ul className="footer-links">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="footer-bottom">
          <span className="footer-copyright">
            © {new Date().getFullYear()} Testrix. All rights reserved.
          </span>

          {/* Designed and Developed by Naveen */}
          <div className="footer-credit">
            <span className="footer-credit-badge">
              ✨ Designed and Developed by <strong>NAVEEN</strong>
            </span>
          </div>

          <div className="footer-social">
            <a href="#" className="footer-social-link" aria-label="GitHub">⌨</a>
            <a href="#" className="footer-social-link" aria-label="Twitter">𝕏</a>
            <a href="#" className="footer-social-link" aria-label="LinkedIn">in</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
