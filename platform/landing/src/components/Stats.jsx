import { useReveal, useCounter } from '../hooks';

/* ═══════════════════════════════════════════════════════════════════════
   STATS — Real-world Product Metrics & Performance Highlights
   ═══════════════════════════════════════════════════════════════════════ */

const STATS = [
  { icon: '🧪', target: 4, suffix: '-in-1', label: 'Testing Disciplines' },
  { icon: '🏢', target: 100, suffix: '%', label: 'Workspace Data Isolation' },
  { icon: '⚡', target: 10, suffix: 'x', label: 'Faster Root-Cause Analysis' },
  { icon: '🛡️', target: 99, suffix: '.9%', label: 'Enterprise Uptime SLA' },
];

function StatCard({ stat, index }) {
  const [ref, visible] = useReveal();
  const [counterRef, count] = useCounter(stat.target, 2000);

  return (
    <div
      ref={(el) => { ref.current = el; counterRef.current = el; }}
      className={`stat-card reveal ${visible ? 'visible' : ''} stagger-${index + 1}`}
    >
      <div className="stat-icon">{stat.icon}</div>
      <div className="stat-number">{count}{stat.suffix}</div>
      <div className="stat-label">{stat.label}</div>
    </div>
  );
}

export default function Stats() {
  const [headerRef, headerVisible] = useReveal();

  return (
    <section className="section stats-section" id="stats">
      <div className="container">
        <div
          ref={headerRef}
          className={`text-center reveal ${headerVisible ? 'visible' : ''}`}
        >
          <div className="section-badge">📊 Product Impact</div>
          <h2 className="section-title">Tested at Scale</h2>
          <p className="section-subtitle mx-auto">
            Empowering engineering organizations with reliable suite automation, 
            rapid debugging, and rock-solid test governance.
          </p>
        </div>

        <div className="stats-grid">
          {STATS.map((s, i) => (
            <StatCard key={s.label} stat={s} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
