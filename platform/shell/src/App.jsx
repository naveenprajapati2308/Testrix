import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, CalendarCheck, CalendarClock, CheckCircle2, Clock,
  Layers, ListTodo, Loader2, Play, Sparkles, Timer, TimerReset, TrendingUp, XCircle, Zap
} from 'lucide-react';
import { api, auth } from './api.js';
import { ADMIN_WORKSPACE_NAV_FLAT, API_TESTING_NAV, AUTOMATION_NAV, PERFORMANCE_NAV, isSuperAdmin } from './constants.js';
import { PortalLayout, Sidebar, Topbar } from './components/layout/index.jsx';
import { AdminSidebar, AdminTopbar, AdminContent, adminPageTitle } from './components/admin/AdminWorkspace.jsx';
import { AutomationWorkspace } from './components/automation/AutomationWorkspace.jsx';
import { ApiTestingWorkspace } from './components/apitesting/ApiTestingWorkspace.jsx';
import { PerformanceWorkspace } from './components/performance/PerformanceWorkspace.jsx';
import { Profile } from './components/profile/Profile.jsx';
import { AuthPage } from './components/auth/AuthPage.jsx';
import { ProjectUserManagement } from './components/team/ProjectUserManagement.jsx';
import { WorkspaceSettings } from './components/team/WorkspaceSettings.jsx';
import { IntegrationGuide } from './components/shared/IntegrationGuide.jsx';
import { KpiTile } from './components/shared/KpiTile.jsx';
import { HealthDot, OverviewCard } from './components/shared/OverviewCard.jsx';
import { AiAssistantPage } from './components/ai/AiAssistantPage.jsx';
import { ExecutionTrendChart } from '../../../shared/ui/dashboard/ExecutionTrendChart.jsx';
import { StatusMixDonut } from '../../../shared/ui/dashboard/StatusMixDonut.jsx';
import { ModuleAnalyticsTable } from '../../../shared/ui/dashboard/ModuleAnalyticsTable.jsx';
import { FullScreenLoader } from '../../../shared/ui/Loader.jsx';
import { useDateRange } from '../../../shared/ui/useDateRange.js';
import { DateRangeFilter } from '../../../shared/ui/DateRangeFilter.jsx';
import { DATE_RANGE_SCOPES, rangeLabel, rangeToDays } from '../../../shared/ui/date-range.js';
import '../../../shared/ui/refreshing.css';
import { DestinationHighlight } from './search/components/DestinationHighlight.jsx';
import { registerAction } from './search/searchActions.js';
import { MODULE_COLOR } from './search/core/searchTypes.js';
import appLogo from './assets/testrix_logo.png';

const authHeader = () => {
  const s = auth.get();
  return s?.accessToken ? { Authorization: `Bearer ${s.accessToken}` } : {};
};

