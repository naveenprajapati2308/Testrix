import { FolderKanban, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { Panel, DataTable } from '../shared/index.jsx';
import { notify, confirmDialog } from '../../../../../shared/ui/NotificationProvider.jsx';

const MODULE_LABELS = {
  AUTOMATION_SELENIUM: 'Automation (Selenium)',
  AUTOMATION_PLAYWRIGHT: 'Automation (Playwright)',
  API_TESTING: 'API Testing',
  PERFORMANCE_TESTING: 'Performance Testing',
  TESTCASE_GENERATOR: 'Test Case Generation',
  GENAI: 'GenAI Engine'
};

// ── Super Admin: platform-wide view of every provisioned Project (= Workspace). ────────────────
export function ProjectManagement({ setNotice }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    return api.adminListProjects()
      .then(setProjects)
      .catch((e) => notify.error(e.message || 'Failed to load projects.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleDelete = (p) => {
    confirmDialog({
      title: 'Delete Workspace?',
      message: `Permanently delete "${p.name}" (${p.projectCode})? Workspace can only be deleted if it has no active modules or data.`,
      confirmText: 'Delete Workspace',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          const result = await api.adminDeleteProject(p.id);
          notify.success(result.message || `Workspace "${p.name}" deleted.`);
          load();
        } catch (e) {
          notify.error(e.message || 'Failed to delete workspace.');
        }
      }
    });
  };

  const suspend = (p) => {
    confirmDialog({
      title: 'Suspend Workspace?',
      message: `Suspend workspace "${p.name}"? Users of this workspace will not be able to log in until activated.`,
      confirmText: 'Suspend Workspace',
      confirmVariant: 'warning',
      onConfirm: async () => {
        try {
          await api.adminSuspendProject(p.id);
          notify.success(`Workspace "${p.name}" suspended.`);
          load();
        } catch (e) {
          notify.error(e.message || 'Failed to suspend workspace.');
        }
      }
    });
  };

  const activate = async (p) => {
    try {
      await api.adminActivateProject(p.id);
      notify.success(`Workspace "${p.name}" activated.`);
      load();
    } catch (e) {
      notify.error(e.message || 'Failed to activate workspace.');
    }
  };

  const columns = useMemo(() => [
    { key: 'name', label: 'Project / Workspace', render: (v, p) => (<div><strong>{v}</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.projectCode} · {p.workspaceCode}</div></div>) },
    { key: 'tenantName', label: 'Tenant' },
    { key: 'enabledModules', label: 'Modules', render: (v) => (v || []).map((m) => MODULE_LABELS[m] || m).join(', ') || '—' },
    { key: 'memberCount', label: 'Members' },
    { key: 'status', label: 'Status', render: (v) => <span className={`status ${v?.toLowerCase()}`}>{v}</span> },
    { key: 'createdAt', label: 'Created', render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, p) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {p.status === 'SUSPENDED' ? (
            <button className="action-btn enable-btn" onClick={() => activate(p)} title="Activate workspace" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <PlayCircle size={12} /> Activate
            </button>
          ) : (
            <button className="action-btn disable-btn" onClick={() => suspend(p)} title="Suspend workspace" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <PauseCircle size={12} /> Suspend
            </button>
          )}
          <button className="action-btn delete-btn" onClick={() => handleDelete(p)} title="Delete workspace" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )
    }
  ], []);

  return (
    <section className="page-grid" style={{ gridTemplateColumns: '1fr' }}>
      <Panel title="Project / Workspace Management">
        <div className="um-toolbar">
          <span className="um-count"><FolderKanban size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
        </div>
        <DataTable columns={columns} data={projects} loading={loading} searchPlaceholder="Filter projects..." exportFilename="projects_list.csv" />
      </Panel>
    </section>
  );
}
