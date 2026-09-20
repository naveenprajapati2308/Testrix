import { useReveal } from '../hooks';

/* ═══════════════════════════════════════════════════════════════════════
   WHY TESTRIX — Benefits with glassmorphism cards & QA value
   ═══════════════════════════════════════════════════════════════════════ */

const REASONS = [
  {
    icon: '🎯',
    title: 'One Platform, All Testing',
    desc: 'Eliminate fragmented testing tools. Automation suites, API collections, load simulations, and AI diagnostics share one unified interface and data store.',
  },
  {
    icon: '🔗',
    title: 'Unified Identity & Access',
    desc: 'Single sign-on across all workspaces. One set of credentials, unified role management, and instant switching between multiple projects with zero friction.',
  },
  {
    icon: '🛡️',
    title: 'Resilient Failure Isolation',
    desc: 'Independent test run sandboxing ensures that an issue in an external automation run or runner never compromises your active workspaces or other suites.',
  },
  {
    icon: '🤖',
    title: 'AI-Powered QA Intelligence',
    desc: 'GenAI copilot that understands your automation execution histories, compares module pass-rates, and surfaces the root causes of flaky tests in seconds.',
  },
  {
    icon: '📊',
    title: 'Cross-Product Health Trends',
    desc: 'Comprehensive dashboards that correlate UI automation failures with API regressions and latency drift, providing immediate release-readiness insights.',
  },
  {
    icon: '🚀',
    title: 'Elastic Execution Capacity',
    desc: 'Trigger extensive nightly regression batches or run parallel API monitoring suites without performance slowdowns or test job starvation.',
  },
];

function WhyCard({ reason, index }) {
  const [ref, visible] = useReveal();

  return (
    <div
      ref={ref}
      className={`why-card reveal ${visible ? 'visible' : ''} stagger-${index + 1}`}
    >
      <div className="why-card-icon">{reason.icon}</div>
      <h3 className="why-card-title">{reason.title}</h3>
      <p className="why-card-desc">{reason.desc}</p>
    </div>
  );
}

export default function WhyTestrix() {
  const [headerRef, headerVisible] = useReveal();

  return (
    <section className="section why-section" id="why">
      <div className="container">
        <div
          ref={headerRef}
          className={`text-center reveal ${headerVisible ? 'visible' : ''}`}
        >
          <div className="section-badge">💡 Why Testrix</div>
          <h2 className="section-title">Why Engineering Teams Choose Testrix</h2>
          <p className="section-subtitle mx-auto">
            Architected by QA engineers for enterprise teams. Accelerate release velocity, 
            diagnose failures faster, and maintain total quality governance.
          </p>
        </div>

        <div className="why-grid">
          {REASONS.map((r, i) => (
            <WhyCard key={r.title} reason={r} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
