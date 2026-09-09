import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Square,
  RefreshCw,
  Terminal,
  Image as ImageIcon,
  ChevronDown,
  Rocket,
  History,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { api, auth, API_BASE } from '../../api.js';
import { DataTable, Modal } from '../shared/index.jsx';
import './execution.css';

// ── Formatting helpers ─────────────────────────────────────────────────────────
function prettyStatus(raw) {
  if (!raw) return '—';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export function ExecutionCenter({
  environments,
  modules,
  selectedEnv,
  selectedModule,
  selectedFramework,
  selectedBrowser,
  selectedTagFilter,
  setSelectedEnv,
  setSelectedModule,
  setSelectedFramework,
  setSelectedBrowser,
  setSelectedTagFilter,
  run,
  executions,
  executionsLoading = false,
  onSelectExecution,
  onRefresh
}) {
 
  const activeModules = (modules || []).filter(m => m.active !== false)
    .filter(m => m.runnerType === selectedFramework);


  const topLevelModules = activeModules.filter(m => !m.parentModuleId);

  // If the framework switch made the current module unavailable, fall back to the first
  // top-level module that is available there.
  useEffect(() => {
    if (selectedModule && !topLevelModules.some(m => m.code === selectedModule)) {
      setSelectedModule(topLevelModules[0]?.code || '');
    }
  }, [selectedFramework, modules]);

  const [selectedSubType, setSelectedSubType] = useState('');
  const selectedModuleObj = activeModules.find(m => m.code === selectedModule);
  const childModules = selectedModuleObj
    ? activeModules.filter(m => m.parentModuleId === selectedModuleObj.id)
    : [];
  // Everything below (environments/config/browsers/tags/the actual run) targets whichever is
  // more specific: the chosen sub-type if one is picked, otherwise the parent module itself —
  // so selecting just the parent still runs its own combined suite exactly as before.
  const effectiveModule = childModules.find(m => m.code === selectedSubType) || selectedModuleObj;

  // Selecting a different parent invalidates whatever sub-type was chosen for the previous one.
  useEffect(() => {
    setSelectedSubType('');
  }, [selectedModule]);

  const [runnerSuites, setRunnerSuites] = useState([]);
  const [selectedSuite, setSelectedSuite] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeExec, setActiveExec] = useState(null);

 
  const [supportedEnvironments, setSupportedEnvironments] = useState([]);
  useEffect(() => {
    if (showAdvanced || !selectedModule) {
      setSupportedEnvironments(environments || []);
      return;
    }
    const mod = effectiveModule;
    if (!mod) {
      setSupportedEnvironments([]);
      return;
    }
    let cancelled = false;
    api.moduleEnvironments(mod.id)
      .then(list => { if (!cancelled) setSupportedEnvironments(Array.isArray(list) ? list : []); })
      .catch(e => { console.error('Failed to load supported environments', e); if (!cancelled) setSupportedEnvironments([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModule, selectedSubType, showAdvanced, modules]);

  // Keep the environment selection valid as the supported list changes.
  useEffect(() => {
    if (supportedEnvironments.length > 0 && !supportedEnvironments.some(e => String(e.id) === String(selectedEnv))) {
      setSelectedEnv(supportedEnvironments[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportedEnvironments]);

  // "Load Configuration" / "Load Browser Options" steps: resolved, non-secret run options for
  // the current module+environment combination — base URL (for operator confidence) and the
  // allowed browsers, which may be a module/environment-specific override of the framework's
  // full list.
  const [moduleEnvOptions, setModuleEnvOptions] = useState(null);
  useEffect(() => {
    const mod = effectiveModule;
    if (showAdvanced || !mod || !selectedEnv) {
      setModuleEnvOptions(null);
      return;
    }
    let cancelled = false;
    api.moduleEnvironmentOptions(mod.id, selectedEnv)
      .then(opts => { if (!cancelled) setModuleEnvOptions(opts); })
      .catch(e => { console.error('Failed to load module/environment options', e); if (!cancelled) setModuleEnvOptions(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModule, selectedSubType, selectedEnv, showAdvanced]);

  
  const [moduleTags, setModuleTags] = useState([]);
  useEffect(() => {
    const mod = effectiveModule;
    if (showAdvanced || !mod || selectedFramework !== 'PLAYWRIGHT') {
      setModuleTags([]);
      return;
    }
    let cancelled = false;
    api.moduleTags(mod.id)
      .then(list => { if (!cancelled) setModuleTags(Array.isArray(list) ? list : []); })
      .catch(e => { console.error('Failed to load run-scope tags', e); if (!cancelled) setModuleTags([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModule, selectedSubType, selectedFramework, showAdvanced]);

  // Keep the tag selection valid as the module/framework changes — clearing it (back to "All
  // tests", i.e. no filter) is always safe and never blocks a run.
  useEffect(() => {
    if (selectedTagFilter && !moduleTags.includes(selectedTagFilter)) {
      setSelectedTagFilter('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleTags]);

  // Real-time streams
  const [liveLogs, setLiveLogs] = useState([]);
  const [liveScreenshots, setLiveScreenshots] = useState([]);
  const [activeTab, setActiveTab] = useState('logs');

  const sseRef = useRef(null);
  const terminalBodyRef = useRef(null);

  
  const getPhysicalWindowHeight = () => {
    try {
      return window.top.innerHeight || window.innerHeight;
    } catch {
      return window.innerHeight;
    }
  };
  const [windowHeight, setWindowHeight] = useState(getPhysicalWindowHeight());
  useEffect(() => {
    const onResize = () => setWindowHeight(getPhysicalWindowHeight());
    window.addEventListener('resize', onResize);
    let topWindow = null;
    try {
      topWindow = window.top;
      if (topWindow !== window) topWindow.addEventListener('resize', onResize);
    } catch { /* cross-origin top, ignore */ }
    return () => {
      window.removeEventListener('resize', onResize);
      if (topWindow && topWindow !== window) {
        try { topWindow.removeEventListener('resize', onResize); } catch { /* ignore */ }
      }
    };
  }, []);

  const logPanelHeight = Math.max(320, windowHeight - 20);

 
  const [frameworks, setFrameworks] = useState([]);
  useEffect(() => {
    api.frameworks()
      .then(list => setFrameworks(Array.isArray(list) ? list : []))
      .catch(e => console.error("Failed to load frameworks", e));
  }, []);

  // Browsers available for the current selection — resolved per module+environment
  // (moduleEnvOptions.browsers, which may be a narrower override) in the normal flow, or the
  // framework's full list in Advanced mode where there's no module in play. Empty means the
  // framework's browser is baked into its own test code, not a portal-selectable parameter, so
  // the Browser step is skipped entirely (never a framework-name check).
  const frameworkBrowsers = frameworks.find(fw => fw.code === selectedFramework)?.browsers || [];
  const availableBrowsers = showAdvanced ? frameworkBrowsers : (moduleEnvOptions?.browsers || []);

  // Keep selectedBrowser valid as the available list changes: default to the first available
  // option, or clear it when there are none.
  useEffect(() => {
    if (availableBrowsers.length === 0) {
      if (selectedBrowser) setSelectedBrowser('');
    } else if (!availableBrowsers.includes(selectedBrowser)) {
      setSelectedBrowser(availableBrowsers[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFramework, frameworks, moduleEnvOptions, showAdvanced]);


  const fetchSuites = async () => {
    try {
      const suites = await api.runnerSuites(selectedFramework);
      const list = Array.isArray(suites) ? suites : [];
      setRunnerSuites(list);
      setSelectedSuite(list.length > 0 ? list[0].xml : '');
    } catch (e) {
      console.error("Failed to load runner suites", e);
    }
  };

  useEffect(() => {
    fetchSuites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFramework]);

  const trackedExecution = executions.find(e => e.status === 'RUNNING')
    || executions.find(e => e.status === 'QUEUED')
    || null;


  useEffect(() => {
    if (trackedExecution) {
      if (!activeExec || activeExec.executionCode !== trackedExecution.executionCode) {
        setupSseConnection(trackedExecution);
      }
    } else {
      // Nothing running
      if (activeExec && activeExec.status === 'RUNNING') {
        // If it was running but disappeared from active list, finalize it
        cleanupSse();
        setActiveExec(null);
      }
    }

    return () => cleanupSse();
  }, [trackedExecution?.executionCode]);

  // Scroll terminal to bottom as logs append — scrolls only this local
  // container's scrollTop, never scrollIntoView, which can escalate up
  // through the embedding iframe and scroll the whole Testrix shell page.
  useEffect(() => {
    if (terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
    }
  }, [liveLogs]);

  const cleanupSse = () => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  };

 
  const resyncActiveExec = async (execId) => {
    if (!execId) return;
    try {
      const fresh = await api.executionDetails(execId);
      if (fresh.status === 'RUNNING' || fresh.status === 'QUEUED') {
        setupSseConnection(fresh);
      } else {
        cleanupSse();
        setActiveExec(fresh);
      }
    } catch (e) {
      console.error('Failed to resync active execution', e);
    }
  };

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') resyncActiveExec(activeExec?.id);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [activeExec]);

  const setupSseConnection = (execution) => {
    cleanupSse();

    // Baseline details
    setActiveExec({
      id: execution.id,
      executionCode: execution.executionCode,
      status: execution.status,
      suiteName: execution.suiteName || 'Suite Run',
      environmentId: execution.environmentId,
      totalTests: execution.totalTests || 0,
      passedTests: execution.passedTests || 0,
      failedTests: execution.failedTests || 0,
      skippedTests: execution.skippedTests || 0,
      startTime: execution.startTime || new Date().toISOString()
    });

    setLiveLogs([]);
    setLiveScreenshots([]);

    // Subscribe to SSE endpoint
    const token = auth.get()?.accessToken;
    const url = `${API_BASE}/api/events/execution/${execution.executionCode}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;

    const sse = new EventSource(url);
    sseRef.current = sse;

    sse.addEventListener('CONNECTED', (e) => {
      appendLog('SYSTEM', 'Connected to execution live broadcast stream');
    });

    sse.addEventListener('EXECUTION_STARTING', (e) => {
      setActiveExec(prev => prev ? { ...prev, status: 'RUNNING' } : null);
      appendLog('SYSTEM', 'Execution manager dispatched process');
    });

    sse.addEventListener('SUITE_STARTED', (e) => {
      const payload = JSON.parse(e.data);
      setActiveExec(prev => prev ? {
        ...prev,
        status: 'RUNNING',
        suiteName: payload.data.suiteName || prev.suiteName,
        // Expected test count is known upfront (TestNG suite is fully resolved before it runs) —
        // seed it here so the progress bar reflects real progress instead of always reading 100%.
        totalTests: payload.data.totalExpectedTests || prev.totalTests
      } : null);
      appendLog('SYSTEM', 'Suite started: ' + (payload.data.suiteName || ''));
    });

    sse.addEventListener('TEST_STARTED', (e) => {
      const payload = JSON.parse(e.data);
      appendLog('FRAMEWORK', 'Starting test case: ' + payload.data.testName);
    });

    sse.addEventListener('TEST_PASSED', (e) => {
      const payload = JSON.parse(e.data);
      setActiveExec(prev => {
        if (!prev) return null;
        const passed = prev.passedTests + 1;
        return {
          ...prev,
          totalTests: Math.max(prev.totalTests, passed + prev.failedTests + prev.skippedTests),
          passedTests: passed
        };
      });
      appendLog('PASS', `PASS: ${payload.data.testName} (${payload.data.durationMs}ms)`);
    });

    sse.addEventListener('TEST_FAILED', (e) => {
      const payload = JSON.parse(e.data);
      setActiveExec(prev => {
        if (!prev) return null;
        const failed = prev.failedTests + 1;
        return {
          ...prev,
          totalTests: Math.max(prev.totalTests, prev.passedTests + failed + prev.skippedTests),
          failedTests: failed
        };
      });
      appendLog('FAIL', `FAIL: ${payload.data.testName} - ${payload.data.exceptionMessage || ''}`);
    });

    sse.addEventListener('TEST_SKIPPED', (e) => {
      const payload = JSON.parse(e.data);
      setActiveExec(prev => {
        if (!prev) return null;
        const skipped = prev.skippedTests + 1;
        return {
          ...prev,
          totalTests: Math.max(prev.totalTests, prev.passedTests + prev.failedTests + skipped),
          skippedTests: skipped
        };
      });
      appendLog('SKIP', `SKIP: ${payload.data.testName}`);
    });

    sse.addEventListener('SCREENSHOT_CAPTURED', (e) => {
      const payload = JSON.parse(e.data);
      setLiveScreenshots(prev => [...prev, payload.data]);
      appendLog('SYSTEM', 'Screenshot captured: ' + (payload.data.filePath || ''));
    });

    sse.addEventListener('LOG_ENTRY', (e) => {
      const payload = JSON.parse(e.data);
      appendLog(payload.data.level, payload.data.message, payload.data.source);
    });

    sse.addEventListener('SUITE_COMPLETED', (e) => {
      appendLog('SYSTEM', 'Suite completed event received. Disconnecting stream.');
      cleanupSse();
      setActiveExec(prev => prev ? { ...prev, status: 'COMPLETED' } : null);
    });

    sse.onerror = (err) => {
      console.error("SSE stream error", err);
      appendLog('ERROR', 'Live stream connection lost — resyncing...');
      cleanupSse();
      // Don't just leave the UI frozen on stale data (e.g. still "QUEUED" after a tab was
      // backgrounded and the browser dropped the connection) — pull the real current state
      // and reconnect if the execution is still active.
      setTimeout(() => resyncActiveExec(execution.id), 2000);
    };
  };

  const appendLog = (level, message, source = 'SYSTEM') => {
    setLiveLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      source
    }]);
  };

  const handleStartRun = async () => {
    try {
      if (showAdvanced) {
        if (!selectedSuite) return;
        await run('XML_SUITE', selectedSuite);
      } else {
        if (!selectedModule) return;
        await run('MODULE', null, effectiveModule?.code || selectedModule);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelRun = async () => {
    if (!activeExec) return;
    if (confirm("Are you sure you want to cancel this execution?")) {
      try {
        await api.cancelExecution(activeExec.id);
        appendLog('SYSTEM', 'Cancellation request submitted');
      } catch (e) {
        alert("Failed to cancel: " + e.message);
      }
    }
  };

  // Delete flow (same behavior as Reports Center — full cascade on the backend)
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.deleteExecution(confirmDelete.id);
      setConfirmDelete(null);
      if (onRefresh) await onRefresh();
    } catch (e) {
      alert('Failed to delete execution: ' + e.message);
    } finally {
      setDeleting(false);
    }
  };

  // Prepare columns for recent executions list
  const queueColumns = [
    {
      key: 'executionCode',
      label: 'Run Code',
      render: (val, row) => (
        <button
          onClick={() => onSelectExecution(row.id)}
          className="btn-link"
          style={{ textDecoration: 'underline', border: 0, background: 'transparent', cursor: 'pointer', fontWeight: 600, color: 'var(--indigo-text)' }}
        >
          {val}
        </button>
      )
    },
    { key: 'suiteName', label: 'Suite Name' },
    {
      key: 'framework',
      label: 'Framework',
      render: (val) => <span style={{ fontSize: '12px' }}>{frameworks.find(fw => fw.code === val)?.displayName || val}</span>
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => (
        <span className={`status ${val?.toLowerCase()}`}>
          {val}
        </span>
      )
    },
    {
      key: 'passRate',
      label: 'Metrics',
      render: (val, row) => (
        <div style={{ fontSize: '12px' }}>
          {row.passedTests} P / {row.failedTests} F ({val}%)
        </div>
      )
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => {
        const busy = row.status === 'QUEUED' || row.status === 'RUNNING';
        return (
          <button
            onClick={() => setConfirmDelete(row)}
            className="rc-act-btn rc-act-danger"
            title={busy ? 'Cancel the run before deleting' : 'Delete Execution'}
            disabled={busy}
            style={busy ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
          >
            <Trash2 size={14} />
          </button>
        );
      }
    }
  ];

  // Calculate live progress percentage
  const total = activeExec ? activeExec.totalTests : 0;
  const progressPercent = total === 0 ? 0 : Math.min(100, Math.round(((activeExec?.passedTests + activeExec?.failedTests + activeExec?.skippedTests) / total) * 100));

  return (
    <section className="xc-page">

      {/* Controls Card */}
        <div className="xc-card xc-controls-card">
        
          <img
            src="/execution-art-bright.png"
            alt=""
            className="xc-controls-art xc-controls-art-bright"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <img
            src="/execution-art.png"
            alt=""
            className="xc-controls-art xc-controls-art-dark"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />

          <h3 className="xc-card-title"><Rocket size={17} /> Execution Controls</h3>

          <label className="xc-label">Framework</label>
          <select
            className="xc-select xc-select-primary"
            value={selectedFramework}
            onChange={(e) => setSelectedFramework(e.target.value)}
            disabled={activeExec && activeExec.status === 'RUNNING'}
            title={activeExec && activeExec.status === 'RUNNING' ? 'Locked while a run is in progress — this only applies to the next run' : undefined}
          >
            {frameworks.length === 0 ? (
              <option value={selectedFramework}>Loading frameworks…</option>
            ) : (
              frameworks.map(fw => (
                <option key={fw.code} value={fw.code}>{fw.displayName}</option>
              ))
            )}
          </select>

          {/* Module dropdown selector (admin-registered modules) — top-level workflows only, a
              module's own sub-type variants (if any) are picked below instead. */}
          <label className="xc-label" style={{ marginTop: 16 }}>What do you want to run?</label>
          <select
            className="xc-select xc-select-primary"
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            disabled={showAdvanced}
          >
            {topLevelModules.length === 0 ? (
              <option value="">No modules registered — ask an admin to add one</option>
            ) : (
              topLevelModules.map(mod => (
                <option key={mod.code} value={mod.code}>{mod.name} ({mod.code})</option>
              ))
            )}
          </select>

          {/* Sub-type picker — only appears when the selected module has variants (e.g.
              Architect Empanelment's org types). Leaving it on "All types (combined)" runs the
              parent module's own suite exactly as before this existed. */}
          {!showAdvanced && childModules.length > 0 && (
            <>
              <label className="xc-label" style={{ marginTop: 16 }}>Type</label>
              <select
                className="xc-select"
                value={selectedSubType}
                onChange={(e) => setSelectedSubType(e.target.value)}
                disabled={activeExec && activeExec.status === 'RUNNING'}
              >
                <option value="">All types (combined)</option>
                {childModules.map(mod => (
                  <option key={mod.code} value={mod.code}>{mod.name.replace(selectedModuleObj?.name + ' - ', '')}</option>
                ))}
              </select>
            </>
          )}

          {/* Advanced: pick a raw suite/spec directly instead of a registered module — useful
              for a one-off XML suite (Selenium) or a single .spec.ts (Playwright) rather than
              the module's whole folder. */}
          <button type="button" className="xc-advanced-toggle" onClick={() => setShowAdvanced(v => !v)}>
            <ChevronDown size={13} style={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            {selectedFramework === 'PLAYWRIGHT' ? 'Advanced: run a single spec file instead' : 'Advanced: run a raw XML suite instead'}
          </button>

          {showAdvanced && (
            <div className="xc-advanced-row">
              <select
                className="xc-select"
                style={{ flex: 1 }}
                value={selectedSuite}
                onChange={(e) => setSelectedSuite(e.target.value)}
              >
                {runnerSuites.length === 0 ? (
                  <option value="">{selectedFramework === 'PLAYWRIGHT' ? 'No Playwright specs discovered' : 'No suites discovered'}</option>
                ) : (
                  runnerSuites.map(suite => (
                    <option key={suite.xml} value={suite.xml}>{suite.name} ({suite.xml})</option>
                  ))
                )}
              </select>

              <button className="xc-icon-btn" onClick={fetchSuites} title="Reload Suites">
                <RefreshCw size={16} />
              </button>
            </div>
          )}

          {/* Environment selector — narrowed to only the environments explicitly enabled for
              the selected module ("Load Supported Environments"); locked while a run is
              active, since the environment is resolved once at queue time and baked into that
              run's process, so changing this selector mid-run would only affect the *next*
              launch, never the live one. */}
          <label className="xc-label" style={{ marginTop: 16 }}>Execution Environment</label>
          <select
            className="xc-select"
            value={selectedEnv}
            onChange={(e) => setSelectedEnv(Number(e.target.value))}
            disabled={activeExec && activeExec.status === 'RUNNING'}
            title={activeExec && activeExec.status === 'RUNNING' ? 'Locked while a run is in progress — this only applies to the next run' : undefined}
          >
            {supportedEnvironments.length === 0 ? (
              <option value="">Not supported for this module — ask an admin to enable one</option>
            ) : (
              supportedEnvironments.map(env => (
                <option key={env.id} value={env.id}>{env.name} ({env.baseUrl})</option>
              ))
            )}
          </select>

          {/* "Load Configuration" step surfaced: the resolved (non-secret) target URL for this
              exact module+environment combination, which may be a module-specific override of
              the environment's own default. */}
          {moduleEnvOptions?.baseUrl && (
            <div className="xc-target-chip" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              Target: {moduleEnvOptions.baseUrl}
            </div>
          )}

          {/* Browser selector — only rendered when there are resolved browsers to choose from
              (a module/environment override, or the framework's full list in Advanced mode); a
              pure data check, never a framework-name comparison. Selenium's browser is baked
              into its own suite code today, so this step is skipped for it. */}
          {availableBrowsers.length > 0 && (
            <>
              <label className="xc-label" style={{ marginTop: 16 }}>Browser</label>
              <select
                className="xc-select"
                value={selectedBrowser}
                onChange={(e) => setSelectedBrowser(e.target.value)}
                disabled={activeExec && activeExec.status === 'RUNNING'}
              >
                {availableBrowsers.map(b => (
                  <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>
                ))}
              </select>
            </>
          )}

          {/* Run Scope selector — optional, additive tag filter (e.g. "@smoke") discovered
              live from the module's own test titles. Only appears once tags actually exist
              somewhere in the module; an untagged module just never shows this step, and
              "All Tests" (no filter) is always the default — this can never block a run. */}
          {moduleTags.length > 0 && (
            <>
              <label className="xc-label" style={{ marginTop: 16 }}>Run Scope</label>
              <select
                className="xc-select"
                value={selectedTagFilter}
                onChange={(e) => setSelectedTagFilter(e.target.value)}
                disabled={activeExec && activeExec.status === 'RUNNING'}
              >
                <option value="">All Tests</option>
                {moduleTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </>
          )}

          {/* Run Button */}
          <button
            className="xc-launch"
            onClick={handleStartRun}
            disabled={(activeExec && activeExec.status === 'RUNNING') || (showAdvanced ? !selectedSuite : !selectedModule)}
          >
            <Play size={17} />
            <span>Launch Execution</span>
          </button>
        </div>

      {/* LIVE ROW: monitor (left) + logs/screenshots (right), shown while a run
          is active — sits between the controls and the queue so nothing else
          in the layout moves around. */}
      {activeExec && (
        <div className="xc-live-row">

          {/* Live Run Monitor */}
          <div className="xc-card">
            <h3 className="xc-card-title"><Terminal size={17} /> Live Monitor: {activeExec.executionCode}</h3>

            {/* Status Header */}
            <div className="xc-live-head">
              <div>
                <h3 className="xc-live-suite">{activeExec.suiteName}</h3>
                <span className="xc-live-started">Started: {new Date(activeExec.startTime).toLocaleTimeString()}</span>
                {activeExec.environmentId != null && (
                  <span className="xc-live-started" style={{ marginLeft: 10 }}>
                    Env: {(environments || []).find(e => String(e.id) === String(activeExec.environmentId))?.name || activeExec.environmentId}
                  </span>
                )}
              </div>
              <span className={`xc-status xc-status-${activeExec.status.toLowerCase()}`}>
                <span className="xc-dot" />
                {prettyStatus(activeExec.status)}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="xc-progress-track">
              <div className="xc-progress-fill" style={{ width: `${progressPercent || 5}%` }}></div>
            </div>
            <div className="xc-progress-meta">
              <span>Progress: {progressPercent}%</span>
              <span>{activeExec.passedTests + activeExec.failedTests + activeExec.skippedTests} / {activeExec.totalTests || '?'} Tests Completed</span>
            </div>

            {/* Test Status Counters */}
            <div className="xc-counters">
              <div className="xc-counter xc-counter-pass">
                <span>Passed</span>
                <strong>{activeExec.passedTests}</strong>
              </div>
              <div className="xc-counter xc-counter-fail">
                <span>Failed</span>
                <strong>{activeExec.failedTests}</strong>
              </div>
              <div className="xc-counter xc-counter-skip">
                <span>Skipped</span>
                <strong>{activeExec.skippedTests}</strong>
              </div>
            </div>

            {/* Control Buttons */}
            <button className="xc-cancel-btn" onClick={handleCancelRun}>
              <Square size={15} />
              <span>Cancel</span>
            </button>
          </div>

          {/* Console Output and screenshots tabs */}
          <div className="xc-tabs-card" style={{ maxHeight: logPanelHeight, height: logPanelHeight }}>
            <div className="xc-tabs-bar">
              <button
                className={`xc-tab${activeTab === 'logs' ? ' active' : ''}`}
                onClick={() => setActiveTab('logs')}
              >
                <Terminal size={14} /> Live Logs ({liveLogs.length})
              </button>
              <button
                className={`xc-tab${activeTab === 'screenshots' ? ' active' : ''}`}
                onClick={() => setActiveTab('screenshots')}
              >
                <ImageIcon size={14} /> Screenshots ({liveScreenshots.length})
              </button>
            </div>

            <div className="xc-tab-body" ref={activeTab === 'logs' ? terminalBodyRef : null} style={{ background: activeTab === 'logs' ? 'var(--bg-inset)' : undefined }}>
              {activeTab === 'logs' ? (
                // Console Terminal
                <pre style={{ margin: 0, color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                  {liveLogs.length === 0 ? (
                    <div style={{ color: '#5d7292', fontStyle: 'italic' }}>Awaiting pipeline execution log stream...</div>
                  ) : (
                    liveLogs.map((logItem, idx) => {
                      let color = '#a0aec0';
                      if (logItem.level === 'ERROR' || logItem.level === 'FAIL') color = '#f87171';
                      else if (logItem.level === 'PASS') color = '#34d399';
                      else if (logItem.level === 'SKIP') color = '#fbbf24';
                      else if (logItem.level === 'SYSTEM') color = '#60a5fa';

                      return (
                        <div key={idx} style={{ color, marginBottom: '2px' }}>
                          <span style={{ color: '#4a5568', marginRight: '6px' }}>[{logItem.timestamp}]</span>
                          <span style={{ color: '#718096', marginRight: '4px' }}>[{logItem.source}]</span>
                          {logItem.message}
                        </div>
                      );
                    })
                  )}
                </pre>
              ) : (
                // screenshots
                liveScreenshots.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: '13px' }}>
                    No failure screenshots captured yet.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                    {liveScreenshots.map((shot, idx) => (
                      <div key={idx} className="xc-shot-card">
                        <a href={`/uploads/${shot.filePath}`} target="_blank" rel="noreferrer">
                          <img
                            src={`/uploads/${shot.filePath}`}
                            alt={shot.testName}
                            style={{ width: '100%', height: '100px', objectFit: 'cover' }}
                          />
                        </a>
                        <div className="xc-shot-name">{shot.testName}</div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>

        </div>
      )}

      {/* Execution Queue Card */}
      <div className="xc-card">
        <h3 className="xc-card-title"><History size={17} /> Recent Executions Queue</h3>
        <DataTable
          columns={queueColumns}
          data={executions}
          loading={executionsLoading}
          searchPlaceholder="Filter execution history..."
          exportFilename="executions.csv"
        />
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <Modal title="Delete Execution" onClose={() => setConfirmDelete(null)}>
          <div className="rc-confirm-body">
            <AlertTriangle size={38} />
            <p className="rc-confirm-text">
              Are you sure you want to delete this execution?<br />
              <code>{confirmDelete.executionCode}</code> — {confirmDelete.moduleCode} ({confirmDelete.status})<br />
              This permanently removes its test cases, logs, screenshots, reports and all artifact files. This cannot be undone.
            </p>
            <div className="rc-confirm-actions">
              <button className="rc-btn-cancel" onClick={() => setConfirmDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button className="rc-btn-delete" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}

    </section>
  );
}
