import { Activity, Building2, ChevronRight, ClipboardList, Eye, Settings, UserCog, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Card } from '../../../../../shared/ui/dashboard/Card.jsx';
import { StatusMixDonut } from '../../../../../shared/ui/dashboard/StatusMixDonut.jsx';
import { Table } from '../../../../../shared/ui/dashboard/Table.jsx';
import { EmptyState } from '../../../../../shared/ui/dashboard/EmptyState.jsx';
import { Loader } from '../../../../../shared/ui/Loader.jsx';
import { HealthDot, OverviewCard } from '../shared/OverviewCard.jsx';

// Real health pings, same gateway routes the Global Dashboard already polls — never a fabricated
// "all systems operational" placeholder. Platform API itself doesn't need its own ping: this page
// only ever renders once /api/admin/users has already answered.
const HEALTH_CHECKS = [
  { key: 'portal', label: 'Platform API', path: null },
  { key: 'automation', label: 'Automation Engine', path: '/health/automation' },
  { key: 'apitest', label: 'API Testing Engine', path: '/health/apitest' },
  { key: 'perf', label: 'Performance Engine', path: '/health/perf' },
  { key: 'genai', label: 'AI Assistant', path: '/health/genai' }
];

const QUICK_ACTIONS = [
  { key: 'workspace-requests', label: 'Review Workspace Requests', icon: ClipboardList, showPending: true },
  { key: 'project-management', label: 'Manage Workspaces', icon: Building2 },
  { key: 'user-management', label: 'Manage Platform Users', icon: Users },
  { key: 'role-management', label: 'Role Management', icon: UserCog },
  { key: 'access-management', label: 'Access Settings', icon: Settings }
];

