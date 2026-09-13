import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell, BookOpen, Building2, Camera,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight, Crown, Database,
  FileText,
  FolderTree,
  Gauge, GitCompare, Globe2, History, LayoutDashboard, LogOut, Menu, Monitor, Moon, Package, Play, Settings, Sparkles, Sun, TerminalSquare, UserCircle,
  Users,
  Workflow
} from 'lucide-react';
import { GlobalSearchDropdown } from '../../search/components/GlobalSearchDropdown.jsx';
import { SIDEBAR_NAV, NAV_MODULE_REQUIREMENT } from '../../constants.js';
import { getStoredThemePref, resolveEffectiveTheme } from '../../../../../shared/ui/theme-sync.js';
import { api, auth } from '../../api.js';
import testrixLogo from '../../assets/testrix_logo.png';

const NAV_ICON_MAP = {
  LayoutDashboard, Play, Globe2, Gauge, UserCircle, FileText, TerminalSquare, Camera, GitCompare,
  Database, Workflow, CalendarClock, History, FolderTree, Package, Users, Settings, BookOpen,
  Sparkles
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

  // ── Collapsed submenu hover popup ───────────────────────────────────────
  const [hoveredGroup, setHoveredGroup] = useState(null);
  const hoverTimeoutRef = useRef(null);
  const openHover = (key) => { clearTimeout(hoverTimeoutRef.current); setHoveredGroup(key); };
  const closeHover = () => { hoverTimeoutRef.current = setTimeout(() => setHoveredGroup(null), 150); };

  const COLLAPSED_W = 80;
  const EXPANDED_W = 280;

  return (
    <aside
      className="sidebar"
      style={{
        width: isCollapsed ? `${COLLAPSED_W}px` : `${EXPANDED_W}px`,
        minWidth: isCollapsed ? `${COLLAPSED_W}px` : `${EXPANDED_W}px`,
        padding: isCollapsed ? '12px 8px' : '22px',
        transition: 'all 0.2s ease-in-out'
      }}
    >
      <div className="brand" style={{ paddingBottom: isCollapsed ? '12px' : '24px', justifyContent: isCollapsed ? 'center' : 'flex-start' }}>
        <img src={testrixLogo} alt="TESTRIX" className="brand-logo sidebar-logo" style={{ width: 36, height: 36, flexShrink: 0 }} />
        {!isCollapsed && (
          <div style={{ animation: 'fadeIn 0.2s', flex: 1 }}>
            <strong>TESTRIX</strong>
            <span>Unified Testing Platform</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="sidebar-toggle-btn"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <Menu size={14} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav style={{ paddingRight: 0, flex: '0 1 auto' }}>
        <div
          className="nav-section-label"
          style={{
            textAlign: isCollapsed ? 'center' : 'left',
            fontSize: isCollapsed ? '9px' : '10px',
            padding: isCollapsed ? '10px 0 4px' : '10px 12px 4px'
          }}
        >
          {isCollapsed ? 'NAV' : 'Navigation'}
        </div>
        {navItems.map((item) => {
          const Icon = NAV_ICON_MAP[item.icon] || LayoutDashboard;
          const isActive = active === item.key;
          const commonStyle = {
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            padding: isCollapsed ? '0' : '0 12px',
            borderRadius: '8px'
          };
          const children = item.children;

          /* ── Expanded: normal accordion ── */
          if (children && !isCollapsed) {
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
                    {children
                      .filter((child) => !child.projectAdminOnly || project?.roles?.includes('PROJECT_ADMIN'))
                      .map((child) => (
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

          /* ── Collapsed + has children: icon-only with hover flyout popup ── */
          if (children && isCollapsed) {
            const visibleChildren = children.filter(
              (child) => !child.projectAdminOnly || project?.roles?.includes('PROJECT_ADMIN')
            );
            return (
              <div
                key={item.key}
                className="nav-collapsed-group"
                onMouseEnter={() => openHover(item.key)}
                onMouseLeave={closeHover}
                style={{ position: 'relative' }}
              >
                <button
                  className={isActive ? 'active' : ''}
                  onClick={() => onNavigate(item.key)}
                  title={item.label}
                  style={commonStyle}
                >
                  <Icon size={18} style={{ flexShrink: 0 }} />
                </button>
                {hoveredGroup === item.key && visibleChildren.length > 0 && (
                  <div
                    className="nav-collapsed-flyout"
                    onMouseEnter={() => openHover(item.key)}
                    onMouseLeave={closeHover}
                  >
                    <div className="nav-collapsed-flyout-title">{item.label}</div>
                    {visibleChildren.map((child) => (
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
                {!isCollapsed && <span style={{ animation: 'fadeIn 0.2s' }}>{item.label}</span>}
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
                {!isCollapsed && <span style={{ animation: 'fadeIn 0.2s' }}>{item.label}</span>}
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
              {!isCollapsed && <span style={{ animation: 'fadeIn 0.2s' }}>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div style={{ marginTop: 'auto' }}>

        <div className="sidebar-footer">
          <button
            onClick={onOpenAiAssistant}
            title="AI Assistant"
            className={`ai-chat-btn ${active === 'ai-assistant' ? 'active' : ''}`}
            style={{ justifyContent: isCollapsed ? 'center' : 'flex-start', padding: isCollapsed ? '0' : '0 12px' }}
          >
            <Sparkles size={18} style={{ flexShrink: 0 }} />
            {!isCollapsed && <span style={{ animation: 'fadeIn 0.2s' }}>AI Assistant</span>}
          </button>
          <button
            onClick={logout}
            title="Logout"
            className="logout-btn"
            style={{ justifyContent: isCollapsed ? 'center' : 'flex-start', padding: isCollapsed ? '0' : '0 12px' }}
          >
            <LogOut size={18} style={{ flexShrink: 0 }} />
            {!isCollapsed && <span style={{ animation: 'fadeIn 0.2s' }}>Logout</span>}
          </button>
          {!isCollapsed && <p style={{ animation: 'fadeIn 0.2s', textAlign: 'center' }}>All right reserved TESTRIX 2026</p>}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-4px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </aside>
  );
}

export function PortalLayout({ sidebar, topbar, children, shellClassName = '', mainClassName = '', isCollapsed, sidebarWidth }) {
  const COLLAPSED_W = 80;
  const EXPANDED_W = 280;
  const effectiveWidth = sidebarWidth || (isCollapsed ? COLLAPSED_W : EXPANDED_W);

  // ── Drag-to-resize state ────────────────────────────────────────────────
  const [dragWidth, setDragWidth] = useState(null);
  const draggingRef = useRef(false);

  const onResizeStart = useCallback((e) => {
    e.preventDefault();
    draggingRef.current = true;
    const startX = e.clientX;
    const startW = effectiveWidth;
    const onMove = (ev) => {
      if (!draggingRef.current) return;
      const newW = Math.max(COLLAPSED_W, Math.min(480, startW + (ev.clientX - startX)));
      setDragWidth(newW);
    };
    const onUp = () => {
      draggingRef.current = false;
      setDragWidth(null);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [effectiveWidth]);

  const actualWidth = dragWidth || effectiveWidth;

  return (
    <div
      className={`shell portal-layout ${shellClassName}`.trim()}
      style={{
        gridTemplateColumns: `${actualWidth}px 1fr`,
        transition: dragWidth ? 'none' : 'grid-template-columns 0.2s ease-in-out'
      }}
    >
      <div style={{ position: 'relative', width: actualWidth, transition: dragWidth ? 'none' : 'width 0.2s ease-in-out' }}>
        {sidebar}
        {/* Drag-to-resize handle on the right edge */}
        <div
          className="sidebar-resize-handle"
          onMouseDown={onResizeStart}
          title="Drag to resize sidebar"
        />
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

  const switchTo = async (targetId) => {
    if (targetId === project.id || switching) return;
    setSwitching(true);
    try {
      const session = auth.get();
      const updated = await api.selectProject(targetId, session.refreshToken);
      auth.set(updated);
      window.location.reload();
    } catch {
      setSwitching(false);
    }
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