const fetchJson = async (url, headers) => {
  const res = await fetch(url, { headers: { ...authHeader(), ...headers } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};

// ── Hash routing ─────────────────────────────────────────────────────────────
const ADMIN_PAGE_KEYS = new Set(ADMIN_WORKSPACE_NAV_FLAT.map((item) => item.key));
const AUTOMATION_PAGE_KEYS = new Set(AUTOMATION_NAV.map((item) => item.key));
const API_TESTING_PAGE_KEYS = new Set(API_TESTING_NAV.map((item) => item.key));
const PERFORMANCE_PAGE_KEYS = new Set(PERFORMANCE_NAV.map((item) => item.key));

const DEFAULT_ROUTE = { adminPage: 'admin-dashboard', automationPage: 'dashboard', apitestPage: 'dashboard', perfPage: 'dashboard' };

const parseHashRoute = () => {
  const [head, sub] = window.location.hash.replace(/^#\/?/, '').split('/');
  if (head === 'admin') {
    return { ...DEFAULT_ROUTE, page: 'admin', adminPage: ADMIN_PAGE_KEYS.has(sub) ? sub : 'admin-dashboard' };
  }
  if (head === 'automation') {
    return { ...DEFAULT_ROUTE, page: 'automation', automationPage: AUTOMATION_PAGE_KEYS.has(sub) ? sub : 'dashboard' };
  }
  if (head === 'apitest') {
    return { ...DEFAULT_ROUTE, page: 'apitest', apitestPage: API_TESTING_PAGE_KEYS.has(sub) ? sub : 'dashboard' };
  }
  if (head === 'perf') {
    return { ...DEFAULT_ROUTE, page: 'perf', perfPage: PERFORMANCE_PAGE_KEYS.has(sub) ? sub : 'dashboard' };
  }
  if (head === 'profile') {
    return { ...DEFAULT_ROUTE, page: 'profile' };
  }
  if (head === 'team') {
    return { ...DEFAULT_ROUTE, page: 'team' };
  }
  if (head === 'workspace-settings') {
    return { ...DEFAULT_ROUTE, page: 'workspace-settings' };
  }
  if (head === 'documentation') {
    return { ...DEFAULT_ROUTE, page: 'documentation' };
  }
  if (head === 'ai-assistant') {
    return { ...DEFAULT_ROUTE, page: 'ai-assistant' };
  }
  return { ...DEFAULT_ROUTE, page: 'dashboard' };
};

function Stat({ label, value, tone }) {
  return (
    <div className="stat">
      <div className={`stat-value ${tone || ''}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// ── Dashboard: an accuracy/pass-rate bar cell, shared by both module tables ──
function AccuracyCell({ rate }) {
  const pct = rate ?? 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontWeight: 800, minWidth: 34 }}>{pct}%</span>
      <div className="module-health-meter"><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// ── Dashboard: per-module execution counts (API Testing) — same table system ──
function ApiModuleStatsTable({ modules }) {
  const top = modules.slice(0, 5);
  if (!top.length) return <p className="panel-empty">No module activity yet.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Module</th>
          <th>Executions</th>
          <th>Passed</th>
          <th>Failed</th>
          <th>Accuracy</th>
        </tr>
      </thead>
      <tbody>
        {top.map((m) => {
          const total = (m.passed ?? 0) + (m.failed ?? 0);
          const passRate = total > 0 ? Math.round((m.passed / total) * 100) : 0;
          return (
            <tr key={m.moduleId}>
              <td>{m.moduleName}</td>
              <td>{m.executions}</td>
              <td style={{ color: 'var(--success-text)', fontWeight: 700 }}>{m.passed ?? 0}</td>
              <td style={{ color: 'var(--danger-text)', fontWeight: 700 }}>{m.failed ?? 0}</td>
              <td><AccuracyCell rate={passRate} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Dashboard: HTTP status-class mix (API Testing) ──────────────────────────
function chipTone(cls) {
  if (cls === '2xx' || cls === '3xx') return 'good';
  if (cls === '4xx' || cls === '5xx' || cls === 'ERROR' || cls === 'TIMEOUT') return 'bad';
  return 'neutral';
}

function formatWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

// API Testing's trend endpoint returns { date, passed, failed } — reshape to a superset
// shape (extra fields are simply ignored by the shared ExecutionTrendChart, which only
// reads `date`/`label` plus whichever series keys it's given).
function toTrendChartData(points) {
  return (points || []).map((p) => {
    const passed = p.passed ?? 0;
    const failed = p.failed ?? 0;
    return {
      date: p.date,
      totalTests: passed + failed,
      passed,
      failed,
      skipped: 0,
      execCount: passed + failed
    };
  });
}

export default function App() {
  const [authed, setAuthed] = useState(null);
  // user/session are recomputed from auth.get() on every render, but React only re-renders on
  // its own state change — so this has to move too, or the topbar keeps the stale cached user.
  const [sessionTick, setSessionTick] = useState(0);
  const updateSessionUser = (patch) => {
    const current = auth.get();
    if (!current) return;
    auth.set({ ...current, user: { ...current.user, ...patch } });
    setSessionTick((t) => t + 1);
  };
  const [health, setHealth] = useState({});
  const [autoSummary, setAutoSummary] = useState(null);
  const [autoTrends, setAutoTrends] = useState(null);
  const [autoModuleHealth, setAutoModuleHealth] = useState(null);
  const [autoModules, setAutoModules] = useState([]);
  const [autoFrameworks, setAutoFrameworks] = useState([]);
  const [autoEnvironments, setAutoEnvironments] = useState([]);
  const [autoSelectedFramework, setAutoSelectedFramework] = useState('');
  const [autoSelectedEnvId, setAutoSelectedEnvId] = useState('');
  const [autoEnvSupportedModules, setAutoEnvSupportedModules] = useState(null);
  const [apiSummary, setApiSummary] = useState(null);
  const [apiTrend, setApiTrend] = useState(null);
  const [perfSummary, setPerfSummary] = useState(null);
  const [perfTrend, setPerfTrend] = useState(null);
  const [recentActivity, setRecentActivity] = useState(null);
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);
  const [range, setRange] = useDateRange(DATE_RANGE_SCOPES.GLOBAL, '7d');
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);

  const initialRoute = parseHashRoute();
  const [page, setPage] = useState(initialRoute.page);
  const [adminPage, setAdminPage] = useState(initialRoute.adminPage);
  const [automationPage, setAutomationPage] = useState(initialRoute.automationPage);
  const [apitestPage, setApitestPage] = useState(initialRoute.apitestPage);
  const [perfPage, setPerfPage] = useState(initialRoute.perfPage);
  const [notice, setNoticeState] = useState(null);
  const notify = (text, tone = 'success') => setNoticeState(text ? { text, tone } : null);
  const [adminNotice, setAdminNotice] = useState('Administration workspace — Super Admin only.');

  const [chatMessages, setChatMessages] = useState([
    { id: 1, from: 'bot', text: 'Hi! I am the Testrix AI assistant. Ask me anything about your testing platform.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  // ── Search navigation state ─────────────────────────────────────────────
  const [searchNavLoading, setSearchNavLoading] = useState(false);
  const [destHighlight, setDestHighlight] = useState({ active: false, color: '#60b3e0' });

  useEffect(() => {
    const s = auth.get();
    if (!s?.accessToken) {
      setAuthed(false);
      return;
    }
    // api.me() already hits the platform auth service (PLATFORM_BASE) and retries once via
    // refreshSession() on a 401 — reusing it here instead of a second hand-rolled fetch avoids
    // drifting out of sync with where auth actually lives (it moved out of automation-portal
    // into platform/backend; a stale duplicate here previously logged everyone out on refresh).
    api.me()
      .then(() => setAuthed(true))
      .catch(() => {
        auth.clear();
        setAuthed(false);
      });
  }, []);

  const forceLogout = () => {
    auth.clear();
    setAuthed(false);
    window.location.hash = '';
  };

  useEffect(() => {
    // Super Admin has no project context, so these project-scoped calls can only 403 — skip them
    // rather than firing a round of guaranteed failures on every login. Gating on the role and
    // not on `page` is deliberate: the Global Dashboard is the catch-all render branch, so any
    // page value it falls through on would otherwise leave its data null and its loader spinning.
    if (!authed || isSuperAdmin(auth.get())) return;
    fetch('/health/automation').then((r) => setHealth((h) => ({ ...h, automation: r.ok ? 'up' : 'down' }))).catch(() => setHealth((h) => ({ ...h, automation: 'down' })));
    fetch('/health/apitest').then((r) => setHealth((h) => ({ ...h, apitest: r.ok ? 'up' : 'down' }))).catch(() => setHealth((h) => ({ ...h, apitest: 'down' })));
    fetch('/health/genai').then((r) => setHealth((h) => ({ ...h, genai: r.ok ? 'up' : 'down' }))).catch(() => setHealth((h) => ({ ...h, genai: 'down' })));
    fetch('/health/perf').then((r) => setHealth((h) => ({ ...h, perf: r.ok ? 'up' : 'down' }))).catch(() => setHealth((h) => ({ ...h, perf: 'down' })));

    // Returns a reason string instead of throwing, so a batch of parallel fetches can report
    // what actually failed. This effect used to swallow every error, which is how a real backend
    // bug went unnoticed until someone opened DevTools.
    const loadSummary = async (url, setter) => {
      try {
        const res = await fetch(url, { headers: authHeader() });
        if (res.status === 401) { forceLogout(); return null; }
        if (!res.ok) {
          let reason = `HTTP ${res.status}`;
          try { const body = await res.json(); reason = body.message || reason; } catch { /* non-JSON error body */ }
          throw new Error(reason);
        }
        const body = await res.json();
        // Both summary endpoints wrap their payload in { success, message, data }. Storing the
        // envelope silently rendered every stat as its ?? 0 fallback for months.
        setter(body.data ?? body);
        return null;
      } catch (err) {
        setter(null);
        return err.message;
      }
    };

    // Every range-aware fetch is keyed on `range` and fired as one refresh rather than each
    // widget polling independently. `days` is API Testing's translation of that same token.
    const days = rangeToDays(range);
    let cancelled = false;
    (async () => {
      setDashboardRefreshing(true);
      try {
        const results = await Promise.allSettled([
          loadSummary(`/automation/api/dashboard/summary?range=${range}`, setAutoSummary),
          loadSummary(`/automation/api/dashboard/trends?range=${range}`, setAutoTrends),
          loadSummary(`/apitest/api/v1/dashboard/summary?days=${days}`, setApiSummary),
          loadSummary(`/apitest/api/v1/dashboard/trend?days=${days}`, setApiTrend),
          loadSummary(`/perf/api/v1/dashboard/stats?range=${range}`, setPerfSummary),
          loadSummary(`/perf/api/v1/dashboard/trend?range=${range}`, setPerfTrend),
          // Goes through api.js — its own failure already surfaces via the global
          // api.setErrorCallback handler, so it doesn't need to feed `reasons` below.
          api.dashboardRecentActivity().then((rows) => setRecentActivity(rows.slice(0, 5))).catch(() => setRecentActivity(null)),
        ]);
        if (!cancelled) {
          // Only loadSummary's raw fetch() results land here — those bypass api.js entirely,
          // so they're the one path the global error callback above can't already cover.
          const reasons = [...new Set(results.slice(0, 6).map((r) => (r.status === 'fulfilled' ? r.value : r.reason?.message)).filter(Boolean))];
          if (reasons.length === 1) notify(`Dashboard: ${reasons[0]}`, 'error');
          else if (reasons.length > 1) notify(`Dashboard: some data couldn't load (${reasons.length} issues) — see console for details`, 'error');
          if (reasons.length > 1) console.warn('Dashboard load issues:', reasons);
        }
      } finally {
        if (!cancelled) setDashboardRefreshing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authed, range]);

  // Automation Module Analytics: modules/frameworks/environments feed the reusable
  // ModuleAnalyticsTable (same component the Automation product's own Overview page uses) —
  // fetched once on login rather than every range change, since they rarely change.
  useEffect(() => {
    if (!authed || isSuperAdmin(auth.get())) return;
    // Failures here already surface via the global api.setErrorCallback handler above (these
    // all go through api.js's request()/unwrap(), unlike the raw fetch() calls further up) —
    // just fall back to an empty list so the analytics table renders empty, not broken.
    api.modules().then((list) => setAutoModules(Array.isArray(list) ? list : [])).catch(() => setAutoModules([]));
    api.frameworks().then((list) => setAutoFrameworks(Array.isArray(list) ? list : [])).catch(() => setAutoFrameworks([]));
    api.environments().then((list) => setAutoEnvironments(Array.isArray(list) ? list : [])).catch(() => setAutoEnvironments([]));
  }, [authed]);

  // Module health is scoped to the selected environment (backend groups by moduleCode +
  // framework + environmentId), so it's refetched on its own whenever the range or the table's
  // own Environment filter changes, without re-firing every other dashboard widget's fetch.
  const refreshAutoModuleHealth = () => {
    if (!authed || isSuperAdmin(auth.get())) return;
    // Failure already surfaces via the global api.setErrorCallback handler above.
    api.dashboardModuleHealth(range, autoSelectedEnvId || undefined)
      .then((data) => setAutoModuleHealth(Array.isArray(data) ? data : []))
      .catch(() => setAutoModuleHealth(null));
  };
  useEffect(() => {
    refreshAutoModuleHealth();
  }, [authed, range, autoSelectedEnvId]);

  // Which modules are enabled for the selected environment (single source of truth via the
  // Module<->Environment mapping) — mirrors the Automation product's own Overview page.
  useEffect(() => {
    if (!autoSelectedEnvId) { setAutoEnvSupportedModules(null); return; }
    let cancelled = false;
    api.environmentModules(autoSelectedEnvId)
      .then((list) => { if (!cancelled) setAutoEnvSupportedModules(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setAutoEnvSupportedModules([]); });
    return () => { cancelled = true; };
  }, [autoSelectedEnvId]);

  const autoAvailableInEnv = (m) => {
    if (!autoSelectedEnvId) return true;
    if (autoEnvSupportedModules === null) return false;
    return autoEnvSupportedModules.some((sm) => sm.code === m.code && sm.runnerType === m.runnerType);
  };

  const autoHealthByKey = useMemo(() => {
    const map = new Map();
    for (const h of autoModuleHealth || []) {
      map.set(`${h.moduleCode}::${h.framework}`, {
        total: h.totalTests ?? h.total ?? 0,
        passed: h.passed ?? 0,
        failed: h.failed ?? 0,
        skipped: h.skipped ?? 0,
        accuracy: h.passRate ?? 0
      });
    }
    return map;
  }, [autoModuleHealth]);

  const runAutoModule = async (mod) => {
    await api.runExecution({
      executionType: 'MODULE',
      environmentId: Number(autoSelectedEnvId),
      moduleCode: mod.code,
      framework: mod.runnerType
    });
    refreshAutoModuleHealth();
  };

  const runAllAutoForParent = async (parent, children) => {
    for (const child of children) {
      await api.runExecution({
        executionType: 'MODULE',
        environmentId: Number(autoSelectedEnvId),
        moduleCode: child.code,
        framework: child.runnerType
      });
    }
    refreshAutoModuleHealth();
  };

  // request() clears localStorage on a 401 but cannot reset this component's `authed` state,
  // so wire it here — otherwise a dead session leaves a stale, broken page on screen.
  useEffect(() => {
    api.setErrorCallback(({ status, title, message }) => {
      if (status === 401) { forceLogout(); return; }
      // unwrap() already computes a title+message for 403/404/500+, but this callback only ever
      // acted on 401, so every other failure was swallowed with nothing shown on screen.
      notify(`${title}: ${message}`, 'error');
    });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNoticeState(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  // The shell is the only scroll container (product iframes auto-size instead of scrolling).
  // Tab switches swap content in place, so the browser never resets scroll on its own.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, adminPage, automationPage, apitestPage, perfPage]);

  // Nav clicks push history entries, but nothing listened for the reverse direction, so
  // back/forward changed the URL without changing the screen. Re-parse on every hashchange.
  useEffect(() => {
    const onHashChange = () => {
      const r = parseHashRoute();
      setPage(r.page);
      setAdminPage(r.adminPage);
      setAutomationPage(r.automationPage);
      setApitestPage(r.apitestPage);
      setPerfPage(r.perfPage);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Super Admin never works inside a project workspace, so a stale non-admin hash (old bookmark,
  // leftover history entry) is corrected back to Admin rather than flashing workspace content.
  useEffect(() => {
    if (!authed) return;
    if (isSuperAdmin(auth.get()) && page !== 'admin' && page !== 'profile') {
      setPage('admin');
      window.location.hash = `#/admin/${ADMIN_PAGE_KEYS.has(adminPage) ? adminPage : 'admin-dashboard'}`;
    }
  }, [authed, page]);

  // ── Register search action handlers ────────────────────────────────────────
  // Must live here (before the early returns) to satisfy Rules of Hooks.
  // Guards on authed so actions are only registered for a logged-in session.
  useEffect(() => {
    if (!authed) return;
    registerAction('auto-run', () => setAutomationPage('execution'));
    registerAction('api-create', () => { setApitestPage('regular-apis'); setPage('apitest'); });
    registerAction('api-schedule-create', () => { setApitestPage('scheduler'); setPage('apitest'); });
    registerAction('admin-create-user', () => { setPage('admin'); setAdminPage('user-management'); });
  }, [authed]);

  // ── Document title sync ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!authed) return;
    const title = page === 'admin'
      ? adminPageTitle(adminPage)
      : page === 'automation'
        ? (automationPage === 'dashboard' ? 'Automation Overview' : (AUTOMATION_NAV.find((i) => i.key === automationPage)?.label ?? 'Automation'))
        : page === 'apitest'
          ? (apitestPage === 'dashboard' ? 'API Testing Overview' : (API_TESTING_NAV.find((i) => i.key === apitestPage)?.label ?? 'API Testing'))
          : page === 'perf'
            ? (perfPage === 'dashboard' ? 'Performance Overview' : (PERFORMANCE_NAV.find((i) => i.key === perfPage)?.label ?? 'Performance'))
            : page === 'profile' ? 'Profile' : 'Dashboard';

    document.title = title ? `${title} | TESTRIX` : 'TESTRIX Unified Testing Platform';
  }, [authed, page, adminPage, automationPage, apitestPage, perfPage]);

  if (authed === null) return <FullScreenLoader logoSrc={appLogo} subtitle="Loading TESTRIX" />;
  if (!authed) {
    return <AuthPage onAuthenticated={(nextSession) => { auth.set(nextSession); setAuthed(true); }} />;
  }

  const session = auth.get();
  const user = session?.user;
  const superAdmin = isSuperAdmin(session);

  const goDashboard = () => {
    setPage('dashboard');
    window.location.hash = '';
  };

  const goProfile = () => {
    setPage('profile');
    window.location.hash = '#/profile';
  };

  const goTeam = () => {
    setPage('team');
    window.location.hash = '#/team';
  };

  const goWorkspaceSettings = () => {
    setPage('workspace-settings');
    window.location.hash = '#/workspace-settings';
  };

  const goDocumentation = () => {
    setPage('documentation');
    window.location.hash = '#/documentation';
  };

  const goAiAssistant = () => {
    setPage('ai-assistant');
    window.location.hash = '#/ai-assistant';
  };

  // Lets the AI Assistant's result cards jump straight to the real page a search
  // hit lives on, reusing the same product nav setters every other entry point uses.
  const navigateToProduct = (product, sub) => {
    if (product === 'automation') setAutomationPageAndHash(sub);
    else if (product === 'api-testing') setApitestPageAndHash(sub);
    else if (product === 'performance') setPerfPageAndHash(sub);
  };

  const setAdminPageAndHash = (nextAdminPage) => {
    setAdminPage(nextAdminPage);
    window.location.hash = `#/admin/${nextAdminPage}`;
  };

  const setAutomationPageAndHash = (nextAutomationPage) => {
    setAutomationPage(nextAutomationPage);
    setPage('automation');
    window.location.hash = `#/automation/${nextAutomationPage}`;
  };

  const setApitestPageAndHash = (nextApitestPage) => {
    setApitestPage(nextApitestPage);
    setPage('apitest');
    window.location.hash = `#/apitest/${nextApitestPage}`;
  };

  const setPerfPageAndHash = (nextPerfPage) => {
    setPerfPage(nextPerfPage);
    setPage('perf');
    window.location.hash = `#/perf/${nextPerfPage}`;
  };

  const logout = () => {
    api.logout(session?.refreshToken).catch(() => { });
    forceLogout();
  };

  // ── Search navigation ───────────────────────────────────────────────────
  // Called by GlobalSearchDropdown when user selects a result.
  const navigateFromSearch = (item) => {
    const { nav, permission, disabled } = item;
    if (disabled) return;
    if (permission === 'SUPER_ADMIN' && !superAdmin) return;
    // Super Admin lives exclusively in the Admin Workspace (docs/version2.2.md isolation) — a
    // stale/irrelevant search result pointing into a workspace product must not navigate them.
    if (superAdmin && nav.page !== 'admin' && nav.page !== 'profile') return;

    setSearchNavLoading(true);
    const color = MODULE_COLOR[nav.page] || '#60b3e0';

    setTimeout(() => {
      setSearchNavLoading(false);

      if (nav.page === 'dashboard') goDashboard();
      else if (nav.page === 'automation') setAutomationPageAndHash(nav.sub);
      else if (nav.page === 'apitest') setApitestPageAndHash(nav.sub);
      else if (nav.page === 'perf') setPerfPageAndHash(nav.sub);
      else if (nav.page === 'admin' && superAdmin) {
        setPage('admin');
        setAdminPageAndHash(nav.sub);
      }
      else if (nav.page === 'profile') goProfile();

      if (nav.anchor) {
        requestAnimationFrame(() => {
          document.getElementById(nav.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }

      setDestHighlight({ active: true, color });
    }, 800);
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatInput('');
    setChatMessages((m) => [...m, { id: Date.now(), from: 'user', text }]);
    setChatBusy(true);
    try {
      const r = await fetch('/genai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ message: text, userId: user?.username || 'testrix' })
      });
      const data = await r.json();
      setChatMessages((m) => [...m, { id: Date.now() + 1, from: 'bot', text: data.message || 'No response.', toolResults: data.toolResults || [] }]);
    } catch {
      setChatMessages((m) => [...m, { id: Date.now() + 1, from: 'bot', text: 'AI service is unreachable right now. Please try again.' }]);
    } finally {
      setChatBusy(false);
    }
  };


  const MODULE_CONFIG = {
    automation: { label: 'Automation', nav: AUTOMATION_NAV, activeSubPage: automationPage, goOverview: () => setAutomationPageAndHash('dashboard') },
    apitest: { label: 'API Testing', nav: API_TESTING_NAV, activeSubPage: apitestPage, goOverview: () => setApitestPageAndHash('dashboard') },
    perf: { label: 'Performance', nav: PERFORMANCE_NAV, activeSubPage: perfPage, goOverview: () => setPerfPageAndHash('dashboard') },
  };

  let pageTitle = 'Dashboard';
  let breadcrumbItems = [
    { label: 'Home', onClick: goDashboard },
    { label: 'Dashboard' }
  ];

  if (page === 'admin') {
    const subLabel = adminPageTitle(adminPage);
    pageTitle = subLabel;
    breadcrumbItems = [
      { label: 'Home', onClick: goDashboard },
      { label: 'Administration', onClick: () => setAdminPageAndHash('admin-dashboard') },
      { label: subLabel }
    ];
  } else if (page === 'profile') {
    pageTitle = 'Profile';
    breadcrumbItems = [
      { label: 'Home', onClick: goDashboard },
      { label: 'Profile' }
    ];
  } else if (page === 'team') {
    pageTitle = 'Team Management';
    breadcrumbItems = [
      { label: 'Home', onClick: goDashboard },
      { label: 'Team Management' }
    ];
  } else if (page === 'workspace-settings') {
    pageTitle = 'Workspace Settings';
    breadcrumbItems = [
      { label: 'Home', onClick: goDashboard },
      { label: 'Workspace Settings' }
    ];
  } else if (page === 'documentation') {
    pageTitle = 'Documentation';
    breadcrumbItems = [
      { label: 'Home', onClick: goDashboard },
      { label: 'Documentation' }
    ];
  } else if (page === 'ai-assistant') {
    pageTitle = 'AI Assistant';
    breadcrumbItems = [
      { label: 'Home', onClick: goDashboard },
      { label: 'AI Assistant' }
    ];
  } else if (MODULE_CONFIG[page]) {
    const { label: moduleLabel, nav, activeSubPage, goOverview } = MODULE_CONFIG[page];
    const sub = nav.find((i) => i.key === activeSubPage);
    const subLabel = sub ? sub.label : 'Overview';
    pageTitle = activeSubPage === 'dashboard' ? `${moduleLabel} Overview` : subLabel;
    breadcrumbItems = [
      { label: 'Home', onClick: goDashboard },
      { label: moduleLabel, onClick: goOverview },
      { label: subLabel }
    ];
  }

  const apiTrendPoints = toTrendChartData(apiTrend);

  
  const dashboardLoading = authed && autoSummary === null && apiSummary === null;

  const dashboardContent = (
    <div className={!dashboardLoading && dashboardRefreshing ? 'dr-refreshing' : ''}>
      <p className="dash-subtitle">Testrix the ultimate testing platform for better development and testing.</p>

      <section className="cards overview-cards">
        <OverviewCard
          icon={Play}
          tone="accent"
          label="Automation"
          health={health.automation}
          kpiValue={autoSummary ? autoSummary.totalExecutions ?? 0 : '—'}
          kpiLabel="Executions"
          summary={autoSummary
            ? `${autoSummary.passRate ?? 0}% pass rate · ${autoSummary.runningExecutions ?? 0} running`
            : 'Stats unavailable'}
          onSeeMore={() => setAutomationPageAndHash('dashboard')}
        />
        <OverviewCard
          icon={Zap}
          tone="info"
          label="API Testing"
          health={health.apitest}
          kpiValue={apiSummary ? apiSummary.totalExecutions ?? 0 : '—'}
          kpiLabel="API Executions"
          summary={apiSummary
            ? `${Math.round(apiSummary.successRate ?? 0)}% success · ${apiSummary.activeSchedules ?? 0} active schedules`
            : 'Stats unavailable'}
          onSeeMore={() => setApitestPageAndHash('dashboard')}
        />
        <OverviewCard
          icon={TimerReset}
          tone="success"
          label="Performance"
          health={health.perf}
          kpiValue={perfSummary ? perfSummary.totalRuns ?? 0 : '—'}
          kpiLabel="Test Runs"
          summary={perfSummary
            ? `${perfSummary.totalRuns > 0 ? Math.round((perfSummary.passedRuns / perfSummary.totalRuns) * 100) : 0}% pass rate · ${perfSummary.runningRuns ?? 0} running`
            : 'Stats unavailable'}
          onSeeMore={() => setPerfPageAndHash('dashboard')}
        />
        <OverviewCard
          icon={Sparkles}
          tone="warning"
          label="AI Support"
          health={health.genai}
          kpiValue={health.genai === 'up' ? 'Online' : 'Offline'}
          kpiLabel="Assistant status"
          summary="Chat assistant for the whole platform."
        />
      </section>

      <section className="product-overview">
        <div className="panel-title"><Play size={16} /> Automation Overview <HealthDot state={health.automation} /></div>
        {autoSummary ? (
          <>
            <div className="kpi-row">
              <KpiTile icon={Play} tone="accent" value={autoSummary.totalExecutions ?? 0} label="Total Executions" />
              <KpiTile icon={CheckCircle2} tone="success" value={`${autoSummary.passRate ?? 0}%`} label="Pass Rate" />
              <KpiTile icon={XCircle} tone="danger" value={`${autoSummary.failRate ?? 0}%`} label="Fail Rate" />
              <KpiTile icon={Loader2} tone="info" value={autoSummary.runningExecutions ?? 0} label="Running" />
              <KpiTile icon={ListTodo} tone="warning" value={autoSummary.queuedExecutions ?? 0} label="Queued" />
              <KpiTile icon={Timer} tone="accent" value={`${autoSummary.averageDuration ?? 0}s`} label="Avg Duration" />
            </div>

            <div className="panel-row">
              <StatusMixDonut
                title="Execution Status Mix"
                segments={[
                  { key: 'passed', label: 'Passed', value: autoSummary.passedTests ?? 0, color: '--success-text' },
                  { key: 'failed', label: 'Failed', value: autoSummary.failedTests ?? 0, color: '--danger-text' },
                  { key: 'skipped', label: 'Skipped', value: autoSummary.skippedTests ?? 0, color: '--warning-text' },
                ]}
                centerLabel="Total"
              />
              <div className="panel-box">
                <div className="mini-block-title">Run Summary</div>
                <div className="tile-row">
                  <div className="tile">
                    <div className="tile-icon kpi-icon-accent"><Clock size={15} /></div>
                    <div className="tile-value">{autoSummary.lastExecutionStatus ?? '—'}</div>
                    <div className="tile-label">Last Run</div>
                  </div>
                  <div className="tile">
                    <div className="tile-icon kpi-icon-info"><Layers size={15} /></div>
                    <div className="tile-value">{autoModuleHealth?.length ?? 0}</div>
                    <div className="tile-label">Modules Tracked</div>
                  </div>
                  <div className="tile">
                    <div className="tile-icon kpi-icon-success"><CalendarCheck size={15} /></div>
                    <div className="tile-value">{recentActivity?.length ?? 0}</div>
                    <div className="tile-label">Recent Runs</div>
                  </div>
                </div>
              </div>
            </div>

            {autoTrends && autoTrends.length > 0 && (
              <ExecutionTrendChart
                className="mini-block-spaced"
                title={`Execution Trend (${rangeLabel(range)})`}
                data={autoTrends}
                series={[
                  { key: 'passed', label: 'Passed', color: '--success-text' },
                  { key: 'failed', label: 'Failed', color: '--danger-text' },
                  { key: 'skipped', label: 'Skipped', color: '--warning-text' },
                ]}
              />
            )}

            <div className="mini-block">
              <ModuleAnalyticsTable
                title="Module Analytics"
                icon={Layers}
                modules={autoModules}
                healthByKey={autoHealthByKey}
                frameworks={autoFrameworks}
                environments={autoEnvironments}
                selectedFramework={autoSelectedFramework}
                onFrameworkChange={setAutoSelectedFramework}
                selectedEnvironmentId={autoSelectedEnvId}
                onEnvironmentChange={setAutoSelectedEnvId}
                isModuleAvailable={autoAvailableInEnv}
                onRunModule={runAutoModule}
                onRunAllForParent={runAllAutoForParent}
              />
            </div>
          </>
        ) : <p className="panel-empty">Automation stats unavailable.</p>}
      </section>

      <section className="product-overview">
        <div className="panel-title"><Zap size={16} /> API Testing Overview <HealthDot state={health.apitest} /></div>
        {apiSummary ? (
          <>
            <div className="kpi-row">
              <KpiTile icon={Zap} tone="accent" value={apiSummary.totalExecutions ?? 0} label="Executions" />
              <KpiTile icon={CheckCircle2} tone="success" value={`${Math.round(apiSummary.successRate ?? 0)}%`} label="Success Rate" />
              <KpiTile icon={Layers} tone="info" value={apiSummary.totalRegularApis ?? 0} label="Total APIs" />
              <KpiTile icon={XCircle} tone="danger" value={apiSummary.failed ?? 0} label="Failed APIs" />
              <KpiTile icon={Timer} tone="accent" value={`${Math.round(apiSummary.avgDurationMs ?? 0)}ms`} label="Avg Response" />
              <KpiTile icon={CalendarClock} tone="warning" value={apiSummary.activeSchedules ?? 0} label="Active Schedules" />
            </div>

            <div className="panel-row">
              <div className="panel-box">
                <div className="mini-block-title">Response Status Mix ({rangeLabel(range)})</div>
                {apiSummary.statusClassBreakdown ? (
                  <div className="status-tile-row">
                    {Object.entries(apiSummary.statusClassBreakdown).map(([cls, count]) => {
                      const tone = chipTone(cls);
                      const bg = tone === 'good' ? 'var(--success-bg-soft)' : tone === 'bad' ? 'var(--danger-bg-soft)' : 'var(--bg-surface-2)';
                      const fg = tone === 'good' ? 'var(--success-text)' : tone === 'bad' ? 'var(--danger-text)' : 'var(--text-primary)';
                      return (
                        <div key={cls} className="status-tile" style={{ background: bg }}>
                          <span className="status-tile-value" style={{ color: fg }}>{count}</span>
                          <span className="status-tile-label">{cls}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="panel-empty">No response data yet.</p>}
              </div>
              <div className="panel-box">
                <div className="mini-block-title">Scheduling Overview</div>
                <div className="tile-row">
                  <div className="tile">
                    <div className="tile-icon kpi-icon-info"><CalendarClock size={15} /></div>
                    <div className="tile-value">{apiSummary.totalSchedules ?? 0}</div>
                    <div className="tile-label">Total Schedules</div>
                  </div>
                  <div className="tile">
                    <div className="tile-icon kpi-icon-warning"><AlertTriangle size={15} /></div>
                    <div className="tile-value">{apiSummary.failingSchedules?.length ?? 0}</div>
                    <div className="tile-label">Failing Schedules</div>
                  </div>
                </div>
                {apiSummary.nextRuns?.[0] && (
                  <div className="panel-subrow" style={{ marginTop: 10 }}>
                    <span className="panel-subrow-label"><Clock size={12} /> Next run</span>
                    <span className="panel-subrow-value" title={apiSummary.nextRuns[0].name}>
                      {apiSummary.nextRuns[0].name} · {formatWhen(apiSummary.nextRuns[0].nextRunAt)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <ExecutionTrendChart
              className="mini-block-spaced"
              title={`Execution Trend (${rangeLabel(range)})`}
              data={apiTrendPoints}
              series={[
                { key: 'passed', label: 'Passed', color: '--success-text' },
                { key: 'failed', label: 'Failed', color: '--danger-text' },
              ]}
              emptyMessage="No trend data yet."
            />

            {apiSummary.moduleStats && apiSummary.moduleStats.length > 0 && (
              <div className="mini-block">
                <div className="mini-block-title">Module Summary</div>
                <ApiModuleStatsTable modules={apiSummary.moduleStats} />
              </div>
            )}
          </>
        ) : <p className="panel-empty">API Testing stats unavailable.</p>}
      </section>

      <section className="product-overview">
        <div className="panel-title"><TimerReset size={16} /> Performance Testing Overview <HealthDot state={health.perf} /></div>
        {perfSummary ? (
          <>
            <div className="kpi-row">
              <KpiTile icon={Activity} tone="accent" value={perfSummary.totalRuns ?? 0} label="Total Runs" />
              <KpiTile icon={CheckCircle2} tone="success" value={`${perfSummary.totalRuns > 0 ? Math.round((perfSummary.passedRuns / perfSummary.totalRuns) * 100) : 0}%`} label="Pass Rate" />
              <KpiTile icon={XCircle} tone="danger" value={perfSummary.failedRuns ?? 0} label="Failed Runs" />
              <KpiTile icon={Loader2} tone="info" value={perfSummary.runningRuns ?? 0} label="Running" />
              <KpiTile icon={Zap} tone="accent" value={perfSummary.performanceTestCount ?? 0} label="Perf Tests" />
              <KpiTile icon={TrendingUp} tone="warning" value={perfSummary.loadTestCount ?? 0} label="Load Tests" />
            </div>

            <div className="panel-row">
              <StatusMixDonut
                title="Run Status Mix"
                segments={[
                  { key: 'passed', label: 'Passed', value: perfSummary.passedRuns ?? 0, color: '--success-text' },
                  { key: 'failed', label: 'Failed', value: perfSummary.failedRuns ?? 0, color: '--danger-text' },
                  { key: 'running', label: 'Running', value: perfSummary.runningRuns ?? 0, color: '--accent-text' },
                ]}
                centerLabel="Total"
              />
              <div className="panel-box">
                <div className="mini-block-title">Suite Summary</div>
                <div className="tile-row">
                  <div className="tile">
                    <div className="tile-icon kpi-icon-info"><Layers size={15} /></div>
                    <div className="tile-value">{perfSummary.testGroupCount ?? 0}</div>
                    <div className="tile-label">Test Groups</div>
                  </div>
                  <div className="tile">
                    <div className="tile-icon kpi-icon-warning"><CalendarClock size={15} /></div>
                    <div className="tile-value">{perfSummary.scheduledCount ?? 0}</div>
                    <div className="tile-label">Active Schedules</div>
                  </div>
                </div>
              </div>
            </div>

            {perfTrend && perfTrend.length > 0 && (
              <ExecutionTrendChart
                className="mini-block-spaced"
                title={`Execution Trend (${rangeLabel(range)})`}
                data={perfTrend}
                series={[
                  { key: 'passed', label: 'Passed', color: '--success-text' },
                  { key: 'failed', label: 'Failed', color: '--danger-text' },
                ]}
              />
            )}
          </>
        ) : <p className="panel-empty">Performance stats unavailable.</p>}
      </section>
    </div>
  );

  const notifications = [
    { id: 1, title: 'Execution Completed', message: 'A suite run finished successfully.', time: '5m ago', unread: true },
    { id: 2, title: 'AI Assistant', message: 'Testrix AI assistant is online and ready.', time: '1h ago', unread: false }
  ];

  return (
    <>
      <PortalLayout
        isCollapsed={superAdmin ? false : isSidebarCollapsed}
        shellClassName={superAdmin ? 'admin-shell' : ''}
        mainClassName={superAdmin ? 'admin-main' : ''}
        sidebar={superAdmin ? (
          <AdminSidebar
            activePage={adminPage}
            onNavigate={setAdminPageAndHash}
            logout={logout}
          />
        ) : (
          <Sidebar
            active={page}
            activeChildKey={page === 'automation' ? automationPage : page === 'apitest' ? apitestPage : page === 'perf' ? perfPage : null}
            logout={logout}
            project={session?.project}
            onNavigate={(key) => {
              if (key === 'dashboard') goDashboard();
              if (key === 'profile') goProfile();
              if (key === 'team') goTeam();
              if (key === 'workspace-settings') goWorkspaceSettings();
              if (key === 'documentation') goDocumentation();
              if (key === 'ai-assistant') goAiAssistant();
              if (key === 'automation') setAutomationPageAndHash(automationPage);
              if (key === 'apitest') setApitestPageAndHash(apitestPage);
              if (key === 'perf') setPerfPageAndHash(perfPage);
            }}
            onNavigateChild={(parentKey, childKey) => {
              if (parentKey === 'automation') setAutomationPageAndHash(childKey);
              if (parentKey === 'apitest') setApitestPageAndHash(childKey);
              if (parentKey === 'perf') setPerfPageAndHash(childKey);
            }}
            isCollapsed={isSidebarCollapsed}
            onToggle={() => setSidebarCollapsed((c) => !c)}
            onOpenAiAssistant={goAiAssistant}
          />
        )}
        topbar={superAdmin ? (
          <AdminTopbar
            pageTitle={pageTitle}
            notice={adminNotice}
            onNavigateRoot={() => setAdminPageAndHash('admin-dashboard')}
            user={user}
            onNavigateProfile={goProfile}
          />
        ) : (
          <Topbar
            pageTitle={pageTitle}
            breadcrumbItems={breadcrumbItems}
            superAdmin={superAdmin}
            onNavigateHome={goDashboard}
            notifications={notifications}
            user={user}
            project={session?.project}
            onNavigateProfile={goProfile}
            onNavigate={navigateFromSearch}
            topbarExtra={page === 'dashboard' ? <DateRangeFilter value={range} onChange={setRange} /> : null}
          />
        )}
      >
        {superAdmin && page === 'profile' ? (
          <Profile setNotice={notify} onProfileSaved={updateSessionUser} project={session?.project} />
        ) : superAdmin ? (
          <AdminContent
            activePage={adminPage}
            setActivePage={setAdminPageAndHash}
            setNotice={setAdminNotice}
          />
        ) : page === 'automation' ? (
          <AutomationWorkspace activePage={automationPage} />
        ) : page === 'apitest' ? (
          <ApiTestingWorkspace activePage={apitestPage} />
        ) : page === 'perf' ? (
          <PerformanceWorkspace activePage={perfPage} />
        ) : page === 'profile' ? (
          <Profile setNotice={notify} onProfileSaved={updateSessionUser} project={session?.project} />
        ) : page === 'team' ? (
          <ProjectUserManagement setNotice={notify} />
        ) : page === 'workspace-settings' ? (
          <WorkspaceSettings setNotice={notify} />
        ) : page === 'documentation' ? (
          <IntegrationGuide project={session?.project} setNotice={notify} />
        ) : page === 'ai-assistant' ? (
          <AiAssistantPage
            messages={chatMessages}
            input={chatInput}
            setInput={setChatInput}
            busy={chatBusy}
            onSend={sendChat}
            onNavigate={navigateToProduct}
          />
        ) : dashboardLoading ? (
          <FullScreenLoader logoSrc={appLogo} subtitle="Loading Dashboard" />
        ) : dashboardContent}
      </PortalLayout>

      {/* ── Search: navigation loading overlay (uses existing Testrix loader) ── */}
      {searchNavLoading && (
        <FullScreenLoader logoSrc={appLogo} subtitle="Navigating…" />
      )}

      {/* ── Search: post-navigation destination highlight ─────────────── */}
      <DestinationHighlight
        active={destHighlight.active}
        color={destHighlight.color}
        duration={2000}
        onDone={() => setDestHighlight((d) => ({ ...d, active: false }))}
      />

      {notice && (
        <div
          role="status"
          style={{
            position: 'fixed', top: '20px', right: '20px', zIndex: 1000,
            background: notice.tone === 'error' ? '#dc2626' : '#16a34a', color: '#fff', padding: '12px 18px',
            borderRadius: '10px', fontSize: '13px', fontWeight: 600,
            boxShadow: '0 10px 30px rgba(0,0,0,0.35)'
          }}
        >
          {notice.text}
        </div>
      )}

    </>
  );
}
