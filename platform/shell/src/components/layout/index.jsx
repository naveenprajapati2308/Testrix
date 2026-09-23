import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Bell, BookOpen, Building2, Camera,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight, Crown, Database,
  FileText,
  FolderTree,
  Gauge, GitCompare, Globe2, History, LayoutDashboard, ListChecks, LogOut, Monitor, Moon, Package, Play, Settings, Sparkles, Sun, Table2, TerminalSquare, UserCircle,
  Users,
  Workflow
} from 'lucide-react';
import { GlobalSearchDropdown } from '../../search/components/GlobalSearchDropdown.jsx';
import { SIDEBAR_NAV, NAV_MODULE_REQUIREMENT } from '../../constants.js';
import { getStoredThemePref, resolveEffectiveTheme } from '../../../../../shared/ui/theme-sync.js';
import { api, auth } from '../../api.js';
import { isDirty, requestSave, discardChanges } from '../../lib/iframeDirtyState.js';
import testrixLogo from '../../assets/testrix_logo.png';

const NAV_ICON_MAP = {
  LayoutDashboard, Play, Globe2, Gauge, UserCircle, FileText, TerminalSquare, Camera, GitCompare,
  Database, Workflow, CalendarClock, History, FolderTree, Package, Users, Settings, BookOpen,
  Sparkles, Table2, ListChecks
};

