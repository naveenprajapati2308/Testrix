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
  HardDrive
} from 'lucide-react';

export function WorkspaceSettingsView({ onNotify, isProjectAdmin }) {
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
    <div className="set-page">
      {/* ── Settings Top Header ────────────────────────────────────────────── */}
      <div className="set-header">
        <div className="set-header-left">
          <h1>
            <Briefcase size={24} color="#3b82f6" />
            Workspace Settings
          </h1>
          <p>
            Configure your workspace environment parameters, server paths, and execution infrastructure.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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

        <div className="set-ws-card">
          <div className="set-ws-card-head">
            <h3>
              <Server size={16} color="#10b981" />
              Execution Infrastructure
            </h3>
          </div>

          <div className="set-ws-grid">
            <div className="set-ws-item">
              <span className="set-ws-label">Execution Manager</span>
              <span className="set-ws-val" style={{ color: '#10b981' }}>Active (Port 8090)</span>
            </div>
            <div className="set-ws-item">
              <span className="set-ws-label">Framework Runner</span>
              <span className="set-ws-val" style={{ color: '#10b981' }}>Active (Port 9090)</span>
            </div>
            <div className="set-ws-item">
              <span className="set-ws-label">Artifacts Storage</span>
              <span className="set-ws-val">Local File Storage (/app/artifacts)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
