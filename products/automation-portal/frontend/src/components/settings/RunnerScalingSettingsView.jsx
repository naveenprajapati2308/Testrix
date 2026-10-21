import { useState } from 'react';
import {
  Cpu,
  Layers,
  PlusCircle,
  StopCircle,
  Trash2,
  Activity,
  Terminal,
  Copy,
  Check,
  HelpCircle,
  Server,
  Zap,
  ShieldCheck,
  FileText
} from 'lucide-react';

export function RunnerScalingSettingsView({ onNotify, isProjectAdmin, isSuperAdmin }) {
  const [copiedKey, setCopiedKey] = useState(null);

  const copyCommand = (cmdText, key) => {
    navigator.clipboard.writeText(cmdText);
    setCopiedKey(key);
    onNotify?.(`Copied to clipboard: ${cmdText}`, 'success');
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const hasAccess = isProjectAdmin || isSuperAdmin;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── Fleet Status Overview ────────────────────────────────────────── */}
      <div className="set-ws-card">
        <div className="set-ws-card-head">
          <div>
            <h3 style={{ margin: 0 }}>
              <Server size={16} color="#10b981" />
              Active Fleet &amp; Orchestration Topology
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span className="eng-badge eng-badge-status-active">
                <ShieldCheck size={11} color="#10b981" /> Authorized: Project Admin &amp; Super Admin
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Both Project Managers / Admins and Super Admins have permission to manage and scale runner instances.
              </span>
            </div>
          </div>
          <span className="eng-badge eng-badge-status-active">
            <Activity size={11} /> Healthy &amp; Ready
          </span>
        </div>

        <div className="set-ws-grid">
          <div className="set-ws-item">
            <span className="set-ws-label">Execution Manager</span>
            <span className="set-ws-val" style={{ color: '#10b981' }}>Port 8090 (Queue Scheduler)</span>
          </div>
          <div className="set-ws-item">
            <span className="set-ws-label">Runner 1 (Base Instance)</span>
            <span className="set-ws-val" style={{ color: '#10b981' }}>Port 9090 (Chrome + Playwright)</span>
          </div>
          <div className="set-ws-item">
            <span className="set-ws-label">Runner 2 (Pre-Configured Fleet)</span>
            <span className="set-ws-val" style={{ color: '#3b82f6' }}>Port 9090 (Parallel Runner Slot)</span>
          </div>
          <div className="set-ws-item">
            <span className="set-ws-label">Max Cross-Project Concurrency</span>
            <span className="set-ws-val">2 Parallel Suites (Expandable)</span>
          </div>
        </div>
      </div>

      {/* ── Main Scaling Card ────────────────────────────────────────────── */}
      <div className="set-scale-card">
        <div className="set-ws-card-head">
          <h3>
            <Cpu size={16} color="#3b82f6" />
            Framework Runner Scaling &amp; Multi-Instance Fleet Management
          </h3>
          <span className="eng-badge eng-badge-status-active">
            <Layers size={11} /> Docker Multi-Runner Fleet
          </span>
        </div>

        {/* ── When to Run Callout ─────────────────────────────────────────── */}
        <div className="set-scale-callout">
          <div className="set-scale-callout-title">
            <HelpCircle size={15} />
            <span>When &amp; In what case to run these scaling commands (Kis Case me Run Karein):</span>
          </div>
          <ul className="set-scale-callout-list">
            <li>
              <strong>1. Parallel Execution Across Projects:</strong> Jab 2 ya zyada projects ek hi waqt me test suites trigger karein, tab Runner 2 ya naye runners start karne se koi bhi suite queue me wait nahi karegi aur parallel execution hogi.
            </li>
            <li>
              <strong>2. Long-Running Regression Suites:</strong> Agar ek heavy suite (100+ tests) ghanton chalne wali hai, toh extra runner instance start karke small sanity ya smoke test suites ko bina delay parallel run kar sakte hain.
            </li>
            <li>
              <strong>3. Host Resource &amp; Memory Isolation:</strong> Real Chrome aur Playwright browser processes ko alag-alag Docker containers me distribute karke system crash ya memory exhaustion se bachane ke liye.
            </li>
          </ul>
        </div>

        {/* ── Commands Grid ──────────────────────────────────────────────── */}
        <div className="set-scale-grid">
          {/* Box 1: Start Runner 2 */}
          <div className="set-scale-box">
            <div className="set-scale-box-head">
              <div className="set-scale-box-title">
                <PlusCircle size={14} color="#10b981" />
                <span>Start Pre-Configured Runner 2</span>
              </div>
              <span className="set-scale-badge set-scale-badge-up">+1 Instance</span>
            </div>
            <p className="set-scale-desc">
              Boots up the pre-registered runner-2 container. Execution Manager automatically detects it and starts dispatching parallel jobs.
            </p>
            <div className="set-scale-cmd-row">
              <code className="set-scale-cmd-text">docker compose up -d automation-framework-runner-2</code>
              <button
                type="button"
                className="set-scale-copy-btn"
                onClick={() => copyCommand('docker compose up -d automation-framework-runner-2', 'start-r2')}
                title="Copy command"
              >
                {copiedKey === 'start-r2' ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          {/* Box 2: Scale Dynamic Workers */}
          <div className="set-scale-box">
            <div className="set-scale-box-head">
              <div className="set-scale-box-title">
                <Layers size={14} color="#3b82f6" />
                <span>Scale Dynamic Workers (e.g. 3 Runners)</span>
              </div>
              <span className="set-scale-badge set-scale-badge-info">Dynamic Scale</span>
            </div>
            <p className="set-scale-desc">
              Spawns multiple worker containers in one command. Ideal for scaling worker fleets during peak CI/CD test load.
            </p>
            <div className="set-scale-cmd-row">
              <code className="set-scale-cmd-text">docker compose up -d --scale automation-framework-runner-1=3</code>
              <button
                type="button"
                className="set-scale-copy-btn"
                onClick={() => copyCommand('docker compose up -d --scale automation-framework-runner-1=3', 'scale-r1')}
                title="Copy command"
              >
                {copiedKey === 'scale-r1' ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          {/* Box 3: Stop & Remove Runner */}
          <div className="set-scale-box">
            <div className="set-scale-box-head">
              <div className="set-scale-box-title">
                <Trash2 size={14} color="#ef4444" />
                <span>Stop &amp; Remove Runner (Free RAM/CPU)</span>
              </div>
              <span className="set-scale-badge set-scale-badge-down">Scale Down / Clean</span>
            </div>
            <p className="set-scale-desc">
              Safely terminates and deletes the extra runner instance to immediately free up host machine RAM and CPU cores after testing finishes.
            </p>
            <div className="set-scale-cmd-row">
              <code className="set-scale-cmd-text">docker compose stop automation-framework-runner-2 &amp;&amp; docker compose rm -f automation-framework-runner-2</code>
              <button
                type="button"
                className="set-scale-copy-btn"
                onClick={() => copyCommand('docker compose stop automation-framework-runner-2 && docker compose rm -f automation-framework-runner-2', 'rm-r2')}
                title="Copy command"
              >
                {copiedKey === 'rm-r2' ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          {/* Box 4: Reset Scale to 1 */}
          <div className="set-scale-box">
            <div className="set-scale-box-head">
              <div className="set-scale-box-title">
                <StopCircle size={14} color="#f59e0b" />
                <span>Scale Pool Back to 1 Runner</span>
              </div>
              <span className="set-scale-badge set-scale-badge-info">Reset Pool</span>
            </div>
            <p className="set-scale-desc">
              Scales dynamic worker containers back down to a single base runner when peak testing is complete.
            </p>
            <div className="set-scale-cmd-row">
              <code className="set-scale-cmd-text">docker compose up -d --scale automation-framework-runner-1=1</code>
              <button
                type="button"
                className="set-scale-copy-btn"
                onClick={() => copyCommand('docker compose up -d --scale automation-framework-runner-1=1', 'scale-one')}
                title="Copy command"
              >
                {copiedKey === 'scale-one' ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          {/* Box 5: Inspect Health */}
          <div className="set-scale-box">
            <div className="set-scale-box-head">
              <div className="set-scale-box-title">
                <Activity size={14} color="#10b981" />
                <span>Inspect Running Fleet Health</span>
              </div>
              <span className="set-scale-badge set-scale-badge-up">Health Check</span>
            </div>
            <p className="set-scale-desc">
              Check whether runner instances are currently active and healthy on the host machine.
            </p>
            <div className="set-scale-cmd-row">
              <code className="set-scale-cmd-text">docker compose ps automation-framework-runner-1 automation-framework-runner-2</code>
              <button
                type="button"
                className="set-scale-copy-btn"
                onClick={() => copyCommand('docker compose ps automation-framework-runner-1 automation-framework-runner-2', 'status-check')}
                title="Copy command"
              >
                {copiedKey === 'status-check' ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          {/* Box 6: Live Log Stream */}
          <div className="set-scale-box">
            <div className="set-scale-box-head">
              <div className="set-scale-box-title">
                <FileText size={14} color="#a855f7" />
                <span>Tail Realtime Runner Logs</span>
              </div>
              <span className="set-scale-badge set-scale-badge-info">Logs</span>
            </div>
            <p className="set-scale-desc">
              Stream live terminal output from runner 1 to monitor ongoing test suites.
            </p>
            <div className="set-scale-cmd-row">
              <code className="set-scale-cmd-text">docker compose logs -f --tail=50 automation-framework-runner-1</code>
              <button
                type="button"
                className="set-scale-copy-btn"
                onClick={() => copyCommand('docker compose logs -f --tail=50 automation-framework-runner-1', 'logs-tail')}
                title="Copy command"
              >
                {copiedKey === 'logs-tail' ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