// ── Layout: Sidebar ─────────────────────────────────────────────────────────
export function Sidebar({
  active,
  activeChildKey,
  logout,
  onNavigate,
  onNavigateChild,
  isCollapsed,
  onToggle,
  onOpenAiAssistant,
  project
}) {
  const isExpandable = (key) => SIDEBAR_NAV.some((item) => item.key === key && item.children);
  const [expandedKeys, setExpandedKeys] = useState(() => (isExpandable(active) ? { [active]: true } : {}));

  useEffect(() => {
    if (isExpandable(active)) setExpandedKeys((k) => ({ ...k, [active]: true }));
  }, [active]);

  // This Sidebar only ever renders for a project user (Super Admin lives exclusively in the
  // Admin Workspace shell — see AdminSidebar) — a project that only enabled a subset of modules
  // hides the rest entirely.
  const visibleNav = project
    ? SIDEBAR_NAV.filter((item) => {
      const required = NAV_MODULE_REQUIREMENT[item.key];
      return !required || required.some((m) => project.enabledModules?.includes(m));
    })
    : SIDEBAR_NAV;

  // "Team Management" + "Workspace Settings" are Project-Admin-only, inserted just before Profile.
  const navItems = [...visibleNav];
  if (project?.roles?.includes('PROJECT_ADMIN')) {
    const profileIdx = navItems.findIndex((i) => i.key === 'profile');
    const teamItem = { key: 'team', label: 'Team Management', icon: 'Users' };
    const settingsItem = { key: 'workspace-settings', label: 'Workspace Settings', icon: 'Settings' };
    if (profileIdx >= 0) {
      navItems.splice(profileIdx, 0, settingsItem, teamItem);
    } else {
      navItems.push(settingsItem, teamItem);
    }
  }

  // ── Collapsed mode: hover tooltip and click submenu dropdown state ────────
  const [hoveredItem, setHoveredItem] = useState(null); // { key, label, rect }
  const [openSubmenu, setOpenSubmenu] = useState(null); // { key, label, children, rect }

  useEffect(() => {
    if (!openSubmenu) return;
    const handleClickOutside = (e) => {
      if (
        !e.target.closest('.sidebar-floating-flyout') &&
        !e.target.closest('.nav-collapsed-item-btn')
      ) {
        setOpenSubmenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openSubmenu]);

  // Close popup if sidebar gets expanded
  useEffect(() => {
    if (!isCollapsed) {
      setOpenSubmenu(null);
      setHoveredItem(null);
    }
  }, [isCollapsed]);

  return (
    <aside
      className="sidebar"
      style={{
        width: '100%',
        padding: isCollapsed ? '12px 8px' : '20px 16px',
        boxSizing: 'border-box'
      }}
    >
      <div
        className="brand"
        style={{
          padding: isCollapsed ? '8px 0 14px' : '0 0 20px',
          flexDirection: isCollapsed ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          gap: isCollapsed ? '8px' : '10px',
          borderBottom: '1px solid var(--sidebar-edge)',
          marginBottom: '8px',
          width: '100%'
        }}
      >
        {/* No toggle in here — it lives on the sidebar's right edge (see PortalLayout), which
            leaves the whole header width to the logo at both widths. */}
        {isCollapsed ? (
          <img
            src={testrixLogo}
            alt="TESTRIX"
            className="brand-logo sidebar-logo"
            style={{ width: 34, height: 34, margin: 0 }}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
            <img
              src={testrixLogo}
              alt="TESTRIX"
              className="brand-logo sidebar-logo"
              style={{ width: 34, height: 34, flexShrink: 0 }}
            />
            <div style={{ animation: 'fadeIn 0.2s', minWidth: 0, overflow: 'hidden' }}>
              <strong style={{ fontSize: '15px', letterSpacing: '0.04em' }}>TESTRIX</strong>
              <span style={{ fontSize: '11px', color: 'var(--sidebar-muted)' }}>Unified Testing Platform</span>
            </div>
          </div>
        )}
      </div>

      <nav style={{ paddingRight: 0, flex: '1 1 auto', overflowY: 'auto', overflowX: 'hidden' }}>

        {navItems.map((item) => {
          const Icon = NAV_ICON_MAP[item.icon] || LayoutDashboard;
          const isActive = active === item.key;
          const commonStyle = {
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            padding: isCollapsed ? '0' : '0 12px',
            borderRadius: '8px'
          };
          const children = item.children
            ? item.children.filter((child) => !child.projectAdminOnly || project?.roles?.includes('PROJECT_ADMIN'))
            : null;
          const hasChildren = children && children.length > 0;

          /* ── Expanded: accordion ── */
          if (hasChildren && !isCollapsed) {
            const isExpanded = !!expandedKeys[item.key];
            return (
              <div className="nav-group" key={item.key}>
                <button
                  className={`nav-group-header ${isActive ? 'active' : ''}`}
                  onClick={() => setExpandedKeys((k) => ({ ...k, [item.key]: !k[item.key] }))}
                  title={item.label}
                  style={commonStyle}
                >
                  <Icon size={18} style={{ flexShrink: 0 }} />
                  <span style={{ animation: 'fadeIn 0.2s' }}>{item.label}</span>
                  <ChevronDown size={14} className={`nav-group-chevron ${isExpanded ? 'open' : ''}`} />
                </button>
                {isExpanded && (
                  <div className="nav-submenu">
                    {children.map((child) => (
                      <button
                        key={child.key}
                        className={activeChildKey === child.key ? 'active' : ''}
                        onClick={() => onNavigateChild(item.key, child.key)}
                      >
                        {child.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          /* ── Collapsed: with children (click opens submenu dropdown, hover shows tooltip) ── */
          if (hasChildren && isCollapsed) {
            const isDropdownOpen = openSubmenu?.key === item.key;
            return (
              <button
                key={item.key}
                className={`nav-collapsed-item-btn ${isActive || isDropdownOpen ? 'active' : ''}`}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoveredItem(null);
                  setOpenSubmenu((prev) =>
                    prev?.key === item.key ? null : { key: item.key, label: item.label, children, rect }
                  );
                }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoveredItem({ key: item.key, label: item.label, rect });
                }}
                onMouseLeave={() => setHoveredItem(null)}
                style={commonStyle}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
              </button>
            );
          }

          /* ── Collapsed: direct item without children (hover shows tooltip, click navigates) ── */
          if (isCollapsed) {
            if (item.disabled) {
              return (
                <button
                  key={item.key}
                  disabled
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredItem({ key: item.key, label: `${item.label} (Coming Soon)`, rect });
                  }}
                  onMouseLeave={() => setHoveredItem(null)}
                  style={{ ...commonStyle, opacity: 0.45, cursor: 'default' }}
                >
                  <Icon size={18} style={{ flexShrink: 0 }} />
                </button>
              );
            }
            if (item.href) {
              return (
                <a
                  key={item.key}
                  href={item.href}
                  className={isActive ? 'active' : ''}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredItem({ key: item.key, label: item.label, rect });
                  }}
                  onMouseLeave={() => setHoveredItem(null)}
                  style={{ ...commonStyle, textDecoration: 'none' }}
                >
                  <Icon size={18} style={{ flexShrink: 0 }} />
                </a>
              );
            }
            return (
              <button
                key={item.key}
                className={isActive ? 'active' : ''}
                onClick={() => {
                  setOpenSubmenu(null);
                  setHoveredItem(null);
                  onNavigate(item.key);
                }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoveredItem({ key: item.key, label: item.label, rect });
                }}
                onMouseLeave={() => setHoveredItem(null)}
                style={commonStyle}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
              </button>
            );
          }

          /* ── Expanded: regular items without children ── */
          if (item.href) {
            return (
              <a
                key={item.key}
                href={item.href}
                className={isActive ? 'active' : ''}
                title={item.label}
                style={{ ...commonStyle, textDecoration: 'none' }}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                <span style={{ animation: 'fadeIn 0.2s' }}>{item.label}</span>
              </a>
            );
          }
          if (item.disabled) {
            return (
              <button
                key={item.key}
                disabled
                title={`${item.label} — coming soon`}
                style={{ ...commonStyle, opacity: 0.45, cursor: 'default' }}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                <span style={{ animation: 'fadeIn 0.2s' }}>{item.label}</span>
              </button>
            );
          }
          return (
            <button
              key={item.key}
              className={isActive ? 'active' : ''}
              onClick={() => onNavigate(item.key)}
              title={item.label}
              style={commonStyle}
            >
              <Icon size={18} style={{ flexShrink: 0 }} />
              <span style={{ animation: 'fadeIn 0.2s' }}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div style={{ marginTop: 'auto' }}>
        <div className="sidebar-footer">
          <button
            onClick={() => {
              setOpenSubmenu(null);
              setHoveredItem(null);
              onOpenAiAssistant();
            }}
            onMouseEnter={isCollapsed ? (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setHoveredItem({ key: 'ai-assistant', label: 'AI Assistant', rect });
            } : undefined}
            onMouseLeave={isCollapsed ? () => setHoveredItem(null) : undefined}
            className={`ai-chat-btn ${active === 'ai-assistant' ? 'active' : ''}`}
            style={{ justifyContent: isCollapsed ? 'center' : 'flex-start', padding: isCollapsed ? '0' : '0 12px' }}
          >
            <Sparkles size={18} style={{ flexShrink: 0 }} />
            {!isCollapsed && <span style={{ animation: 'fadeIn 0.2s' }}>AI Assistant</span>}
          </button>
          <button
            onClick={() => {
              setOpenSubmenu(null);
              setHoveredItem(null);
              logout();
            }}
            onMouseEnter={isCollapsed ? (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setHoveredItem({ key: 'logout', label: 'Logout', rect });
            } : undefined}
            onMouseLeave={isCollapsed ? () => setHoveredItem(null) : undefined}
            className="logout-btn"
            style={{ justifyContent: isCollapsed ? 'center' : 'flex-start', padding: isCollapsed ? '0' : '0 12px' }}
          >
            <LogOut size={18} style={{ flexShrink: 0 }} />
            {!isCollapsed && <span style={{ animation: 'fadeIn 0.2s' }}>Logout</span>}
          </button>
          {!isCollapsed && <p style={{ animation: 'fadeIn 0.2s', textAlign: 'center' }}>All right reserved TESTRIX 2026</p>}
        </div>
      </div>

      {/* ── Hover Tooltip for Collapsed Mode (hidden if dropdown is open for this item) ── */}
      {isCollapsed && hoveredItem && (!openSubmenu || openSubmenu.key !== hoveredItem.key) && (
        <div
          className="nav-collapsed-tooltip"
          style={{
            position: 'fixed',
            left: `${hoveredItem.rect.right + 10}px`,
            top: `${hoveredItem.rect.top + hoveredItem.rect.height / 2}px`,
            transform: 'translateY(-50%)',
            zIndex: 999999
          }}
        >
          {hoveredItem.label}
        </div>
      )}

      {/* ── Click Submenu Dropdown for Collapsed Mode ── */}
      {isCollapsed && openSubmenu && openSubmenu.rect && (
        <div
          className="sidebar-floating-flyout"
          style={{
            position: 'fixed',
            left: `${openSubmenu.rect.right + 10}px`,
            top: `${Math.min(openSubmenu.rect.top, Math.max(10, window.innerHeight - 340))}px`,
            zIndex: 999999
          }}
        >
          <div className="nav-collapsed-flyout">
            <div className="nav-collapsed-flyout-title">{openSubmenu.label}</div>
            <div className="nav-collapsed-flyout-list">
              {openSubmenu.children.map((child) => (
                <button
                  key={child.key}
                  className={activeChildKey === child.key ? 'active' : ''}
                  onClick={() => {
                    onNavigateChild(openSubmenu.key, child.key);
                    setOpenSubmenu(null);
                  }}
                >
                  {child.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-4px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </aside>
  );
}

export function PortalLayout({
  sidebar, topbar, children, shellClassName = '', mainClassName = '', isCollapsed,
  onToggle, showToggle = false
}) {
  const sidebarWidth = isCollapsed ? 72 : 280;

  return (
    <div
      className={`shell portal-layout ${shellClassName}`.trim()}
      style={{
        gridTemplateColumns: `${sidebarWidth}px 1fr`,
        transition: 'grid-template-columns 0.2s ease-in-out'
      }}
    >
      <div
        className="sidebar-wrapper"
        style={{
          width: `${sidebarWidth}px`,
          height: '100vh',
          maxHeight: '100vh',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s ease-in-out'
        }}
      >
        {sidebar}
        {showToggle && onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="sidebar-edge-toggle"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        )}
      </div>
      <main className={`layout-main ${mainClassName}`.trim()}>
        {topbar}
        <div className="layout-content">
          {children}
        </div>
      </main>
    </div>
  );
}

// ── Breadcrumb: "{rootLabel} [> {mid.label}] > {pageTitle}", each non-current
// ── Breadcrumb: dynamic, interactive trail [ { label, onClick }, ... ] ─────
// Every segment except the current (last) item renders as an interactive button link.
export function Breadcrumb({ items = [], rootLabel = 'Home', mid, pageTitle, onNavigateRoot }) {
  if (items && items.length > 0) {
    return (
      <nav className="tb-breadcrumb" aria-label="Breadcrumb">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <span key={idx} className="tb-breadcrumb-segment">
              {idx > 0 && <ChevronRight size={12} className="tb-breadcrumb-sep" />}
              {isLast || !item.onClick ? (
                <span className="tb-breadcrumb-current">{item.label}</span>
              ) : (
                <button
                  type="button"
                  className="tb-breadcrumb-link"
                  onClick={item.onClick}
                >
                  {item.label}
                </button>
              )}
            </span>
          );
        })}
      </nav>
    );
  }

  if (!pageTitle) return null;
  // On the root page itself, rootLabel and pageTitle are the same string — don't render
  // it twice ("Admin Dashboard > Admin Dashboard"); just show it once, non-clickable.
  const legacyItems = rootLabel === pageTitle
    ? [{ label: pageTitle }]
    : [
      { label: rootLabel, onClick: onNavigateRoot },
      ...(mid && mid.label !== pageTitle ? [{ label: mid.label, onClick: mid.onClick }] : []),
      { label: pageTitle }
    ];

  return <Breadcrumb items={legacyItems} />;
}

//request for the workspace switcher dropdown in the topbar, which is only shown if the user belongs to more than one workspace/project.
function WorkspaceBadge({ project }) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState(null);
  const [switching, setSwitching] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState(null);
  const [savingChanges, setSavingChanges] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (!projects) {
      try { setProjects(await api.myProjects()); } catch { setProjects([]); }
    }
  };

  // Performs the actual switch. Nothing here runs until any unsaved work is resolved, because
  // selectProject rotates the refresh token and rewrites the stored session — if the user then
  // backed out, the page would still show the old workspace's rows while every request carried
  // the new workspace's token, and those rows would come back as "not found".
  const commitSwitch = async (targetId) => {
    setSwitching(true);
    try {
      const session = auth.get();
      const updated = await api.selectProject(targetId, session.refreshToken);
      auth.set(updated);
      window.location.reload();
    } catch {
      setSwitching(false);
      setPendingSwitch(null);
    }
  };

  const switchTo = async (targetId) => {
    if (targetId === project.id || switching) return;
    if (isDirty()) {
      setOpen(false);
      setPendingSwitch(projects?.find((p) => p.id === targetId) || { id: targetId, name: 'workspace' });
      return;
    }
    await commitSwitch(targetId);
  };

  const saveThenSwitch = async () => {
    setSaveError(null);
    setSavingChanges(true);
    const result = await requestSave();
    setSavingChanges(false);
    if (!result.ok) {
      setSaveError(result.message || 'Could not save your changes. Fix the error, then try again.');
      return;
    }
    const target = pendingSwitch;
    setPendingSwitch(null);
    await commitSwitch(target.id);
  };

  const discardThenSwitch = async () => {
    discardChanges();
    const target = pendingSwitch;
    setPendingSwitch(null);
    await commitSwitch(target.id);
  };

  if (!project) return null;

  return (
    <div className="ws-badge-wrap" ref={ref}>
      <button type="button" className="tb-chip ws-badge-btn" onClick={toggle} title={`${project.name} (${project.projectCode})`}>
        <Building2 size={14} />
        <span className="ws-badge-name">{project.name}</span>
        {projects === null || projects.length > 1 ? <ChevronDown size={12} /> : null}
      </button>
      {open && (
        <div className="ws-badge-dropdown">
          {projects === null ? (
            <div className="ws-badge-loading">Loading workspaces…</div>
          ) : projects.length <= 1 ? (
            <div className="ws-badge-loading">There is only one workspace assigned to you.</div>
          ) : (
            projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className="ws-badge-option"
                disabled={switching}
                onClick={() => switchTo(p.id)}
              >
                {p.id === project.id ? <Check size={13} /> : <span style={{ width: 13 }} />}
                <span>{p.name}</span>
              </button>
            ))
          )}
        </div>
      )}

      {pendingSwitch && (
        <div className="ws-guard-overlay" role="dialog" aria-modal="true" aria-labelledby="ws-guard-title">
          <div className="ws-guard-card">
            <div className="ws-guard-head">
              <AlertTriangle size={18} />
              <h3 id="ws-guard-title">Unsaved changes</h3>
            </div>
            <p className="ws-guard-body">
              You have unsaved changes in <strong>{project.name}</strong>. Switching to{' '}
              <strong>{pendingSwitch.name}</strong> will reload the page and lose them.
            </p>
            {saveError && <p className="ws-guard-error">{saveError}</p>}
            <div className="ws-guard-actions">
              <button
                type="button"
                className="ws-guard-btn ghost"
                onClick={() => { setPendingSwitch(null); setSaveError(null); }}
                disabled={savingChanges || switching}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ws-guard-btn danger"
                onClick={discardThenSwitch}
                disabled={savingChanges || switching}
              >
                Discard &amp; switch
              </button>
              <button
                type="button"
                className="ws-guard-btn primary"
                onClick={saveThenSwitch}
                disabled={savingChanges || switching}
              >
                {savingChanges ? 'Saving…' : 'Save & switch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Project role beats the vestigial platform UserRole (almost always VIEWER — see
// WorkspaceProvisioningService.approve()) for display: it's the role that actually governs
// what this user can do inside their project. Falls back to user.role for Super Admin, who
// has no project context.
const PROJECT_ROLE_PRIORITY = ['PROJECT_ADMIN', 'QA_LEAD', 'TECH_LEAD', 'AUTOMATION_ENGINEER', 'VIEWER'];

function displayRole(user, project) {
  const projectRole = project?.roles?.length
    ? PROJECT_ROLE_PRIORITY.find((r) => project.roles.includes(r)) || project.roles[0]
    : null;
  return projectRole || user?.role || '';
}

// ── Layout: Topbar ───────────────────────────────────────────────────────────
export function Topbar({ pageTitle, breadcrumbItems, breadcrumbMid, superAdmin, onNavigateHome, notifications, user, project, onNavigateProfile, onNavigate, topbarExtra }) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [themePref, setThemePref] = useState(() => getStoredThemePref());

  const chooseTheme = (pref) => {
    setThemePref(pref);
    localStorage.setItem('portal-theme', pref);
    document.documentElement.dataset.theme = resolveEffectiveTheme(pref);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = resolveEffectiveTheme(themePref);
  }, []);


  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => { if (themePref === 'system') document.documentElement.dataset.theme = resolveEffectiveTheme('system'); };
    mq?.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, [themePref]);

  // Ctrl+K is now handled inside GlobalSearchDropdown itself.

  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <header className="topbar" style={{ background: 'var(--bg-page)', borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '16px' }}>
      <div>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '22px', fontWeight: 800 }}>
          {pageTitle}
        </h1>
        <Breadcrumb items={breadcrumbItems} rootLabel="Home" mid={breadcrumbMid} pageTitle={pageTitle} onNavigateRoot={onNavigateHome} />
      </div>

      <div className="topbar-right">
        {topbarExtra}
        <WorkspaceBadge project={project} />
        <GlobalSearchDropdown onNavigate={onNavigate} superAdmin={superAdmin} />

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="tb-icon-btn"
            title="Notifications"
          >
            <Bell size={17} />
            {unreadCount > 0 && <span className="tb-count-badge">{unreadCount}</span>}
          </button>

          {showNotifications && (
            <div
              style={{
                position: 'absolute',
                top: '46px',
                right: 0,
                width: '320px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                boxShadow: '0 10px 30px var(--shadow-a50)',
                zIndex: 200,
                padding: '12px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '8px' }}>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Notifications</strong>
                <span style={{ fontSize: '11px', color: 'var(--cyan-text)', cursor: 'pointer', fontWeight: 'bold' }}>Mark all read</span>
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {notifications.map((n) => (
                  <div key={n.id} style={{ background: n.unread ? 'rgba(96, 179, 224, 0.04)' : 'transparent', padding: '8px', borderRadius: '6px', fontSize: '12px', border: n.unread ? '1px solid rgba(96, 179, 224, 0.08)' : '1px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <span>{n.title}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>{n.time}</span>
                    </div>
                    <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>{n.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="tb-theme-switch" role="group" aria-label="Theme">
          <button
            type="button"
            className={themePref === 'system' ? 'active' : ''}
            onClick={() => chooseTheme('system')}
            title="Match system theme"
          >
            <Monitor size={15} />
          </button>
          <button
            type="button"
            className={themePref === 'light' ? 'active' : ''}
            onClick={() => chooseTheme('light')}
            title="Bright theme"
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

        {user && (
          <button className="tb-user-chip" onClick={onNavigateProfile} title="View profile">
            {user.profileImagePath
              ? <img className="tb-user-avatar" src={user.profileImagePath.startsWith('/') || user.profileImagePath.startsWith('http') ? user.profileImagePath : `/uploads/${user.profileImagePath}`} alt="" />
              : <span className="tb-user-avatar">{(user.displayName || user.username || '?').trim().charAt(0).toUpperCase()}</span>}
            <span className="tb-user-text">
              <span className="tb-user-name">{user.displayName || user.username}</span>
              <span className="tb-user-role">{superAdmin && <Crown size={9} style={{ marginRight: 3, verticalAlign: '-1px' }} />}{displayRole(user, project).replace(/_/g, ' ').toLowerCase()}</span>
            </span>
            <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
        )}
      </div>
    </header>
  );
}
