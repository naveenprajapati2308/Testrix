import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api.js';
import { DataTable, Modal } from '../shared/index.jsx';
import {
  FileText,
  Download,
  ExternalLink,
  GitCompare,
  Search,
  Eye,
  Filter,
  History,
  CheckCircle2,
  XCircle,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { notify } from '../../../../../../shared/ui/NotificationProvider.jsx';
import './reports.css';

export function ReportsCenter({ onSelectExecution }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [status, setStatus] = useState('');
  const [module, setModule] = useState('');
  const [framework, setFramework] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Real modules/frameworks for the filter dropdowns — never hardcoded.
  const [modules, setModules] = useState([]);
  const [frameworks, setFrameworks] = useState([]);
  useEffect(() => {
    api.modules().then(setModules).catch(() => { });
    api.frameworks().then(list => setFrameworks(Array.isArray(list) ? list : [])).catch(() => { });
  }, []);

  // Comparison state
  const [baseId, setBaseId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState(null);

  // Delete flow
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.deleteExecution(confirmDelete.id);
      setReports((prev) => prev.filter((r) => r.id !== confirmDelete.id));
      setConfirmDelete(null);
      notify.success('Execution report deleted successfully.');
    } catch (e) {
      notify.error('Failed to delete execution: ' + (e.message || 'Server error'));
    } finally {
      setDeleting(false);
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = {};
      if (status) params.status = status;
      if (module) params.module = module;
      if (framework) params.framework = framework;
      if (search) params.search = search;

      if (fromDate) {
        params.from = new Date(fromDate).toISOString();
      }
      if (toDate) {
        params.to = new Date(toDate).toISOString();
      }

      const list = await api.reportsList(params);
      setReports(list);
    } catch (e) {
      notify.error("Error loading reports list: " + (e.message || 'Server error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [status, module, framework, fromDate, toDate]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchReports();
  };

  const handleCompare = async () => {
    if (!baseId || !targetId) {
      notify.warning("Please select both base and target executions to compare.");
      return;
    }
    setIsComparing(true);
    try {
      const result = await api.compareExecutions(baseId, targetId);
      setComparisonResult(result);
      notify.success("Comparison generated successfully.");
    } catch (e) {
      notify.error("Comparison failed: " + (e.message || 'Server error'));
    } finally {
      setIsComparing(false);
    }
  };

  const formatDuration = (sec) => {
    if (!sec) return '0s';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString();
  };

  const columns = useMemo(() => [
    {
      key: 'executionCode',
      label: 'Code',
      render: (val, report) => (
        <button onClick={() => onSelectExecution(report.id)} className="rc-code-link">
          {val}
        </button>
      )
    },
    {
      key: 'suiteName',
      label: 'Suite Name',
      render: (val) => <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>{val ?? 'Master Automation'}</span>
    },
    {
      key: 'moduleCode',
      label: 'Module',
      render: (val) => <span className="status">{val}</span>
    },
    {
      key: 'framework',
      label: 'Framework',
      render: (val) => <span style={{ fontSize: '12px' }}>{frameworks.find(fw => fw.code === val)?.displayName || val}</span>
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => <span className={`status ${val?.toLowerCase()}`}>{val}</span>
    },
    {
      key: 'testsCount',
      label: 'Tests (P / F / S)',
      render: (_, report) => (
        <span style={{ fontSize: '12px', fontWeight: 600 }}>
          <span style={{ color: 'var(--success-text)' }}>{report.passedTests}</span> / <span style={{ color: 'var(--danger-text)' }}>{report.failedTests}</span> / <span style={{ color: 'var(--warning-text)' }}>{report.skippedTests}</span>
        </span>
      )
    },
    {
      key: 'passRate',
      label: 'Pass %',
      defaultVisible: false,
      render: (val) => <span style={{ fontWeight: 700 }}>{val}%</span>
    },
    {
      key: 'durationSeconds',
      label: 'Duration',
      defaultVisible: false,
      render: (val) => formatDuration(val)
    },
    {
      key: 'createdAt',
      label: 'Started At',
      render: (val) => <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatDate(val)}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      sticky: 'right',
      render: (_, report) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          {report.finalReportPath && (
            <>
              <a
                href={`/api/reports/${report.id}/view`}
                target="_blank"
                rel="noreferrer"
                className="rc-act-btn"
                title={report.framework === 'PLAYWRIGHT' ? "Open Playwright HTML Report" : "Open HTML Report"}
              >
                <ExternalLink size={14} />
              </a>
              <a
                href={`/api/reports/${report.id}/download`}
                className="rc-act-btn"
                title="Download HTML"
              >
                <Download size={14} />
              </a>
            </>
          )}
          {report.framework === 'MAVEN_TESTNG' && (
            <a
              href={`/api/reports/${report.id}/testng-results`}
              className="rc-act-btn"
              title="Download TestNG XML"
            >
              <FileText size={14} />
            </a>
          )}
          <button
            onClick={() => onSelectExecution(report.id)}
            className="rc-act-btn"
            title="View Details"
          >
            <Eye size={14} />
          </button>
          <button
            onClick={() => setConfirmDelete(report)}
            className="rc-act-btn rc-act-danger"
            title="Delete Execution"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )
    }
  ], [onSelectExecution, frameworks]);

  return (
    <section className="rc-page">

      {/* Search and Filters */}
      <div className="rc-card">
        <h3 className="rc-card-title rc-title-cyan"><Filter size={17} /> Filter Reports</h3>
        <form onSubmit={handleSearchSubmit} className="rc-filter-grid">

          <div>
            <label className="rc-label">Search Execution Code</label>
            <div className="rc-search-wrap">
              <Search size={15} />
              <input
                type="text"
                className="rc-input rc-accent"
                placeholder="e.g. AUTO-2026..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="rc-label">Module</label>
            <select className="rc-select rc-accent" value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="">All Modules</option>
              {/* A module code can exist once per framework (e.g. "LAND" under both Selenium
                  and Playwright) — this filter matches moduleCode alone, so dedupe by code. */}
              {[...new Map(modules.map(m => [m.code, m])).values()].map(m => (
                <option key={m.code} value={m.code}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="rc-label">Framework</label>
            <select className="rc-select rc-accent" value={framework} onChange={(e) => setFramework(e.target.value)}>
              <option value="">All Frameworks</option>
              {frameworks.map(fw => (
                <option key={fw.code} value={fw.code}>{fw.displayName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="rc-label">Status</label>
            <select className="rc-select rc-accent" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="PASSED">Passed</option>
              <option value="FAILED">Failed</option>
              <option value="PARTIAL">Partial</option>
              <option value="ERROR">Error</option>
            </select>
          </div>

          <div>
            <label className="rc-label">From Date</label>
            <input type="date" className="rc-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>

          <div>
            <label className="rc-label">To Date</label>
            <input type="date" className="rc-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>

          <button type="submit" className="rc-gradient-btn">
            Apply Filters
          </button>
        </form>
      </div>

      {/* Historical Report List */}
      <div className="rc-card">
        <h3 className="rc-card-title rc-title-blue"><History size={17} /> Historical Execution Reports</h3>
        <DataTable
          columns={columns}
          data={reports}
          loading={loading}
          searchPlaceholder="Search reports..."
          exportFilename="historical_reports.csv"
        />
      </div>

      {/* Comparison Engine UI */}
      <div className="rc-card">
        <h3 className="rc-card-title rc-title-violet"><GitCompare size={17} /> Compare Execution Run Metrics</h3>
        <div style={{ display: 'grid', gap: '16px' }}>
          <div className="rc-cmp-row">

            <div style={{ flex: 1, minWidth: '200px' }}>
              <label className="rc-label">Base Execution</label>
              <select className="rc-select" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
                <option value="">Select Base Execution</option>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>{r.executionCode} ({r.moduleCode} - {r.passRate}% Pass)</option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1, minWidth: '200px' }}>
              <label className="rc-label">Target Execution </label>
              <select className="rc-select" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="">Select Target Execution</option>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>{r.executionCode} ({r.moduleCode} - {r.passRate}% Pass)</option>
                ))}
              </select>
            </div>

            <button className="rc-gradient-btn" onClick={handleCompare} disabled={isComparing}>
              <GitCompare size={16} /> {isComparing ? 'Comparing...' : 'Compare Runs'}
            </button>
          </div>

          {/* Comparison Results Card */}
          {comparisonResult && (
            <div className="rc-cmp-result">
              <div className="rc-cmp-result-head">
                <h3>Comparison Result: <code>{comparisonResult.base.executionCode}</code> vs <code>{comparisonResult.target.executionCode}</code></h3>
                <button className="rc-clear-btn" onClick={() => setComparisonResult(null)}>
                  Clear Comparison
                </button>
              </div>

              {/* Delta KPI Dashboard */}
              <div className="rc-kpi-grid">
                <div className="rc-kpi">
                  <span>Pass Rate Change</span>
                  <strong style={{ color: comparisonResult.delta.passRateChange >= 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>
                    {comparisonResult.delta.passRateChange >= 0 ? '+' : ''}{comparisonResult.delta.passRateChange}%
                  </strong>
                </div>

                <div className="rc-kpi">
                  <span>New Failures</span>
                  <strong style={{ color: comparisonResult.delta.newFailures > 0 ? 'var(--danger-text)' : 'var(--success-text)' }}>
                    {comparisonResult.delta.newFailures} tests
                  </strong>
                </div>

                <div className="rc-kpi">
                  <span>Fixed Failures</span>
                  <strong style={{ color: 'var(--success-text)' }}>
                    {comparisonResult.delta.fixedFailures} tests
                  </strong>
                </div>

                <div className="rc-kpi">
                  <span>Still Failing</span>
                  <strong style={{ color: 'var(--warning-text)' }}>
                    {comparisonResult.delta.stillFailing} tests
                  </strong>
                </div>
              </div>

              {/* Newly Failed Tests list */}
              {comparisonResult.newFailures.length > 0 && (
                <div className="rc-list-card rc-list-fail">
                  <h4><XCircle size={16} /> New Regression Failures ({comparisonResult.newFailures.length})</h4>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {comparisonResult.newFailures.map((item, idx) => (
                      <div key={idx} className="rc-fail-item">
                        <strong>{item.methodName}</strong> <span style={{ color: 'var(--text-muted)' }}>({item.className})</span>
                        <p>{item.failureReason ?? 'No message'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fixed Tests list */}
              {comparisonResult.fixedTests.length > 0 && (
                <div className="rc-list-card rc-list-fixed">
                  <h4><CheckCircle2 size={16} /> Fixed Failures ({comparisonResult.fixedTests.length})</h4>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {comparisonResult.fixedTests.map((item, idx) => (
                      <div key={idx} className="rc-fixed-item">
                        <strong>{item.methodName}</strong> <span style={{ color: 'var(--text-muted)' }}>({item.className})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* General status changes */}
              {comparisonResult.statusChangedTests.length === 0 && (
                <p className="rc-muted-note">All matched tests have identical status in both executions.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <Modal title="Delete Execution" onClose={() => setConfirmDelete(null)}>
          <div className="rc-confirm-body">
            <AlertTriangle size={38} />
            <p className="rc-confirm-text">
              Are you sure you want to delete this execution?<br />
              <code>{confirmDelete.executionCode}</code> — {confirmDelete.moduleCode} ({confirmDelete.status})<br />
              This permanently removes its test cases, logs, screenshots, reports and all related files. This cannot be undone.
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
