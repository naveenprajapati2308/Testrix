import { useState, useEffect } from 'react';
import { api, auth, decodeProjectRoles } from '../../api.js';
import { EngineManagementView } from '../engines/EngineManagementView.jsx';
import {
  Settings2,
  Briefcase,
  Cpu,
  FolderTree,
  Shield,
  Layers,
  Database,
  ExternalLink,
  CheckCircle2,
  Clock,
  Server
} from 'lucide-react';

export function SettingsView({ onNotify, isProjectAdmin, onNavigateToSetup }) {
  const [activeTab, setActiveTab] = useState('engines'); // 'workspace' | 'engines'
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
            <Settings2 size={24} color="#3b82f6" />
            Settings
          </h1>
          <p>
            Configure your workspace environment parameters, automation frameworks, and test engine execution modes.
          </p>
        </div>

        {/* ── Sub-navigation Tabs: Workspace Settings vs Engine Settings ──── */}
        <div className="set-tabs-bar">
          <button
            type="button"
            className={`set-tab-btn ${activeTab === 'workspace' ? 'active' : ''}`}
            onClick={() => setActiveTab('workspace')}
          >
            <Briefcase size={15} />
            Workspace Settings
          </button>
          <button
            type="button"
            className={`set-tab-btn ${activeTab === 'engines' ? 'active' : ''}`}
            onClick={() => setActiveTab('engines')}
          >
            <Cpu size={15} />
            Engine Settings
          </button>
        </div>
      </div>

      {/* ── Tab Content ────────────────────────────────────────────────────── */}
      {activeTab === 'workspace' && (
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
                <span className="set-ws-val">Local File Storage</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'engines' && (
        <EngineManagementView
          onNotify={onNotify}
          isProjectAdmin={isProjectAdmin}
          onNavigateToSetup={onNavigateToSetup}
        />
      )}
    </div>
  );
}
