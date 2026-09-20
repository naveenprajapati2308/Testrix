import { useReveal } from '../hooks';

/* ═══════════════════════════════════════════════════════════════════════
   FEATURES — Enterprise QA Platform Capabilities
   With Dedicated Automated Scheduling & Deep Execution History
   ═══════════════════════════════════════════════════════════════════════ */

const FEATURES = [
  {
    icon: '⏱️',
    title: 'Automated Scheduling & Recurring Jobs',
    desc: 'Schedule API collection monitors and performance load tests on recurring intervals (hourly, nightly, or custom cron). Trigger runs automatically and receive instant notifications on anomalies.',
  },
  {
    icon: '📜',
    title: 'Complete Execution History & Audit Log',
    desc: 'Access immutable execution histories for every UI, API, and load test run. Inspect step-level logs, status timelines, response latencies, and payload snapshots from any previous build.',
  },
  {
    icon: '📊',
    title: 'Performance Drift & Historical Compare',
    desc: 'Compare test executions side-by-side across builds and environments. Track throughput, response time drift, and p95/p99 latency degradation before changes reach production.',
  },
  {
    icon: '🏢',
    title: 'Multi-Tenant Workspace Isolation',
    desc: 'Ensure total enterprise data security. Every workspace maintains its own independent test suites, execution histories, environments, and team member permissions.',
  },
  {
    icon: '📡',
    title: 'Real-Time Live Event Streaming',
    desc: 'Watch test suites run live step-by-step. Receive real-time log broadcasts, live status updates, and automatic screenshot snapshots the instant a test fails.',
  },
  {
    icon: '⚡',
    title: 'High-Concurrency Queue Engine',
    desc: 'Smart job orchestration prevents suite collisions, queues heavy regression batches, and executes parallel tests with guaranteed slot allocation.',
  },
];

function FeatureCard({ feature, index }) {
  const [ref, visible] = useReveal();

  return (
    <div
      ref={ref}
      className={`feature-card reveal ${visible ? 'visible' : ''} stagger-${index + 1}`}
    >
      <span className="feature-icon">{feature.icon}</span>
      <h3 className="feature-title">{feature.title}</h3>
      <p className="feature-desc">{feature.desc}</p>
    </div>
  );
}

export default function Features() {
  const [headerRef, headerVisible] = useReveal();

  return (
    <section className="section features-section" id="features">
      <div className="container">
        <div
          ref={headerRef}
          className={`text-center reveal ${headerVisible ? 'visible' : ''}`}
        >
          <div className="section-badge">⚙️ Enterprise Platform</div>
          <h2 className="section-title">Engineered for High-Velocity Teams</h2>
          <p className="section-subtitle mx-auto">
            From automated job scheduling and deep historical execution audits to 
            real-time execution streaming, Testrix powers mission-critical quality engineering.
          </p>
        </div>

        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} feature={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
