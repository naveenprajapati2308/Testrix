import { FolderKanban, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { Panel, DataTable, ConfirmDialog } from '../shared/index.jsx';

const MODULE_LABELS = {
  AUTOMATION_SELENIUM: 'Automation (Selenium)',
  AUTOMATION_PLAYWRIGHT: 'Automation (Playwright)',
  API_TESTING: 'API Testing',
  PERFORMANCE_TESTING: 'Performance Testing'
};

// ── Super Admin: platform-wide view of every provisioned Project (= Workspace). ────────────────
export function ProjectManagement({ setNotice }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = () => {
    setLoading(true);
    return api.adminListProjects().then(setProjects).catch((e) => setNotice(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const result = await api.adminDeleteProject(deleteTarget.id);
      setNotice(result.message || `Workspace "${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      load();
    } catch (e) {
      setNotice(e.message);
      setDeleteTarget(null);
    }
  };

  const suspend = async (p) => {
    try {
      await api.adminSuspendProject(p.id);
      setNotice(`Workspace "${p.name}" suspended — its users can no longer log in.`);
      load();
    } catch (e) {
      setNotice(e.message);
    }
  };

  const activate = async (p) => {
    try {
      await api.adminActivateProject(p.id);
      setNotice(`Workspace "${p.name}" activated.`);
      load();
    } catch (e) {
      setNotice(e.message);
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
          <button className="action-btn delete-btn" onClick={() => setDeleteTarget(p)} title="Delete workspace" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
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

      {deleteTarget && (
        <ConfirmDialog onClose={() => setDeleteTarget(null)}>
          <div className="confirm-icon" style={{ color: '#dc2626' }}><Trash2 size={30} /></div>
          <h3>Delete Workspace?</h3>
          <p>Permanently delete <strong>{deleteTarget.name}</strong> ({deleteTarget.projectCode})?</p>
          <p className="confirm-warning">Only succeeds if the workspace has no modules, environments, executions, collections, or performance data — otherwise it's rejected so real data is never silently lost.</p>
          <div className="confirm-actions">
            <button className="secondary-action" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="danger-action" onClick={handleDelete}>Delete</button>
          </div>
        </ConfirmDialog>
      )}
    </section>
  );
}
