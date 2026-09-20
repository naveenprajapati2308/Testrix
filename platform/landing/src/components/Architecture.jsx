import { useReveal } from '../hooks';

/* ═══════════════════════════════════════════════════════════════════════
   ARCHITECTURE — Platform Integration & Orchestration Flow
   Featuring Scheduling, Live Event Streaming & Historical Tracking
   ═══════════════════════════════════════════════════════════════════════ */

const ARCH_NODES = [
  { label: 'UI Automation', color: '#6366f1', top: '8%',  left: '50%', transform: 'translateX(-50%)' },
  { label: 'API Testing', color: '#06b6d4', top: '50%', right: '2%', transform: 'translateY(-50%)' },
  { label: 'Performance', color: '#10b981', bottom: '8%', left: '50%', transform: 'translateX(-50%)' },
  { label: 'AI Copilot', color: '#a855f7', top: '50%', left: '2%', transform: 'translateY(-50%)' },
];

const ARCH_INFO = [
  {
    icon: '🎛️',
    title: 'Centralized Control Plane',
    desc: 'One intuitive management portal orchestrates all test suites, projects, and target environments with unified workspace management and credentials.',
  },
  {
    icon: '⏱️',
    title: 'Automated Scheduling & Queuing',
    desc: 'Dedicated scheduler runs recurring API monitor jobs and off-peak load test suites with intelligent concurrency slots to eliminate test run starvation.',
  },
  {
    icon: '📜',
    title: 'Live Event Stream & History Store',
    desc: 'Test execution lifecycles stream in real time and archive into an immutable history store. Compare previous runs, latency drifts, and artifact snapshots.',
  },
  {
    icon: '🧠',
    title: '360° Quality Intelligence',
    desc: 'Cross-product analytics correlate UI automation failures with API response anomalies and performance drifts, giving teams a single unified quality score.',
  },
];

export default function Architecture() {
  const [headerRef, headerVisible] = useReveal();
  const [visualRef, visualVisible] = useReveal(0.1);
  const [infoRef, infoVisible] = useReveal();

  return (
    <section className="section arch-section" id="architecture">
      <div className="container">
        <div
          ref={headerRef}
          className={`text-center reveal ${headerVisible ? 'visible' : ''}`}
        >
          <div className="section-badge">🏗️ Platform Flow</div>
          <h2 className="section-title">The Unified QA Ecosystem</h2>
          <p className="section-subtitle mx-auto">
            A resilient, decoupled control-plane architecture where recurring schedules, 
            live streams, and historical analytics collaborate seamlessly under one boundary.
          </p>
        </div>

        <div className="arch-container">
          {/* Orbital Visual */}
          <div
            ref={visualRef}
            className={`arch-visual reveal-left ${visualVisible ? 'visible' : ''}`}
          >
            <div className="arch-ring arch-ring-1" />
            <div className="arch-ring arch-ring-2" />
            <div className="arch-ring arch-ring-3" />

            {/* 4 Solid Connector Lines touching center circle boundary */}
            <div className="arch-line arch-line-top" />
            <div className="arch-line arch-line-right" />
            <div className="arch-line arch-line-bottom" />
            <div className="arch-line arch-line-left" />

            <div className="arch-center">
              Testrix<br />Command<br />Center
            </div>

            {ARCH_NODES.map((node) => (
              <div
                key={node.label}
                className="arch-node"
                style={{
                  top: node.top,
                  left: node.left,
                  right: node.right,
                  bottom: node.bottom,
                  transform: node.transform,
                }}
              >
                <span
                  className="arch-node-dot"
                  style={{ background: node.color }}
                />
                {node.label}
              </div>
            ))}
          </div>

          {/* Info */}
          <div
            ref={infoRef}
            className={`arch-info reveal-right ${infoVisible ? 'visible' : ''}`}
          >
            <h3>Unified Architecture in Action</h3>
            <ul className="arch-info-list">
              {ARCH_INFO.map((item) => (
                <li key={item.title} className="arch-info-item">
                  <span className="arch-info-icon">{item.icon}</span>
                  <div className="arch-info-text">
                    <h4>{item.title}</h4>
                    <p>{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
