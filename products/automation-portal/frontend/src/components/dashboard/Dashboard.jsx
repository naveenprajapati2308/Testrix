import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Clock3,
  FileText,
  Hourglass,
  Layers,
  Monitor,
  HelpCircle,
  Globe2,
  History,
  Timer,
  Settings2
} from 'lucide-react';
import { api, auth, API_BASE } from '../../api.js';
import { Loader } from '../../../../../../shared/ui/Loader.jsx';
import { useDateRange } from '../../../../../../shared/ui/useDateRange.js';
import { DATE_RANGE_SCOPES, rangeLabel } from '../../../../../../shared/ui/date-range.js';
import { ExecutionTrendChart } from '../../../../../../shared/ui/dashboard/ExecutionTrendChart.jsx';
import { StatusMixDonut } from '../../../../../../shared/ui/dashboard/StatusMixDonut.jsx';
import { Table } from '../../../../../../shared/ui/dashboard/Table.jsx';
import { EmptyState } from '../../../../../../shared/ui/dashboard/EmptyState.jsx';
import { ModuleAnalyticsTable } from '../../../../../../shared/ui/dashboard/ModuleAnalyticsTable.jsx';

// Import child components
import { EnvDistribution } from './EnvDistribution.jsx';
import './dashboard.css';

// Helper for formatting duration into hh:mm:ss
const formatDurationHMS = (seconds) => {
  if (!seconds) return '00:00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [
    String(hrs).padStart(2, '0'),
    String(mins).padStart(2, '0'),
    String(secs).padStart(2, '0')
  ].join(':');
};

