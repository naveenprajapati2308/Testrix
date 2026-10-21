import { Save, ToggleLeft, ToggleRight, Cpu, Layers, ArrowRight, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, auth } from '../../api.js';
import { Field } from '../shared/Field.jsx';
import { Panel } from '../shared/index.jsx';
import { Loader } from '../../../../../shared/ui/Loader.jsx';
import { notify } from '../../../../../shared/ui/NotificationProvider.jsx';

export const MODULE_LABELS = {
  API_TESTING: 'API Testing',
  AUTOMATION_SELENIUM: 'Automation (Selenium / Java)',
  AUTOMATION_PLAYWRIGHT: 'Automation (Playwright / TypeScript)',
  PERFORMANCE_TESTING: 'Performance Testing',
  TESTCASE_GENERATOR: 'Test Case Generation',
  GENAI: 'AI Assistant / GenAI'
};

// ── Workspace Settings — Project profile fields, tech stack, and module active/inactive toggles.
// Manages which Testrix products this workspace has access to and displays in the sidebar.
// Automation framework engines, source connections, and scaling are centralized in Automation Settings.
export function WorkspaceSettings({ setNotice }) {
  const session = auth.get();
  const project = session?.project;
  const isSuperAdmin = session?.user?.role === 'SUPER_ADMIN';

  const [settings, setSettings] = useState(null);
  const [profileForm, setProfileForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!project?.id) return;
    setLoading(true);
    api.workspaceSettings(project.id)
      .then((s) => {
        setSettings(s);
        setProfileForm(s);
      })
      .catch((e) => notify.error(e.message || 'Failed to load workspace settings.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (project?.id) load();
  }, [project?.id]);

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!project?.id) return;
    setSaving(true);
    try {
      const updated = await api.updateWorkspaceProfile(project.id, {
        description: profileForm.description,
        backendTech: profileForm.backendTech,
        frontendTech: profileForm.frontendTech,
        databaseTech: profileForm.databaseTech,
        cicdTool: profileForm.cicdTool
      });
      setSettings(updated);
      notify.success('Workspace profile and technology stack updated successfully.');
    } catch (err) {
      notify.error(err.message || 'Failed to update workspace profile.');
    } finally {
      setSaving(false);
    }
  };

  const toggleModule = async (moduleType, enabled) => {
    if (!project?.id) return;
    if (!enabled && !settings.modules.some((m) => m.moduleType !== moduleType && m.enabled)) {
      notify.warning('At least one product must stay enabled for this workspace.');
      return;
    }
    try {
      const updated = await api.toggleWorkspaceModule(project.id, moduleType, enabled);
      setSettings(updated);
      notify.success(`${MODULE_LABELS[moduleType] || moduleType} ${enabled ? 'enabled' : 'disabled'} for this workspace.`);
    } catch (err) {
      notify.error(err.message || 'Failed to toggle product status.');
    }
  };

  if (!project) {
    return (
      <section className="page-grid" style={{ gridTemplateColumns: '1fr' }}>
        <Panel title="Workspace Settings">
          <p>No workspace context found. Please select a workspace to configure settings.</p>
        </Panel>
      </section>
    );
  }

  if (loading || !settings || !profileForm) {
    return (
      <section className="page-grid" style={{ gridTemplateColumns: '1fr' }}>
        <Panel title="Workspace Settings">
          <Loader size={24} label="Loading workspace profile and modules…" />
        </Panel>
      </section>
    );
  }

  return (
    <section className="page-grid" style={{ gridTemplateColumns: '1fr' }}>
      {/* ── Panel 1: Profile & Technology Stack ──────────────────────────── */}
      <Panel title={`Workspace Settings — ${settings.name}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: -4, marginBottom: 12 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>
            Project Code: <strong>{settings.projectCode}</strong> · Workspace Code: <strong>{settings.workspaceCode}</strong>
          </p>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: isSuperAdmin ? '#10b981' : '#3b82f6', fontWeight: 600 }}>
            <ShieldCheck size={14} /> {isSuperAdmin ? 'Super Administrator Access' : 'Project Administrator Access'}
          </span>
        </div>

        <form onSubmit={saveProfile} className="auth-form" style={{ maxWidth: 640 }}>
          <Field
            label="Project Description"
            value={profileForm.description ?? ''}
            onChange={(v) => setProfileForm((c) => ({ ...c, description: v }))}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field
              label="Backend Technology"
              placeholder="e.g. Java / Spring Boot, Node.js, Python"
              value={profileForm.backendTech ?? ''}
              onChange={(v) => setProfileForm((c) => ({ ...c, backendTech: v }))}
            />
            <Field
              label="Frontend Technology"
              placeholder="e.g. React, Next.js, Angular"
              value={profileForm.frontendTech ?? ''}
              onChange={(v) => setProfileForm((c) => ({ ...c, frontendTech: v }))}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field
              label="Database Technology"
              placeholder="e.g. MySQL 8, PostgreSQL, MongoDB"
              value={profileForm.databaseTech ?? ''}
              onChange={(v) => setProfileForm((c) => ({ ...c, databaseTech: v }))}
            />
            <Field
              label="CI/CD Pipeline Tool"
              placeholder="e.g. GitHub Actions, GitLab CI, Jenkins"
              value={profileForm.cicdTool ?? ''}
              onChange={(v) => setProfileForm((c) => ({ ...c, cicdTool: v }))}
            />
          </div>
          <div className="modal-form-actions" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
            <button className="primary-action modal-submit-btn" type="submit" disabled={saving}>
              <Save size={15} /> {saving ? 'Saving Profile…' : 'Save Profile & Tech Stack'}
            </button>
          </div>
        </form>
      </Panel>

      {/* ── Panel 2: Enabled Products & Sidebar Visibility ──────────────── */}
      <Panel title="Enabled Products &amp; Sidebar Navigation Visibility">
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: -4 }}>
          Control which Testrix products and modules are active for this workspace. Inactive modules will be hidden from the sidebar navigation.
        </p>
        <div className="ws-module-checks" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginTop: 12 }}>
          {settings.modules.map((m) => (
            <label
              key={m.moduleType}
              className="check-row"
              style={{
                cursor: 'pointer',
                background: 'var(--bg-surface, rgba(255,255,255,0.03))',
                border: '1px solid var(--border-color, #1c2b40)',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                userSelect: 'none'
              }}
              onClick={(e) => {
                e.preventDefault();
                toggleModule(m.moduleType, !m.enabled);
              }}
            >
              {m.enabled ? (
                <ToggleRight size={22} color="var(--accent, #3b82f6)" />
              ) : (
                <ToggleLeft size={22} color="var(--text-muted, #64748b)" />
              )}
              <span style={{ fontSize: 13, fontWeight: m.enabled ? 600 : 400, color: m.enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {MODULE_LABELS[m.moduleType] || m.moduleType}
              </span>
            </label>
          ))}
        </div>
      </Panel>

      {/* ── Panel 3: Centralized Automation Control Center Banner ───────── */}
      <Panel title="Automation &amp; Framework Orchestration">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '14px 18px',
            background: 'rgba(59, 130, 246, 0.05)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: 10,
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 260 }}>
            <Cpu size={24} color="#3b82f6" style={{ flexShrink: 0 }} />
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14 }}>Looking for Test Engine Sources, Git Remote &amp; Runner Scaling?</h4>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                Framework engine configurations, upgrade to Git/Live options, and Docker multi-runner scaling have moved to the dedicated <strong>Automation Settings</strong> control center.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="primary-action"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', fontSize: 13 }}
            onClick={() => {
              window.location.hash = '#/settings/automation-settings';
              window.location.reload();
            }}
          >
            Open Automation Settings <ArrowRight size={14} />
          </button>
        </div>
      </Panel>
    </section>
  );
}