// ── Admin Dashboard Overview — Super Admin's Platform Dashboard (docs/version2.2.md's "Global
// Dashboard" / "Platform Analytics"): platform-wide counts only, never a specific workspace's
// operational data (executions/reports/etc. stay out of Super Admin's reach entirely). ─────────
export function AdminDashboardOverview({ setNotice, setActive }) {
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [recentRequests, setRecentRequests] = useState([]);
  const [health, setHealth] = useState({});
  const [healthChecked, setHealthChecked] = useState(false);
  const [recentRequestsLoading, setRecentRequestsLoading] = useState(true);

  useEffect(() => {
    api.adminListUsers().then(setUsers).catch((err) => setNotice(err.message));
    api.adminListProjects().then(setProjects).catch((err) => setNotice(err.message));
    api.adminListWorkspaceRequests('PENDING').then(setPendingRequests).catch((err) => setNotice(err.message));
    api.adminListWorkspaceRequests().then((r) => setRecentRequests(r.slice(0, 5))).catch(() => {}).finally(() => setRecentRequestsLoading(false));

    Promise.allSettled(
      HEALTH_CHECKS.filter((h) => h.path).map((h) =>
        fetch(h.path).then((r) => [h.key, r.ok]).catch(() => [h.key, false])
      )
    ).then((results) => {
      const next = { portal: true };
      results.forEach((r) => { if (r.status === 'fulfilled') next[r.value[0]] = r.value[1]; });
      setHealth(next);
      setHealthChecked(true);
    });
  }, []);

  const activeUsers = users.filter((u) => u.status === 'ACTIVE').length;
  const disabledUsers = users.filter((u) => u.status === 'DISABLED').length;
  const activeProjects = projects.filter((p) => p.status === 'ACTIVE').length;
  const suspendedProjects = projects.filter((p) => p.status === 'SUSPENDED').length;
  const archivedProjects = projects.filter((p) => p.status === 'ARCHIVED').length;

  const healthRows = HEALTH_CHECKS.map((h) => ({ ...h, up: health[h.key] }));
  const upCount = healthRows.filter((h) => h.up !== false).length;
  const allHealthy = healthChecked && upCount === healthRows.length;

  return (
    <section className="page-grid" style={{ gridTemplateColumns: '1fr' }}>
      <p className="dash-subtitle">Platform control center for managing workspaces, users, services and global configuration.</p>

      <section className="cards overview-cards">
        <OverviewCard
          icon={Building2}
          tone="accent"
          label="Workspaces"
          kpiValue={projects.length}
          kpiLabel="Total"
          summary={`${activeProjects} Active · ${suspendedProjects} Suspended · ${archivedProjects} Archived`}
          onSeeMore={() => setActive('project-management')}
        />
        <OverviewCard
          icon={ClipboardList}
          tone="warning"
          label="Pending Requests"
          kpiValue={pendingRequests.length}
          kpiLabel="Requests"
          summary="Requires your review"
          onSeeMore={() => setActive('workspace-requests')}
        />
        <OverviewCard
          icon={Users}
          tone="info"
          label="Platform Users"
          kpiValue={users.length}
          kpiLabel="Total"
          summary={`${activeUsers} Active · ${disabledUsers} Disabled`}
          onSeeMore={() => setActive('user-management')}
        />
        <OverviewCard
          icon={Activity}
          tone={!healthChecked ? 'accent' : allHealthy ? 'success' : 'danger'}
          label="System Health"
          kpiValue={!healthChecked ? 'Checking…' : allHealthy ? 'Healthy' : 'Issues Detected'}
          summary={!healthChecked ? 'Pinging services…' : `${upCount}/${healthRows.length} services operational`}
        />
      </section>

      <div className="panel-row-3">
        <StatusMixDonut
          title="Workspace Overview"
          segments={[
            { key: 'active', label: 'Active', value: activeProjects, color: '--success-text' },
            { key: 'suspended', label: 'Suspended', value: suspendedProjects, color: '--warning-text' },
            { key: 'archived', label: 'Archived', value: archivedProjects, color: '--text-muted' }
          ]}
          centerLabel="Total"
        />

        <Card>
          <h3 className="tx-card-title"><Activity size={15} /> System Health</h3>
          {healthRows.map((h) => (
            <div key={h.key} className="tx-list-row">
              <span className="tx-list-row-main">{h.label}</span>
              <span className="tx-list-row-end">
                <HealthDot state={!healthChecked && h.path ? undefined : h.up === false ? 'down' : 'up'} />
              </span>
            </div>
          ))}
        </Card>

        <Card>
          <h3 className="tx-card-title"><Settings size={15} /> Platform Actions</h3>
          {QUICK_ACTIONS.map((qa) => (
            <div key={qa.key} className="tx-list-row" style={{ cursor: 'pointer' }} onClick={() => setActive(qa.key)}>
              <qa.icon size={14} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
              <span className="tx-list-row-main">{qa.label}</span>
              <span className="tx-list-row-end" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {qa.showPending && pendingRequests.length > 0 && (
                  <span className="tx-badge tx-tone-bg-warning">{pendingRequests.length} Pending</span>
                )}
                <ChevronRight size={14} />
              </span>
            </div>
          ))}
        </Card>
      </div>

      <Card>
        <h3 className="tx-card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span><ClipboardList size={15} /> Recent Workspace Requests</span>
          <button type="button" className="link-btn" onClick={() => setActive('workspace-requests')}>View All</button>
        </h3>
        {recentRequestsLoading ? (
          <Loader size={28} label="Loading requests…" />
        ) : recentRequests.length === 0 ? (
          <EmptyState message="No workspace requests yet." />
        ) : (
          <Table>
            <thead>
              <tr><th>Workspace</th><th>Requested By</th><th>Date</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {recentRequests.map((r) => (
                <tr key={r.id}>
                  <td>{r.workspaceName || r.projectName}</td>
                  <td>{r.projectManagerName}</td>
                  <td>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
                  <td><span className={`status ${r.status?.toLowerCase()}`}>{r.status}</span></td>
                  <td>
                    <button type="button" className="action-btn edit-btn" title="View" onClick={() => setActive('workspace-requests')}>
                      <Eye size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </section>
  );
}
