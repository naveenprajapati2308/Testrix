import { useTyping } from '../hooks';

/* ═══════════════════════════════════════════════════════════════════════
   HERO SECTION — Customer-facing value proposition & live typing subtitle
   ═══════════════════════════════════════════════════════════════════════ */

const TYPED_WORDS = [
  'Web & UI Automation',
  'API Collections & Scheduling',
  'Load & Performance Testing',
  'AI-Powered Test Intelligence',
];

export default function Hero() {
  const typed = useTyping(TYPED_WORDS, 85, 45, 2000);

  return (
    <section className="hero" id="hero">
      {/* Ambient background orbs & cyber grid */}
      <div className="hero-bg">
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />
        <div className="hero-grid" />
      </div>

      {/* Content */}
      <div className="hero-content">


        <h1 className="hero-title">
          One Platform.<br />
          <span className="hero-title-gradient">Four Testing Products.</span><br />
          Zero Fragmentation.
        </h1>

        <p className="hero-subtitle-line">
          Built for&nbsp;
          <span className="hero-title-gradient" style={{ fontWeight: 800 }}>
            {typed}
          </span>
          <span style={{
            borderRight: '2px solid var(--accent-primary)',
            animation: 'typewriter-blink 1s step-end infinite',
            marginLeft: '2px'
          }}>&nbsp;</span>
        </p>

        <p className="hero-description">
          Orchestrate your entire testing lifecycle — end-to-end UI automation,
          scheduled API collections, high-concurrency load simulations, and
          AI-driven root-cause diagnostics — all within one centralized, collaborative workspace.
        </p>

        <div className="hero-cta">
          <a href="/" className="btn btn-primary btn-large">
            🚀&nbsp; Access Platform
          </a>
          <a href="#products" className="btn btn-ghost btn-large">
            Explore All Products &nbsp;→
          </a>
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-number">4-in-1</div>
            <div className="hero-stat-label">Testing Disciplines</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-number">1</div>
            <div className="hero-stat-label">Command<br className="mobile-br" /> Center</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-number">100%</div>
            <div className="hero-stat-label">Workspace Isolation</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-number">Real-Time</div>
            <div className="hero-stat-label">Live Event Streaming</div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      {/* <div className="scroll-indicator">
        <div className="scroll-mouse" />
        <span className="scroll-text">Scroll</span>
      </div> */}
    </section>
  );
}
