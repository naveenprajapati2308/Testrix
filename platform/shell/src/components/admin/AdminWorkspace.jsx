import {
  BookOpen,
  Building2,
  ChevronDown,
  ClipboardList,
  FolderKanban,
  LogOut,
  Play,
  Shield,
  Users,
  Zap,
  Layers,
  Cpu,
  Briefcase,
  Sliders,
  Package,
  Clock,
  UserCog,
  KeyRound,
  TerminalSquare,
  Sun,
  Moon
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getStoredThemePref, resolveEffectiveTheme } from '../../../../../shared/ui/theme-sync.js';
import appLogo from '../../assets/testrix_logo.png';
import { ADMIN_WORKSPACE_NAV, ADMIN_WORKSPACE_NAV_FLAT } from '../../constants.js';
import { Breadcrumb } from '../layout/index.jsx';
import { AdminDashboardOverview } from './AdminDashboardOverview.jsx';
import { UserManagement } from './UserManagement.jsx';
import { RoleManagement } from './RoleManagement.jsx';
import { ModuleManagement } from './ModuleManagement.jsx';
import { PortalConfig } from './PortalConfig.jsx';
import { ApiCollection } from './ApiCollection.jsx';
import { WorkspaceRequests } from './WorkspaceRequests.jsx';
import { ProjectManagement } from './ProjectManagement.jsx';
import { AutomationWorkspace } from '../automation/AutomationWorkspace.jsx';
import { WorkspaceSettings } from '../team/WorkspaceSettings.jsx';
import { Placeholder } from '../shared/index.jsx';
import { IntegrationGuide } from '../shared/IntegrationGuide.jsx';

const WS_ICON_MAP = {
  Shield, Users, BookOpen, Play, Zap, Building2, ClipboardList, FolderKanban,
  Layers, Cpu, Briefcase, Sliders, Package, Clock, UserCog, KeyRound, TerminalSquare
};
ADMIN_WORKSPACE_NAV.forEach((item) => { item._icon = WS_ICON_MAP[item.icon]; });

