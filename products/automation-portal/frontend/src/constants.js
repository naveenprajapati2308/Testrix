export const USER_NAV = [
  { key: 'dashboard', label: 'Overview', icon: 'Gauge' },
  { key: 'execution', label: 'Execution Center', icon: 'Play' },
  { key: 'reports', label: 'Reports Center', icon: 'FileText' },
  { key: 'logs', label: 'Test Logs', icon: 'TerminalSquare' },
  { key: 'screenshots', label: 'Screenshots', icon: 'Camera' },
  { key: 'compare', label: 'Historical Compare', icon: 'GitCompare' },
  { key: 'environments', label: 'Environments', icon: 'Globe2' },
  {
    key: 'settings',
    label: 'Automation Settings',
    icon: 'Settings2',
    children: [
      { key: 'settings-workspace', label: 'Workspace Settings', icon: 'Briefcase' },
      { key: 'settings-engines', label: 'Engine Settings', icon: 'Cpu' },
      { key: 'settings-scaling', label: 'Runner Scaling', icon: 'Layers' }
    ]
  },
  // Project-Admin only (filtered in Sidebar) — re-entry into the Automation Setup Wizard for
  // registering a second framework (e.g. Selenium already set up, now adding Playwright) once
  // the project is already past its first-time setup.
  { key: 'automation-setup', label: 'Add Framework', icon: 'Wrench' }
];

export const fallbackSummary = {
  totalExecutions: 0,
  passRate: 0,
  failRate: 0,
  queuedExecutions: 0,
  runningExecutions: 0
};