export function Dashboard({ onSelectExecution, onNavigate }) {
  const [range, setRange] = useDateRange(DATE_RANGE_SCOPES.AUTOMATION, '7d');
  const [loading, setLoading] = useState(true);
  const [selectedEnvId, setSelectedEnvId] = useState('');
  const [selectedFramework, setSelectedFramework] = useState('');

  // Data states from API
  const [summary, setSummary] = useState(null);
  const [recentExecutions, setRecentExecutions] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [modulesHealthData, setModulesHealthData] = useState([]);
  const [modules, setModules] = useState([]);
  const [envDistribution, setEnvDistribution] = useState([]);
  const [trends, setTrends] = useState([]);
  const [slowTests, setSlowTests] = useState([]);
  const [flakyTests, setFlakyTests] = useState([]);
  const [frameworks, setFrameworks] = useState([]);

  useEffect(() => {
    api.frameworks()
      .then(list => setFrameworks(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, []);

  // Load API Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [
        summaryData,
        recentData,
        envData,
        envDistData,
        trendsData,
        slowTestData,
        flakyTestData,
        modulesData
      ] = await Promise.all([
        api.dashboardSummary(range).catch(() => null),
        api.dashboardRecentActivity().catch(() => []),
        api.environments().catch(() => []),
        api.dashboardEnvDistribution(range).catch(() => []),
        api.dashboardTrends(range).catch(() => []),
        api.dashboardSlowTests(range).catch(() => []),
        api.dashboardFlakyTests(range).catch(() => []),
        api.modules().catch(() => [])
      ]);

      if (summaryData) setSummary(summaryData);
      if (recentData) setRecentExecutions(recentData);

      if (envData) setEnvironments(envData);

      if (modulesData) setModules(modulesData);
      if (envDistData) setEnvDistribution(envDistData);
      if (trendsData) setTrends(trendsData);
      if (slowTestData) setSlowTests(slowTestData);
      if (flakyTestData) setFlakyTests(flakyTestData);
    } catch (err) {
      console.error('Error loading dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [range]);

  // Module health is scoped to the selected environment (the backend now groups executions by
  // moduleCode+framework+environmentId), so it's refetched independently whenever either the
  // range or the environment filter changes, without re-fetching the rest of the dashboard.
  const refreshModuleHealth = () => {
    api.dashboardModuleHealth(range, selectedEnvId || undefined)
      .then((data) => setModulesHealthData(Array.isArray(data) ? data : []))
      .catch(() => setModulesHealthData([]));
  };
  useEffect(() => {
    let cancelled = false;
    api.dashboardModuleHealth(range, selectedEnvId || undefined)
      .then((data) => { if (!cancelled) setModulesHealthData(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setModulesHealthData([]); });
    return () => { cancelled = true; };
  }, [range, selectedEnvId]);

  // Keep refs to the latest loadData/refreshModuleHealth (they close over `range`/`selectedEnvId`)
  // so the SSE effect below can call the current versions without re-subscribing on every render.
  const loadDataRef = useRef(loadData);
  const refreshModuleHealthRef = useRef(refreshModuleHealth);
  useEffect(() => {
    loadDataRef.current = loadData;
    refreshModuleHealthRef.current = refreshModuleHealth;
  });

  // Live updates: subscribe once to the dashboard-wide event stream (mirrors the pattern
  // already used by ExecutionCenter.jsx for its per-execution stream) and refresh the existing
  // REST-backed data on relevant lifecycle events. Debounced so a fast-running suite (many
  // TEST_PASSED/FAILED events in a row) doesn't hammer the dashboard endpoints; this is purely
  // additive on top of the existing mount/range-change load, so if the stream never connects or
  // errors out, the page behaves exactly as it did before (initial load only, manual refresh via
  // range change or triggering a run).
  useEffect(() => {
    const token = auth.get()?.accessToken;
    const url = `${API_BASE}/api/events/dashboard/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const sse = new EventSource(url);

    let debounceTimer = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadDataRef.current();
        refreshModuleHealthRef.current();
      }, 3000);
    };

    const liveEvents = [
      'EXECUTION_STARTING',
      'SUITE_STARTED',
      'TEST_PASSED',
      'TEST_FAILED',
      'TEST_SKIPPED',
      'MODULE_COMPLETED',
      'SUITE_COMPLETED'
    ];
    liveEvents.forEach((eventName) => sse.addEventListener(eventName, scheduleRefresh));

    sse.onerror = () => {
      // Non-fatal: dashboard already has real data from the initial load, this stream is a
      // best-effort live-update layer on top of it.
      console.warn('Dashboard live-update stream lost connection');
    };

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      sse.close();
    };
  }, []);

  // Identify the latest execution for the top cards & system info
  const lastRun = useMemo(() => {
    return recentExecutions.length > 0 ? recentExecutions[0] : null;
  }, [recentExecutions]);

  // Formatter for Date and Time
  const formatDateTime = (isoString) => {
    if (!isoString) return { date: 'N/A', time: 'N/A' };
    try {
      const dateObj = new Date(isoString);
      if (isNaN(dateObj.getTime())) return { date: 'N/A', time: 'N/A' };

      const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
      const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };

      return {
        date: dateObj.toLocaleDateString('en-US', dateOptions),
        time: dateObj.toLocaleTimeString('en-US', timeOptions)
      };
    } catch {
      return { date: 'N/A', time: 'N/A' };
    }
  };

  const startTimes = useMemo(() => formatDateTime(lastRun?.startTime), [lastRun]);
  const endTimes = useMemo(() => formatDateTime(lastRun?.endTime), [lastRun]);

  // Which modules are shown for the selected environment comes from the backend's
  // Module<->Environment mapping (single source of truth) rather than the old envCodes CSV.
  const [envSupportedModules, setEnvSupportedModules] = useState(null);
  useEffect(() => {
    if (!selectedEnvId) { setEnvSupportedModules(null); return; }
    let cancelled = false;
    api.environmentModules(selectedEnvId)
      .then(list => { if (!cancelled) setEnvSupportedModules(Array.isArray(list) ? list : []); })
      .catch(e => { console.error('Failed to load supported modules for this environment', e); if (!cancelled) setEnvSupportedModules([]); });
    return () => { cancelled = true; };
  }, [selectedEnvId]);

  const availableInEnv = (m) => {
    if (!selectedEnvId) return true;
    if (envSupportedModules === null) return false; // still loading — don't flash unsupported modules
    return envSupportedModules.some(sm => sm.code === m.code && sm.runnerType === m.runnerType);
  };

  // Module Analytics stats are keyed by moduleCode+framework (a module code can be registered
  // once per framework), matching how the backend now groups execution health.
  const healthByKey = useMemo(() => {
    const map = new Map();
    for (const h of modulesHealthData) {
      map.set(`${h.moduleCode}::${h.framework}`, {
        total: h.totalTests ?? h.total ?? 0,
        passed: h.passed ?? 0,
        failed: h.failed ?? 0,
        skipped: h.skipped ?? 0,
        accuracy: h.passRate ?? 0
      });
    }
    return map;
  }, [modulesHealthData]);

  // Run a single module — same MODULE execution request the Execution Center uses, so it goes
  // through the identical queue/worker/report pipeline. The framework always comes from the
  // module's own registered runnerType, never asked of the user.
  const runModule = async (mod) => {
    await api.runExecution({
      executionType: 'MODULE',
      environmentId: Number(selectedEnvId),
      moduleCode: mod.code,
      framework: mod.runnerType
    });
    loadData();
    refreshModuleHealth();
  };

  // Run All for one parent module — queues each of its child modules individually (never the
  // platform-wide ALL_MODULES type), so only that parent's own sub-types are triggered.
  const runAllForParent = async (parent, children) => {
    for (const child of children) {
      await api.runExecution({
        executionType: 'MODULE',
        environmentId: Number(selectedEnvId),
        moduleCode: child.code,
        framework: child.runnerType
      });
    }
    loadData();
    refreshModuleHealth();
  };

  // Accuracy circular ring calculation
  const accuracyPercent = lastRun ? Number(lastRun.passRate ?? 0) : 0;
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (accuracyPercent / 100) * circumference;

  // Execution Mix calculations (segments/donut now rendered by shared StatusMixDonut)
  const mixPassRate = summary?.passRate ?? 0;
  const mixPassed = summary?.passedTests ?? 0;
  const mixFailed = summary?.failedTests ?? 0;
  const mixSkipped = summary?.skippedTests ?? 0;

  if (loading && !summary) {
    return (
      <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}>
        <Loader size={48} label="Loading quality analytics..." />
      </div>
    );
  }

  return (
    <section className="db-page">

      {/* Subheader (Portal Info & Range Filter) — the page title, search, Super Admin
          badge and Admin Panel button are all already provided once by the global
          Topbar, so this page only owns what's unique to it. */}
      <div className="db-subhead">
        <div>
          <span className="db-eyebrow">Quality Analytics Portal</span>
          <h3>Analytics Dashboard</h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onNavigate && (
            <button
              type="button"
              className="db-range"
              onClick={() => onNavigate('settings')}
              style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary)'
              }}
            >
              <Settings2 size={13} color="#3b82f6" />
              Settings
            </button>
          )}
          <div className="db-range">
            Filter Range:
            <select className="db-select" value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Row 1: 5 KPI Cards */}
      <div className="db-kpi-row">

        {/* Card 1: Last Test Summary */}
        <div className="db-card db-tint-violet">
          <div className="db-kpi-head">
            <span className="db-kpi-label">Last Test Summary</span>
            <FileText size={16} style={{ color: 'var(--accent-text)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginTop: 14, fontSize: 13 }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Total Tests</div>
              <strong style={{ color: 'var(--text-primary)', fontSize: 18 }}>{lastRun?.totalTests ?? 0}</strong>
            </div>
            <div>
              <div style={{ color: 'var(--success-text)', fontSize: 11 }}>Passed</div>
              <strong style={{ color: 'var(--success-text)', fontSize: 18 }}>{lastRun?.passedTests ?? 0}</strong>
            </div>
            <div>
              <div style={{ color: 'var(--danger-text)', fontSize: 11 }}>Failed</div>
              <strong style={{ color: 'var(--danger-text)', fontSize: 18 }}>{lastRun?.failedTests ?? 0}</strong>
            </div>
            <div>
              <div style={{ color: 'var(--warning-text)', fontSize: 11 }}>Skipped</div>
              <strong style={{ color: 'var(--warning-text)', fontSize: 18 }}>{lastRun?.skippedTests ?? 0}</strong>
            </div>
          </div>
        </div>

        {/* Card 2: Last Execution Started */}
        <div className="db-card db-tint-violet" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className="db-kpi-head">
            <span className="db-kpi-label">Last Execution Started</span>
            <Clock3 size={16} style={{ color: 'var(--accent-text)' }} />
          </div>
          <div style={{ marginTop: 16 }}>
            <strong className="db-kpi-value" style={{ fontSize: 18 }}>{startTimes.date}</strong>
            <span className="db-kpi-sub" style={{ fontSize: 13 }}>{startTimes.time}</span>
          </div>
        </div>

        {/* Card 3: Last Execution Ended */}
        <div className="db-card db-tint-red" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className="db-kpi-head">
            <span className="db-kpi-label">Last Execution Ended</span>
            <Hourglass size={16} style={{ color: 'var(--danger-text)' }} />
          </div>
          <div style={{ marginTop: 16 }}>
            <strong className="db-kpi-value" style={{ fontSize: 18 }}>{endTimes.date}</strong>
            <span className="db-kpi-sub" style={{ fontSize: 13 }}>{endTimes.time}</span>
          </div>
        </div>

        {/* Card 4: Last Duration */}
        <div className="db-card db-tint-green" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className="db-kpi-head">
            <span className="db-kpi-label">Last Duration</span>
            <Timer size={16} style={{ color: 'var(--success-text)' }} />
          </div>
          <div style={{ marginTop: 12 }}>
            <span className="db-kpi-sub">Total Runtime</span>
            <strong className="db-kpi-value db-mono" style={{ fontSize: 22, marginTop: 2 }}>
              {lastRun ? formatDurationHMS(lastRun.durationSeconds) : '00:00:00'}
            </strong>
            <span className="db-kpi-sub" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hour</span>
          </div>
        </div>

        {/* Card 5: Last Total Accuracy */}
        <div className="db-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <span className="db-kpi-label">Total Accuracy</span>
            <strong className="db-kpi-value" style={{ fontSize: 22, marginTop: 10 }}>
              {accuracyPercent.toFixed(2)}%
            </strong>
            <span className="db-kpi-sub">
              ({lastRun ? lastRun.passedTests : 0}/{lastRun ? lastRun.totalTests : 0} Passed)
            </span>
          </div>

          <div style={{ position: 'relative', width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="60" height="60" viewBox="0 0 60 60">
              <circle cx="30" cy="30" r={radius} fill="transparent" style={{ stroke: 'var(--border)' }} strokeWidth="6" />
              <circle
                cx="30" cy="30" r={radius} fill="transparent"
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{ stroke: 'var(--accent)', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
              />
            </svg>
            <div style={{ position: 'absolute', fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
              {Math.round(accuracyPercent)}%
            </div>
          </div>
        </div>

      </div>

      {/* Row 2: Charts and Mix */}
      <div className="db-charts-row">

        <ExecutionTrendChart
          title={`Execution Trend (${rangeLabel(range)})`}
          data={trends}
          series={[
            { key: 'passed', label: 'Passed', color: '--success-text' },
            { key: 'failed', label: 'Failed', color: '--danger-text' },
            { key: 'skipped', label: 'Skipped', color: '--warning-text' },
          ]}
          loading={loading}
        />

        <StatusMixDonut
          title="Execution Mix"
          segments={[
            { key: 'passed', label: 'Passed', value: mixPassed, color: '--success-text' },
            { key: 'failed', label: 'Failed', value: mixFailed, color: '--danger-text' },
            { key: 'skipped', label: 'Skipped', value: mixSkipped, color: '--warning-text' },
          ]}
          centerValue={`${mixPassRate.toFixed(1)}%`}
          centerLabel="Pass Rate"
          loading={loading}
        />

        {/* Environment Distribution */}
        <div className="db-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 className="db-card-title"><Globe2 size={16} /> Environment Distribution</h3>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <EnvDistribution data={envDistribution} environments={environments} loading={loading} />
          </div>
        </div>

      </div>

      {/* Row 3: Module Analytics */}
      <div className="db-card">
        <ModuleAnalyticsTable
          title="Module Analytics"
          icon={Layers}
          modules={modules}
          healthByKey={healthByKey}
          frameworks={frameworks}
          environments={environments}
          selectedFramework={selectedFramework}
          onFrameworkChange={setSelectedFramework}
          selectedEnvironmentId={selectedEnvId}
          onEnvironmentChange={setSelectedEnvId}
          isModuleAvailable={availableInEnv}
          onRunModule={runModule}
          onRunAllForParent={runAllForParent}
          loading={loading}
        />
      </div>

      {/* Row 4: Slowest Test Cases & Flaky Tests */}
      <div className="db-two-col">

        {/* Slowest Test Cases */}
        <div className="db-card">
          <h3 className="db-card-title"><Clock3 size={16} /> Slowest Test Cases</h3>
          <div style={{ overflowY: 'auto', maxHeight: 250 }}>
            <Table>
              <thead>
                <tr>
                  <th>Test Case</th>
                  <th>Module</th>
                  <th style={{ textAlign: 'right' }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {slowTests.slice(0, 10).map((tc, idx) => (
                  <tr key={idx}>
                    <td>
                      <div className="db-cell-strong">{tc.methodName}</div>
                      <div className="db-cell-sub">{tc.className}</div>
                    </td>
                    <td>
                      <span className="db-chip">{tc.module || 'ALL'}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--warning-text)' }}>
                      {Number(tc.duration).toFixed(2)}s
                    </td>
                  </tr>
                ))}
                {slowTests.length === 0 && (
                  <tr>
                    <td colSpan="3">
                      <EmptyState message="No slow test data found." />
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </div>

        {/* Flaky Tests (Stability Analysis) */}
        <div className="db-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 className="db-card-title"><HelpCircle size={16} /> Flaky Tests (Stability Analysis)</h3>

          <div className="db-empty-note">
            <HelpCircle size={36} />
            All tests are stable. No flakiness detected in this range.
          </div>
        </div>

      </div>

      {/* Row 5: System Information & Recent Executions */}
      <div className="db-info-row">

        {/* System & Run Information */}
        <div className="db-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 className="db-card-title"><Monitor size={16} /> System &amp; Run Information</h3>

            <div className="db-sys-grid">
              <div className="db-sys-tile">
                <span>Host Machine</span>
                <strong>{lastRun?.machineName || 'localhost'}</strong>
              </div>

              <div className="db-sys-tile">
                <span>OS System</span>
                <strong>{lastRun?.osName || 'Windows/Linux'}</strong>
              </div>

              {(!lastRun || lastRun.framework === 'MAVEN_TESTNG') && (
                <div className="db-sys-tile">
                  <span>Java Version</span>
                  <strong>{lastRun?.javaVersion || 'Java 21'}</strong>
                </div>
              )}

              <div className="db-sys-tile">
                <span>Automation Browser</span>
                <strong>
                  {lastRun?.browserName || 'Chrome'} / {
                    frameworks.find(fw => fw.code === lastRun?.framework)?.displayName
                      || lastRun?.framework
                      || 'Selenium'
                  }
                </strong>
              </div>
            </div>
          </div>

          <div className="db-sys-foot">
            System environment information matches the latest execution run <strong>{lastRun?.executionCode || 'AUTO-N/A'}</strong>
          </div>
        </div>

        {/* Recent Executions */}
        <div className="db-card">
          <h3 className="db-card-title"><History size={16} /> Recent Executions</h3>

          <div style={{ overflowX: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Module</th>
                  <th style={{ textAlign: 'right' }}>Pass Rate</th>
                </tr>
              </thead>
              <tbody>
                {recentExecutions.slice(0, 6).map((exec) => (
                  <tr key={exec.id}>
                    <td>
                      <span className="db-code-link" onClick={() => onSelectExecution(exec.id)}>
                        {exec.executionCode}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {exec.executionType === 'ALL_MODULES' ? 'ALL_MODULES' : exec.executionType}
                    </td>
                    <td>
                      <span className={`xc-status xc-status-${(exec.status || '').toLowerCase()}`}>
                        <span className="xc-dot" />
                        {exec.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{exec.moduleCode || 'ALL'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {Number(exec.passRate ?? 0).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>

      </div>

    </section>
  );
}
