import { useState, useEffect } from 'react';
import { api, auth, decodeProjectRoles } from '../../api.js';
import { EngineManagementView } from '../engines/EngineManagementView.jsx';
import { WorkspaceSettingsView } from './WorkspaceSettingsView.jsx';
import { RunnerScalingSettingsView } from './RunnerScalingSettingsView.jsx';
import {
  Settings2,
  Briefcase,
  Cpu,
  Layers
} from 'lucide-react';

export function SettingsView({ initialTab = 'workspace', onNotify, isProjectAdmin, isSuperAdmin, onNavigateToSetup }) {
  const [activeTab, setActiveTab] = useState(initialTab); // 'workspace' | 'engines' | 'scaling'

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  return (
    <div className="set-page">
      {/* ── Settings Top Header ────────────────────────────────────────────── */}
      <div className="set-header">
        <div className="set-header-left">
          <h1>
            <Settings2 size={24} color="#3b82f6" />
            Automation Settings
          </h1>
          <p>
            Configure your workspace environment parameters, automation frameworks, scaling, and test engine execution modes.
          </p>
        </div>

        {/* ── Sub-navigation Tabs: Workspace vs Engines vs Runner Scaling ──── */}
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
          <button
            type="button"
            className={`set-tab-btn ${activeTab === 'scaling' ? 'active' : ''}`}
            onClick={() => setActiveTab('scaling')}
          >
            <Layers size={15} />
            Runner Scaling &amp; Fleet
          </button>
        </div>
      </div>

      {/* ── Tab Content ────────────────────────────────────────────────────── */}
      <div key={activeTab} className="tab-fade-enter">
        {activeTab === 'workspace' && (
          <WorkspaceSettingsView
            onNotify={onNotify}
            isProjectAdmin={isProjectAdmin}
            isSuperAdmin={isSuperAdmin}
            onSwitchToScaling={() => setActiveTab('scaling')}
          />
        )}

        {activeTab === 'engines' && (
          <EngineManagementView
            onNotify={onNotify}
            isProjectAdmin={isProjectAdmin}
            isSuperAdmin={isSuperAdmin}
            onNavigateToSetup={onNavigateToSetup}
          />
        )}

        {activeTab === 'scaling' && (
          <RunnerScalingSettingsView
            onNotify={onNotify}
            isProjectAdmin={isProjectAdmin}
            isSuperAdmin={isSuperAdmin}
          />
        )}
      </div>
    </div>
  );
}
