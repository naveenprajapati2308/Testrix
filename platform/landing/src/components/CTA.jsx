import { useReveal } from '../hooks';

/* ═══════════════════════════════════════════════════════════════════════
   CTA SECTION — Final call to action
   ═══════════════════════════════════════════════════════════════════════ */

export default function CTA() {
  const [ref, visible] = useReveal();

  return (
    <section className="cta-section" id="cta">
      <div className="cta-bg" />
      <div
        ref={ref}
        className={`cta-content reveal ${visible ? 'visible' : ''}`}
      >
        <div className="section-badge">🚀 Get Started</div>
        <h2 className="cta-title">
          Ready to Unify Your<br />
          <span className="hero-title-gradient">Testing Pipeline?</span>
        </h2>
        <p className="cta-desc">
          Join the teams already running automation, API, performance, and AI testing 
          from a single platform. Get your workspace in minutes.
        </p>
        <div className="cta-buttons">
          <a href="/" className="btn btn-primary btn-large">
            🔑&nbsp; Login to Testrix
          </a>
          <a href="/" className="btn btn-ghost btn-large">
            📋&nbsp; Request Workspace
          </a>
        </div>
      </div>
    </section>
  );
}
