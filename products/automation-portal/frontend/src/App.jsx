import {
  Camera,
  FileText,
  Gauge,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Play,
  TerminalSquare,
  GitCompare,
  AlertTriangle,
  ShieldAlert,
  FileQuestion,
  WifiOff,
  Clock,
  ChevronDown,
  Copy,
  Check,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { initThemeSync, getStoredThemePref, resolveEffectiveTheme } from '../../../../shared/ui/theme-sync.js';
import { reportHeightToParent } from '../../../../shared/ui/iframe-resize.js';
import { api, auth, decodeProjectRoles } from './api.js';
import { Dashboard } from './components/dashboard/Dashboard.jsx';
import { AutomationSetupWizard, AutomationSetupPending } from './components/setup/AutomationSetupWizard.jsx';
import { EnvironmentView } from './components/environments/EnvironmentView.jsx';
import { ExecutionCenter } from './components/execution/ExecutionCenter.jsx';
import { ComparePage } from './components/execution/ComparePage.jsx';
import { PortalLayout, Sidebar, Topbar } from './components/layout/index.jsx';
import { ReportsCenter } from './components/reports/ReportsCenter.jsx';
import { Placeholder, Modal } from './components/shared/index.jsx';
import { FullScreenLoader } from '../../../../shared/ui/Loader.jsx';
import appLogo from './assets/testrix_logo.png';
import { LogsViewer } from './components/logs/LogsViewer.jsx';
import { ScreenshotsGallery } from './components/screenshots/ScreenshotsGallery.jsx';
import { ExecutionDetailPage } from './components/execution/ExecutionDetailPage.jsx';
import { fallbackSummary, USER_NAV } from './constants.js';

// Attach resolved icon components to nav items (done once at module level)
const ICON_MAP = {
  Gauge, Play, FileText, TerminalSquare, Camera, Globe2,
  LayoutDashboard, KeyRound, GitCompare, Wrench
};
USER_NAV.forEach((item) => { item._icon = ICON_MAP[item.icon]; });

// ── Hash routing ──────────────────────────────────────────────────────────────
// The active tab lives in the URL hash (#/reports) so a page refresh or
// back/forward keeps the user on the tab they were on.
const USER_TAB_KEYS = new Set(USER_NAV.map((item) => item.key));

const parseHashRoute = () => {
  const [head] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { active: USER_TAB_KEYS.has(head) ? head : 'dashboard' };
};

// ── Error Popup Content ───────────────────────────────────────────────────────
// Toast tone palette — success stays the common case; warnings/errors mostly
// surface via the global popup, but toast callers can opt into those tones too.
const TOAST_TONES = {
  success: { bg: '#16a34a', icon: Check },
  warning: { bg: '#d97706', icon: AlertTriangle },
  error: { bg: '#dc2626', icon: AlertTriangle },
};

function ErrorPopupContent({ error, onAction, onClose }) {
  const [showDiag, setShowDiag] = useState(false);
  const [copied, setCopied] = useState(false);

  const status = error.status;

  // Choose icon based on status
  let Icon = AlertTriangle;
  let statusClass = 'error-500';
  if (status === 0) {
    Icon = WifiOff;
    statusClass = 'error-0';
  } else if (status === 401) {
    Icon = Clock;
    statusClass = 'error-401';
  } else if (status === 403) {
    Icon = ShieldAlert;
    statusClass = 'error-403';
  } else if (status === 404) {
    Icon = FileQuestion;
    statusClass = 'error-404';
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(error.detail || error.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="error-popup-container">
      <div className={`error-popup-icon-wrapper ${statusClass}`}>
        <Icon size={32} />
      </div>
      <h3 className="error-popup-title" style={{ margin: '0 0 8px 0' }}>{error.title}</h3>
      <p className="error-popup-message">{error.message}</p>

      {error.detail && (
        <>
          <button
            className={`error-popup-diag-btn ${showDiag ? 'active' : ''}`}
            onClick={() => setShowDiag(!showDiag)}
          >
            Diagnostics Details
            <ChevronDown size={14} />
          </button>

          {showDiag && (
            <div style={{ position: 'relative', width: '100%' }}>
              <button
                onClick={handleCopy}
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: 'var(--text-secondary)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {copied ? <Check size={10} /> : <Copy size={10} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <div className="error-popup-diag-box">
                {error.detail}
              </div>
            </div>
          )}
        </>
      )}

      <div className="error-popup-actions">
        {status === 401 ? (
          <button className="error-popup-btn error-popup-btn-action" onClick={onAction}>
            Sign In Again
          </button>
        ) : (
          <button className="error-popup-btn error-popup-btn-close" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export function App() {
  const [session, setSession] = useState(auth.get());
  const initialRoute = parseHashRoute();
  const [active, setActive] = useState(initialRoute.active);

  const [summary, setSummary] = useState(fallbackSummary);
  const [environments, setEnvironments] = useState([]);
  const [modules, setModules] = useState([]);
  const [executions, setExecutions] = useState([]);
  // True only until the very first executions fetch resolves — lets ExecutionCenter show a
  // loading skeleton instead of its "no executions yet" empty state during that initial window,
  // without flickering back to true on the periodic 10s auto-refresh below.
  const [executionsLoading, setExecutionsLoading] = useState(true);
  // 'checking' | 'needed' | 'done' — whether this project has at least one active Test Engine
  // with its own framework path set. Determined in refresh() below, alongside everything else
  // it already loads on boot.
  const [automationSetup, setAutomationSetup] = useState('checking');
  const isProjectAdmin = useMemo(
    () => decodeProjectRoles(session?.accessToken).includes('PROJECT_ADMIN'),
    [session?.accessToken]
  );
  const [selectedEnv, setSelectedEnv] = useState(1);
  const [selectedModule, setSelectedModule] = useState('LAND');
  const [suiteXmlPath, setSuiteXmlPath] = useState('');
  const [selectedFramework, setSelectedFramework] = useState('MAVEN_TESTNG');
  const [selectedBrowser, setSelectedBrowser] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState('');
  // Toast: { text, tone } — tone is 'success' | 'warning' | 'error'
  const [notice, setNotice] = useState(null);
  const notify = (text, tone = 'success') => setNotice(text ? { text, tone } : null);
  const [selectedExecutionId, setSelectedExecutionId] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    localStorage.getItem('sidebar-collapsed') === 'true'
  );

  const toggleSidebar = () => {
    const nextVal = !isSidebarCollapsed;
    setIsSidebarCollapsed(nextVal);
    localStorage.setItem('sidebar-collapsed', String(nextVal));
  };

  // Apply the saved theme (shared across the whole platform — see

  useEffect(() => {
    initThemeSync();
    const applyBsTheme = (pref) => document.documentElement.setAttribute('data-bs-theme', resolveEffectiveTheme(pref));
    applyBsTheme(getStoredThemePref());
    const onStorage = (event) => {
      if (event.key === 'portal-theme') applyBsTheme(event.newValue || 'light');
    };
    window.addEventListener('storage', onStorage);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onSystemChange = () => { if (getStoredThemePref() === 'system') applyBsTheme('system'); };
    mq?.addEventListener('change', onSystemChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      mq?.removeEventListener('change', onSystemChange);
    };
  }, []);

  // Set favicon once
  useEffect(() => {
    let favicon = document.querySelector("link[rel='icon']");
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = new URL('./assets/testric_favicon.png', import.meta.url).href;
  }, []);

  const [globalError, setGlobalError] = useState(null);

  useEffect(() => {
    api.setErrorCallback((err) => {
      // No session means we're mid-redirect to the Testrix shell's login —
      // don't pop a global error over that.
      if (!session?.accessToken) return;
      setGlobalError(err);
    });
    return () => api.setErrorCallback(null);
  }, [session?.accessToken]);

  // `notice` is a toast, not a permanent header fixture — auto-dismiss it.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  // Keep the URL hash in sync with the active tab.
  useEffect(() => {
    const target = `/${active}`;
    if (window.location.hash !== `#${target}`) {
      window.location.hash = target;
    }
  }, [active]);

  // Browser back/forward (and manual hash edits) drive the tab state.
  useEffect(() => {
    const onHashChange = () => setActive(parseHashRoute().active);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const refresh = async (isInitialLoad = false) => {
    try {
      const [summaryData, envData, moduleData, executionData] = await Promise.all([
        api.dashboardSummary(),
        api.environments(),
        api.modules(),
        api.executions()
      ]);
      setSummary(summaryData);
      setEnvironments(envData);
      setModules(moduleData);
      setExecutions(executionData);
      // A project counts as "set up" once it has at least one Module — true for every legacy
      // project (MPHIDB's real modules all predate Test Engines and still have no
      // testEngineId at all, running on the original shared-checkout path) just as much as for
      // a project onboarded through the wizard. Checking test_engines instead would have wrongly
      // sent MPHIDB's Project Admin back into the wizard despite 31 real, working modules.
      setAutomationSetup((moduleData || []).length > 0 ? 'done' : 'needed');

      if (isInitialLoad) {
        if (envData[0]) setSelectedEnv(envData[0].id);
        if (moduleData[0]) setSelectedModule(moduleData[0].code);
      }
    } catch (error) {

      notify(error.message, 'error');
    }
  };


  const [bootLoader, setBootLoader] = useState(null);

  useEffect(() => {
    if (!session?.accessToken) return;
    setBootLoader('show');
    const startedAt = Date.now();
    refresh(true).finally(() => {
      setExecutionsLoading(false);
      const holdFor = Math.max(0, 1500 - (Date.now() - startedAt));
      setTimeout(() => {
        setBootLoader('exit');
        setTimeout(() => setBootLoader(null), 400);
      }, holdFor);
    });
  }, [session?.accessToken]);


  useEffect(() => {
    if (!session?.accessToken) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 10000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [session?.accessToken]);


  const isEmbedded = window.self !== window.top;

  useEffect(() => {
    if (!isEmbedded) return;
    return reportHeightToParent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageTitle = useMemo(
    () => USER_NAV.find((item) => item.key === active)?.label ?? 'Dashboard',
    [active]
  );

  const onAuthenticated = (nextSession) => {
    auth.set(nextSession);
    setSession(nextSession);

    setGlobalError(null);
    notify('Signed in successfully.');
  };

  const logout = async () => {
    try {
      if (session?.refreshToken) await api.logout(session.refreshToken);
    } finally {
      auth.clear();
      setSession(null);
      setGlobalError(null);
      setActive('dashboard');
    }
  };

  const run = async (executionType, overrideXml = null, overrideModuleCode = null) => {
    try {
      const payload = {
        executionType,
        environmentId: selectedEnv,
        moduleCode: executionType === 'MODULE' ? (overrideModuleCode || selectedModule) : undefined,
        suiteXmlPath: overrideXml || (executionType === 'XML_SUITE' ? suiteXmlPath : undefined),
        framework: selectedFramework,
        requestedBrowser: selectedBrowser || undefined,
        tagFilter: selectedTagFilter || undefined
      };
      const execution = await api.runExecution(payload);
      notify(`${execution.executionCode} queued successfully.`);
      await refresh();
      return execution;
    } catch (error) {
      notify(error.message, 'error');
      throw error;
    }
  };

  if (!session?.accessToken) {

    window.top.location.href = '/';
    return null;
  }



  const pages = (
    <>
      {/* User pages */}
      {active === 'dashboard' && automationSetup === 'needed' && isProjectAdmin && (
        <AutomationSetupWizard onFinish={() => refresh()} />
      )}
      {active === 'dashboard' && automationSetup === 'needed' && !isProjectAdmin && (
        <AutomationSetupPending />
      )}
      {active === 'dashboard' && automationSetup !== 'needed' && (
        <Dashboard onSelectExecution={setSelectedExecutionId} onNavigate={setActive} />
      )}
      {active === 'automation-setup' && isProjectAdmin && (
        <AutomationSetupWizard onFinish={() => { refresh(); setActive('dashboard'); }} />
      )}
      {active === 'execution' && (
        <ExecutionCenter
          environments={environments}
          modules={modules}
          selectedEnv={selectedEnv}
          selectedModule={selectedModule}
          suiteXmlPath={suiteXmlPath}
          selectedFramework={selectedFramework}
          selectedBrowser={selectedBrowser}
          selectedTagFilter={selectedTagFilter}
          setSelectedEnv={setSelectedEnv}
          setSelectedModule={setSelectedModule}
          setSuiteXmlPath={setSuiteXmlPath}
          setSelectedFramework={setSelectedFramework}
          setSelectedBrowser={setSelectedBrowser}
          setSelectedTagFilter={setSelectedTagFilter}
          run={run}
          executions={executions}
          executionsLoading={executionsLoading}
          onSelectExecution={setSelectedExecutionId}
          onRefresh={refresh}
        />
      )}
      {active === 'reports' && <ReportsCenter onSelectExecution={setSelectedExecutionId} />}
      {active === 'logs' && <LogsViewer />}
      {active === 'screenshots' && <ScreenshotsGallery onSelectExecution={setSelectedExecutionId} />}
      {active === 'compare' && <ComparePage executions={executions} modules={modules} />}
      {active === 'environments' && <EnvironmentView onRefresh={refresh} />}
      {selectedExecutionId && (
        <ExecutionDetailPage
          executionId={selectedExecutionId}
          onClose={() => {
            setSelectedExecutionId(null);
            refresh();
          }}
        />
      )}
    </>
  );

  const content = isEmbedded ? (
    <div className="layout-content">{pages}</div>
  ) : (
    <PortalLayout
      isCollapsed={isSidebarCollapsed}
      sidebar={(
        <Sidebar
          active={active}
          setActive={setActive}
          logout={logout}
          isCollapsed={isSidebarCollapsed}
          onToggle={toggleSidebar}
          isProjectAdmin={isProjectAdmin}
        />
      )}
      topbar={(
        <Topbar
          pageTitle={pageTitle}
          onNavigateHome={() => setActive('dashboard')}
        />
      )}
    >
      {pages}
    </PortalLayout>
  );

  return (
    <>
      {content}


      {!isEmbedded && bootLoader && <FullScreenLoader exiting={bootLoader === 'exit'} logoSrc={appLogo} />}

      {notice && (() => {
        const tone = TOAST_TONES[notice.tone] || TOAST_TONES.success;
        const ToneIcon = tone.icon;
        return (
          <div
            role="status"
            style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: tone.bg,
              color: '#ffffff',
              padding: '12px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
            }}
          >
            <span
              style={{
                display: 'grid',
                placeItems: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.25)',
                color: '#ffffff',
                flexShrink: 0,
              }}
            >
              <ToneIcon size={12} strokeWidth={3} />
            </span>
            {notice.text}
            <button
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                padding: '2px',
                marginLeft: '4px',
                opacity: 0.8,
              }}
            >
              ✕
            </button>
          </div>
        );
      })()}

      {globalError && (
        <Modal
          title=""
          onClose={() => {
            if (globalError.status === 401) {
              logout();
            }
            setGlobalError(null);
          }}
        >
          <ErrorPopupContent
            error={globalError}
            onClose={() => {
              if (globalError.status === 401) {
                logout();
              }
              setGlobalError(null);
            }}
            onAction={() => {
              if (globalError.status === 401) {
                logout();
              }
              setGlobalError(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
