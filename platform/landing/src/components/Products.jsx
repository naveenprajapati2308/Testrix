import { useReveal, useMouseTracker } from '../hooks';

/* ═══════════════════════════════════════════════════════════════════════
   PRODUCTS — 4 interactive cards with spotlight effect & rich QA capabilities
   Featuring Automated Scheduling & Execution History across API and Performance
   ═══════════════════════════════════════════════════════════════════════ */

const PRODUCTS = [
  {
    icon: '⚡',
    title: 'Automation Testing',
    desc: 'Run Selenium, TestNG, and Playwright suites across multiple environments (QA, UAT, Staging, Production). Monitor executions in real-time with step-level live logs, automatic failure screenshots, video recordings, and executive reports.',
    tags: ['Selenium & Playwright', 'Live Log Streaming', 'Failure Screenshots', 'Video Artifacts', 'Environment Matrix', 'Executive Reports'],
    accent: 'linear-gradient(135deg, #6366f1, #818cf8)',
    accentColor: '#6366f1',
    iconBg: 'rgba(99, 102, 241, 0.15)',
  },
  {
    icon: '🔗',
    title: 'API Testing & Scheduled Monitors',
    desc: 'Design structured request collections, configure environment variables, and chain multi-step workflows. Set automated recurring execution schedules (cron/hourly/daily) with dedicated run queues. Drill into deep Execution History with full request/response timelines, status codes, assertion pass-rates, and latency drift trends.',
    tags: ['Automated Scheduling', 'Deep Execution History', 'Recurring Monitors', 'Assertion Chains', 'Latency Drift Tracking', 'Request Chaining'],
    accent: 'linear-gradient(135deg, #06b6d4, #22d3ee)',
    accentColor: '#06b6d4',
    iconBg: 'rgba(6, 182, 212, 0.15)',
  },
  {
    icon: '📊',
    title: 'Performance Testing & Load History',
    desc: 'Simulate high-concurrency real-world traffic with virtual users and stress-test target endpoints. Schedule off-peak load test runs with intelligent queueing. Track complete historical execution trends, compare past test runs side-by-side, uncover latency drift percentiles (p90/p95/p99), and verify SLA compliance across releases.',
    tags: ['Scheduled Load Runs', 'Historical Run Compare', 'Virtual User Scaling', 'Latency Drift Analytics', 'p95/p99 Percentiles', 'SLA Threshold History'],
    accent: 'linear-gradient(135deg, #10b981, #34d399)',
    accentColor: '#10b981',
    iconBg: 'rgba(168, 85, 247, 0.15)',
  },
  {
    icon: '🤖',
    title: 'GenAI QA Copilot',
    desc: 'An AI-powered testing companion that diagnoses test failures, analyzes stack traces in seconds, and provides root-cause recommendations. Query past test runs, compare module health, and uncover flaky tests using natural language.',
    tags: ['Intelligent Copilot', 'Root-Cause Analysis', 'Cross-Suite Queries', 'Flaky Test Detection', 'Plain English Insights', 'Web Knowledge'],
    accent: 'linear-gradient(135deg, #a855f7, #c084fc)',
    accentColor: '#a855f7',
    iconBg: 'rgba(168, 85, 247, 0.15)',
  },
];

function ProductCard({ product, index }) {
  const [ref, visible] = useReveal();
  const [cardRef, onMouseMove] = useMouseTracker();

  return (
    <div
      ref={(el) => { ref.current = el; cardRef.current = el; }}
      className={`product-card reveal ${visible ? 'visible' : ''} stagger-${index + 1}`}
      style={{ '--card-accent': product.accent }}
      onMouseMove={onMouseMove}
    >
      <div className="product-card-content">
        <div
          className="product-icon-wrap"
          style={{ background: product.iconBg }}
        >
          {product.icon}
        </div>
        <h3 className="product-card-title">{product.title}</h3>
        <p className="product-card-desc">{product.desc}</p>
        <div className="product-features">
          {product.tags.map((tag) => (
            <span key={tag} className="product-tag">{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Products() {
  const [headerRef, headerVisible] = useReveal();

  return (
    <section className="section products-section" id="products">
      <div className="container">
        <div
          ref={headerRef}
          className={`text-center reveal ${headerVisible ? 'visible' : ''}`}
        >
          <div className="section-badge">🎯 Product Suite</div>
          <h2 className="section-title">Four Products, One Seamless Platform</h2>
          <p className="section-subtitle mx-auto">
            Everything your QA and engineering teams require — from automated regression 
            runs to scheduled API monitoring, historical performance comparisons, and AI diagnostics — united under one command center.
          </p>
        </div>

        <div className="products-grid">
          {PRODUCTS.map((p, i) => (
            <ProductCard key={p.title} product={p} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
