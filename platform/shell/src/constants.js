
export const API_TESTING_NAV = [
  { key: 'dashboard', label: 'Overview', icon: 'LayoutDashboard', path: '/' },
  { key: 'tester', label: 'Test APIs', icon: 'Send', path: '/tester' },
  { key: 'base-apis', label: 'Base APIs', icon: 'Database', path: '/base-apis' },
  { key: 'regular-apis', label: 'Regular APIs', icon: 'Workflow', path: '/regular-apis' },
  { key: 'scheduler', label: 'Groups & Scheduler', icon: 'CalendarClock', path: '/scheduler' },
  { key: 'reports', label: 'Reports', icon: 'FileText', path: '/reports' },
  { key: 'history', label: 'History', icon: 'History', path: '/history' },
  { key: 'modules', label: 'Modules', icon: 'FolderTree', path: '/modules' }
];

export const AUTOMATION_NAV = [
  { key: 'dashboard', label: 'Overview', icon: 'Gauge' },
  { key: 'execution', label: 'Execution Center', icon: 'Play' },
  { key: 'reports', label: 'Reports Center', icon: 'FileText' },
  { key: 'logs', label: 'Test Logs', icon: 'TerminalSquare' },
  { key: 'screenshots', label: 'Screenshots', icon: 'Camera' },
  { key: 'compare', label: 'Historical Compare', icon: 'GitCompare' },
  { key: 'environments', label: 'Environments', icon: 'Globe2' },
  { key: 'automation-setup', label: 'Add Framework', icon: 'Wrench', projectAdminOnly: true }
];



export const PERFORMANCE_NAV = [
  { key: 'dashboard', label: 'Overview', icon: 'LayoutDashboard', path: '/' },
  { key: 'virtual-users', label: 'Virtual Users', icon: 'Users', path: '/virtual-users' },
  { key: 'performance-tests', label: 'Performance Tests', icon: 'Gauge', path: '/performance-tests' },
  { key: 'load-tests', label: 'Load Tests', icon: 'TrendingUp', path: '/load-tests' },
  { key: 'groups', label: 'Test Groups', icon: 'Layers', path: '/groups' },
  { key: 'scheduler', label: 'Scheduler', icon: 'CalendarClock', path: '/scheduler' },
  { key: 'runs', label: 'Run History', icon: 'History', path: '/runs' }
];


export const SIDEBAR_NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { key: 'apitest', label: 'API Testing', icon: 'Globe2', children: API_TESTING_NAV },
  { key: 'automation', label: 'Automation', icon: 'Play', children: AUTOMATION_NAV },

  { key: 'perf', label: 'Performance', icon: 'Gauge', children: PERFORMANCE_NAV },
  { key: 'documentation', label: 'Documentation', icon: 'BookOpen' },
  { key: 'profile', label: 'Profile', icon: 'UserCircle' }
];

export const ADMIN_NAV = [
  { key: 'admin', label: 'Administration', icon: 'LayoutDashboard' }
];


export const ADMIN_WORKSPACE_NAV = [
  { key: 'admin-dashboard', label: 'Admin Dashboard', icon: 'Shield' },
  {
    key: 'automation-admin',
    label: 'Automation',
    icon: 'Play',
    children: [
      { key: 'module-management', label: 'Module Management', icon: 'Package' },
      { key: 'portal-config', label: 'System Config', icon: 'Sliders' }
    ]
  },
  {
    key: 'apitest-admin',
    label: 'API Testing',
    icon: 'Zap',
    children: [
      { key: 'apitest-admin-soon', label: 'Coming Soon', icon: 'Clock' }
    ]
  },
  {
    key: 'user-management-admin',
    label: 'User Management',
    icon: 'Users',
    children: [
      { key: 'user-management', label: 'Manage Users', icon: 'Users' },
      { key: 'role-management', label: 'Role Management', icon: 'UserCog' },
      { key: 'access-management', label: 'Access Management', icon: 'KeyRound' }
    ]
  },
  {
    key: 'workspace-management-admin',
    label: 'Workspace Management',
    icon: 'Building2',
    children: [
      { key: 'workspace-requests', label: 'Workspace Requests', icon: 'ClipboardList' },
      { key: 'project-management', label: 'Project Management', icon: 'FolderKanban' }
    ]
  },
  {
    key: 'docs-admin',
    label: 'Documentation',
    icon: 'BookOpen',
    children: [
      { key: 'documentation', label: 'Documentation', icon: 'BookOpen' },
      { key: 'api-collection', label: 'API Reference', icon: 'TerminalSquare' }
    ]
  }
];


export const ADMIN_WORKSPACE_NAV_FLAT = ADMIN_WORKSPACE_NAV.flatMap((item) => item.children ?? [item]);

export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'QA_LEAD', 'AUTOMATION_ENGINEER', 'VIEWER'];

export const isSuperAdmin = (session) => session?.user?.role === 'SUPER_ADMIN';

// Which project_modules module_type(s) unlock each top-level sidebar entry — a project that only
// requested e.g. API Testing hides the Automation/Performance entries entirely. This Sidebar only
// ever renders for a project user; Super Admin lives in the separate Admin Workspace shell.
export const NAV_MODULE_REQUIREMENT = {
  automation: ['AUTOMATION_SELENIUM', 'AUTOMATION_PLAYWRIGHT'],
  apitest: ['API_TESTING'],
  perf: ['PERFORMANCE_TESTING']
};