// ── Admin Sidebar — plugs directly into the platform shell's single
// <PortalLayout>, replacing the main Sidebar while in admin mode (not nested
// inside it — that was the "app inside an app" bug). Same expand/collapse
// group pattern as the main Sidebar's automation/apitest sub-menus. ─────────
export function AdminSidebar({ activePage, onNavigate, logout }) {
  const activeGroupKey = ADMIN_WORKSPACE_NAV.find((item) => item.children?.some((c) => c.key === activePage))?.key;
  const [expandedKeys, setExpandedKeys] = useState(() => new Set(activeGroupKey ? [activeGroupKey] : []));

  useEffect(() => {
    if (activeGroupKey) setExpandedKeys((prev) => new Set(prev).add(activeGroupKey));
  }, [activeGroupKey]);

  return (
    <aside className="admin-sidebar">
      <div className="brand">
        <img className="brand-logo sidebar-logo" src={appLogo} alt="TESTRIX" />
        <div>
          <strong>TESTRIX</strong>
          <span>Platform Control Center</span>
        </div>
      </div>
      <nav>
        <div className="nav-section-label" style={{ color: 'var(--warning-text)' }}>Admin Controls</div>
        {ADMIN_WORKSPACE_NAV.map((item) => {
          const Icon = item._icon;
          if (item.children) {
            const isOpen = expandedKeys.has(item.key);
            return (
              <div key={item.key} className="nav-group">
                <button
                  type="button"
                  className={`admin-ws-nav-btn nav-group-header${item.key === activeGroupKey ? ' active' : ''}`}
                  onClick={() => setExpandedKeys((prev) => {
                    const next = new Set(prev);
                    next.has(item.key) ? next.delete(item.key) : next.add(item.key);
                    return next;
                  })}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  <ChevronDown size={14} className={`nav-group-chevron${isOpen ? ' open' : ''}`} />
                </button>
                {isOpen && (
                  <div className="nav-submenu">
                    {item.children.map((child) => (
                      <button
                        key={child.key}
                        type="button"
                        className={activePage === child.key ? 'active' : ''}
                        onClick={() => onNavigate(child.key)}
                      >
                        {child.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <button
              key={item.key}
              className={`admin-ws-nav-btn${activePage === item.key ? ' active' : ''}`}
              onClick={() => onNavigate(item.key)}
              title={item.label}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer admin-sidebar-footer">
        <button className="logout-btn" onClick={logout} title="Logout">
          <LogOut size={18} />
          <span>Logout</span>
        </button>
        <p>All right reserved TESTRIX 2026</p>
      </div>
    </aside>
  );
}

// ── Admin Topbar — same slot as the main Topbar, swapped in for admin mode ──
export function AdminTopbar({ pageTitle, notice, onNavigateRoot, user, onNavigateProfile }) {
  const [themePref, setThemePref] = useState(() => getStoredThemePref());

  const chooseTheme = (pref) => {
    setThemePref(pref);
    localStorage.setItem('portal-theme', pref);
    document.documentElement.dataset.theme = resolveEffectiveTheme(pref);
  };

  return (
    <header className="topbar admin-topbar">
      <div>
        <h1>{pageTitle}</h1>
        <Breadcrumb rootLabel="Admin Dashboard" pageTitle={pageTitle} onNavigateRoot={onNavigateRoot} />
        <p className="admin-notice">{notice}</p>
      </div>
      <div className="topbar-right">
        <div className="tb-theme-switch" role="group" aria-label="Theme">
          <button
            type="button"
            className={themePref === 'light' ? 'active' : ''}
            onClick={() => chooseTheme('light')}
            title="Light theme"
          >
            <Sun size={15} />
          </button>
          <button
            type="button"
            className={themePref === 'dark' ? 'active' : ''}
            onClick={() => chooseTheme('dark')}
            title="Dark theme"
          >
            <Moon size={15} />
          </button>
        </div>

        <div className="admin-badge">
          <Shield size={14} />
          Super Admin
        </div>
        {user && (
          <button className="tb-user-chip" onClick={onNavigateProfile} title="View profile">
            {user.profileImagePath
              ? <img className="tb-user-avatar" src={user.profileImagePath.startsWith('/') || user.profileImagePath.startsWith('http') ? user.profileImagePath : `/uploads/${user.profileImagePath}`} alt="" />
              : <span className="tb-user-avatar">{(user.displayName || user.username || '?').trim().charAt(0).toUpperCase()}</span>}
            <span className="tb-user-text">
              <span className="tb-user-name">{user.displayName || user.username}</span>
              <span className="tb-user-role">Super Admin</span>
            </span>
          </button>
        )}
      </div>
    </header>
  );
}

// ── Admin Content — just the page switch, hosted by the shell's single
// <PortalLayout> content area (no layout of its own). ───────────────────────
export function AdminContent({ activePage, setActivePage, setNotice }) {
  return (
    <>
      {activePage === 'admin-dashboard' && <AdminDashboardOverview setNotice={setNotice} setActive={setActivePage} />}
      {activePage === 'user-management' && <UserManagement setNotice={setNotice} />}
      {activePage === 'module-management' && <ModuleManagement setNotice={setNotice} />}
      {activePage === 'portal-config' && <PortalConfig setNotice={setNotice} />}
      {activePage === 'runner-scaling-admin' && <AutomationWorkspace activePage="settings-scaling" />}
      {activePage === 'automation-settings-admin' && <AutomationWorkspace activePage="settings-engines" />}
      {activePage === 'role-management' && <RoleManagement setNotice={setNotice} />}
      {activePage === 'workspace-requests' && <WorkspaceRequests setNotice={setNotice} />}
      {activePage === 'project-management' && <ProjectManagement setNotice={setNotice} />}
      {activePage === 'workspace-settings-admin' && <WorkspaceSettings setNotice={setNotice} />}
      {activePage === 'access-management' && <Placeholder title="Access Management" lines={['IP allowlists', 'Session policies', 'Coming in a future phase']} />}
      {activePage === 'documentation' && <IntegrationGuide superAdmin setNotice={setNotice} />}
      {activePage === 'api-collection' && <ApiCollection />}
      {activePage === 'apitest-admin-soon' && (
        <Placeholder
          title="API Testing — Admin Controls"
          lines={['Environments, modules and config for API Testing are not wired up yet', 'This section is a placeholder until that admin surface is built']}
        />
      )}
    </>
  );
}

export const adminPageTitle = (activePage) => ADMIN_WORKSPACE_NAV_FLAT.find((i) => i.key === activePage)?.label ?? 'TESTRIX';
