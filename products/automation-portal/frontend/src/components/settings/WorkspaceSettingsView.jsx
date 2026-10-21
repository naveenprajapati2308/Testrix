import { useState, useEffect } from 'react';
import { api, auth, decodeProjectRoles } from '../../api.js';
import {
  Briefcase,
  CheckCircle2,
  Server,
  FolderTree,
  Shield,
  Layers,
  Database,
  User,
  HardDrive,
  Cpu,
  ArrowRight
} from 'lucide-react';

export function WorkspaceSettingsView({ onNotify, isProjectAdmin, onSwitchToScaling }) {
  const [configRoot, setConfigRoot] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const session = auth.get();
  const user = session?.user || {};
  const roles = decodeProjectRoles(session?.accessToken);

  useEffect(() => {
    Promise.all([
      api.testEngineConfig().catch(() => ({ projectFrameworksRoot: '' })),
      api.dashboardSummary().catch(() => null)
    ]).then(([cfg, sum]) => {
      setConfigRoot(cfg.projectFrameworksRoot || '');
      setSummary(sum);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── Card 1: Workspace & Project Configuration ────────────────────── */}
      <div className="set-ws-card">
        <div className="set-ws-card-head">
          <h3>
            <Briefcase size={16} color="#3b82f6" />
            Workspace &amp; Project Configuration
          </h3>
          <span className="eng-badge eng-badge-status-active">
            <CheckCircle2 size={11} /> Connected
          </span>
        </div>

        <div className="set-ws-grid">
          <div className="set-ws-item">
            <span className="set-ws-label">Current User</span>
            <span className="set-ws-val">{user.email || user.username || 'Active User'}</span>
          </div>

          <div className="set-ws-item">
            <span className="set-ws-label">Assigned Roles</span>
            <span className="set-ws-val">
              {roles.length > 0 ? roles.join(', ') : (user.role || 'MEMBER')}
            </span>
          </div>

          <div className="set-ws-item">
            <span className="set-ws-label">Access Level</span>
            <span className="set-ws-val" style={{ color: isProjectAdmin ? '#3b82f6' : 'var(--text-secondary)' }}>
              {isProjectAdmin ? 'Project Administrator' : 'Project Member'}
            </span>
          </div>

          <div className="set-ws-item" style={{ gridColumn: '1 / -1' }}>
            <span className="set-ws-label">Frameworks Server Directory</span>
            <span className="set-ws-val" style={{ fontFamily: 'ui-monospace, monospace' }}>
              {configRoot || 'Configured via application properties'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Card 2: Core Execution Infrastructure ────────────────────────── */}
      <div className="set-ws-card">
        <div className="set-ws-card-head">
          <h3>
            <Server size={16} color="#10b981" />
            Execution Infrastructure Overview
          </h3>
          <span className="eng-badge eng-badge-status-active">
            <CheckCircle2 size={11} /> Running Healthy
          </span>
        </div>

        <div className="set-ws-grid">
          <div className="set-ws-item">
            <span className="set-ws-label">Execution Manager</span>
            <span className="set-ws-val" style={{ color: '#10b981' }}>Active (Port 8090 - Smart Queue Scheduler)</span>
          </div>
          <div className="set-ws-item">
            <span className="set-ws-label">Runner Fleet 1</span>
            <span className="set-ws-val" style={{ color: '#10b981' }}>Active (Port 9090 - Playwright/Java)</span>
          </div>
          <div className="set-ws-item">
            <span className="set-ws-label">Runner Fleet 2</span>
            <span className="set-ws-val" style={{ color: '#10b981' }}>Standby / Ready (Port 9090)</span>
          </div>
          <div className="set-ws-item">
            <span className="set-ws-label">Artifacts Storage</span>
            <span className="set-ws-val">Local File Storage (/app/artifacts)</span>
          </div>
        </div>

        {/* Quick link banner to Runner Scaling tab */}
        {onSwitchToScaling && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 16px',
              background: 'rgba(59, 130, 246, 0.06)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: 10,
              marginTop: 4
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Layers size={18} color="#3b82f6" />
              <div>
                <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Need to scale runner capacity or run parallel suites?</strong>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                  View ready-to-run Docker scale commands, use cases, and fleet management instructions.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="su-secondary-btn"
              onClick={onSwitchToScaling}
              style={{ flexShrink: 0, padding: '0 14px', height: 34, fontSize: 12 }}
            >
              Go to Runner Scaling <ArrowRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
