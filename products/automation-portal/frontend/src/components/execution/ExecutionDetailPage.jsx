import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api.js';
import { Panel } from '../shared/index.jsx';
import { TestStepPanel } from './TestStepPanel.jsx';
import './execution-detail.css';
import { lockParentScroll } from '../../../../../../shared/ui/iframe-scroll-lock.js';
import { Loader } from '../../../../../../shared/ui/Loader.jsx';
import {
  X,
  Play,
  XCircle,
  CheckCircle2,
  Clock,
  Monitor,
  Terminal,
  FileText,
  Image as ImageIcon,
  GitCompare,
  Download,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

export function ExecutionDetailPage({ executionId, onClose }) {
  const [activeTab, setActiveTab] = useState('summary');
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [compExecutions, setCompExecutions] = useState([]);

  // Media (Screenshots & Playwright Video Recordings)
  const [mediaList, setMediaList] = useState([]);
  const [mediaFilter, setMediaFilter] = useState('ALL'); // 'ALL' | 'IMAGE' | 'VIDEO'
  const [activeMediaItem, setActiveMediaItem] = useState(null);

  // Filters for test cases tab
  const [tcSearch, setTcSearch] = useState('');
  const [tcStatus, setTcStatus] = useState('');
  const [tcShowConfig, setTcShowConfig] = useState(false);

  // Comparison tab state
  const [compareTargetId, setCompareTargetId] = useState('');
  const [comparisonResult, setComparisonResult] = useState(null);

  const [expandedTcIds, setExpandedTcIds] = useState(new Set());

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const unlockParent = lockParentScroll();
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      unlockParent();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const toggleTcExpand = (id) => {
    const next = new Set(expandedTcIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedTcIds(next);
  };

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const [sumData, tcData, artData, logData, execList, mediaData] = await Promise.all([
        api.executionSummary(executionId),
        api.executionTestCases(executionId),
        api.executionArtifacts(executionId),
        api.executionLogs(executionId),
        api.executions(), // to select for comparison
        api.screenshotsList({ executionId }).catch(() => [])
      ]);

      setSummary(sumData);
      setTestCases(tcData);
      setArtifacts(artData);
      setLogs(logData);
      setCompExecutions(execList.filter(e => e.id !== executionId));
      setMediaList(Array.isArray(mediaData) ? mediaData : []);
    } catch (e) {
      console.error("Error loading execution details", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [executionId]);

  const handleRerun = async () => {
    if (confirm("Are you sure you want to rerun this entire execution?")) {
      try {
        await api.rerunExecution(executionId);
        alert("Execution rerun has been queued.");
        onClose();
      } catch (e) {
        alert("Rerun failed: " + e.message);
      }
    }
  };

  const handleRerunFailed = async () => {
    if (confirm("Are you sure you want to rerun ONLY the failed tests of this execution?")) {
      try {
        await api.rerunFailedExecution(executionId);
        alert("Rerun of failed tests has been queued.");
        onClose();
      } catch (e) {
        alert("Rerun failed: " + e.message);
      }
    }
  };

  const handleCancel = async () => {
    if (confirm("Are you sure you want to request cancellation for this execution?")) {
      try {
        await api.cancelExecution(executionId);
        alert("Cancellation requested.");
        fetchDetails();
      } catch (e) {
        alert("Cancel request failed: " + e.message);
      }
    }
  };

  const handleCompare = async () => {
    if (!compareTargetId) return;
    try {
      // Compare this execution (base = compareTargetId, target = executionId)
      const result = await api.compareExecutions(compareTargetId, executionId);
      setComparisonResult(result);
    } catch (e) {
      alert("Comparison failed: " + e.message);
    }
  };

  const formatDuration = (sec) => {
    if (!sec) return '0s';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`;
  };

  const filteredTestCases = testCases
    .filter(tc => tcShowConfig ? true : !tc.isConfigMethod)
    .filter(tc => !tcStatus || tc.status.toUpperCase() === tcStatus.toUpperCase())
    .filter(tc => !tcSearch || tc.methodName.toLowerCase().includes(tcSearch.toLowerCase()) || tc.className.toLowerCase().includes(tcSearch.toLowerCase()));


  const failedTestCases = testCases.filter(tc => tc.status && tc.status.toUpperCase() === 'FAIL' && !tc.isConfigMethod);
  const screenshotTestCases = testCases.filter(tc => tc.screenshotPath);

  const combinedMedia = useMemo(() => {
    if (mediaList.length > 0) return mediaList;
    return screenshotTestCases.map(tc => ({
      id: tc.id,
      testCaseId: tc.id,
      executionId,
      executionCode: summary?.executionCode,
      moduleCode: tc.moduleCode,
      testName: tc.testName || tc.methodName,
      methodName: tc.methodName,
      screenshotPath: tc.screenshotPath,
      failureReason: tc.failureReason,
      mediaType: 'IMAGE'
    }));
  }, [mediaList, screenshotTestCases, executionId, summary]);

  const displayedMedia = useMemo(() => {
    return combinedMedia.filter(m => {
      if (mediaFilter === 'IMAGE') return m.mediaType === 'IMAGE';
      if (mediaFilter === 'VIDEO') return m.mediaType === 'VIDEO';
      return true;
    });
  }, [combinedMedia, mediaFilter]);

  const imageCount = useMemo(() => combinedMedia.filter(m => m.mediaType === 'IMAGE').length, [combinedMedia]);
  const videoCount = useMemo(() => combinedMedia.filter(m => m.mediaType === 'VIDEO').length, [combinedMedia]);

  if (loading && !summary) {
    return (
      <div style={{ padding: '40px', display: 'grid', placeItems: 'center' }}>
        <Loader size={32} label="Loading execution details..." />
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,25,35,0.7)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div className="xd-drawer" style={{ width: '85%', maxWidth: '1200px', height: '100%', background: 'var(--bg-inset)', display: 'flex', flexDirection: 'column', boxShadow: '-5px 0 25px rgba(0,0,0,0.3)', animation: 'slideIn 0.3s ease-out' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', background: 'var(--bg-inset)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`status ${summary?.status?.toLowerCase()}`}>{summary?.status}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatDate(summary?.startTime)}</span>
            </div>
            <h2 style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 800 }}>Execution Details: {summary?.executionCode}</h2>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {summary?.status === 'RUNNING' || summary?.status === 'QUEUED' ? (
              <button onClick={handleCancel} className="secondary-action" style={{ color: 'var(--danger-text)', borderColor: '#f87171' }}>
                Cancel Run
              </button>
            ) : (
              <>
                <button onClick={handleRerun} className="secondary-action" style={{ display: 'inline-flex', gap: '6px' }}>
                  <Play size={14} /> Rerun All
                </button>
                {summary?.failed > 0 && (
                  <button onClick={handleRerunFailed} className="primary-action" style={{ display: 'inline-flex', gap: '6px', width: 'auto' }}>
                    <Play size={14} /> Rerun Failed Only
                  </button>
                )}
              </>
            )}
            <button onClick={onClose} style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: '6px', borderRadius: '6px', color: 'var(--text-muted)' }}>
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', gap: '20px' }}>
          {[
            { key: 'summary', label: 'Summary', icon: FileText },
            { key: 'testCases', label: `Test Cases (${testCases.filter(t => !t.isConfigMethod).length})`, icon: ChevronRight },
            { key: 'failures', label: `Failures (${failedTestCases.length})`, icon: XCircle, countColor: '#f87171' },
            { key: 'screenshots', label: `Media (${combinedMedia.length})`, icon: ImageIcon },
            { key: 'logs', label: `Console Logs (${logs.length})`, icon: Terminal },
            { key: 'artifacts', label: 'Artifacts', icon: Download },
            { key: 'comparison', label: 'Historical Comparison', icon: GitCompare },
            { key: 'sysinfo', label: 'System Information', icon: Monitor }
          ].map(tab => {
            const Icon = tab.icon;
            const isTabActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '14px 4px',
                  border: 0,
                  borderBottom: isTabActive ? '3px solid #176b87' : '3px solid transparent',
                  background: 'transparent',
                  fontWeight: isTabActive ? 700 : 500,
                  color: isTabActive ? 'var(--accent-text)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s'
                }}
              >
                {tab.key !== 'testCases' && <Icon size={14} />}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

          {/* Summary Tab */}
          {activeTab === 'summary' && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
              <div>
                <Panel title="Results Statistics">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', textAlign: 'center' }}>
                    <div style={{ background: 'var(--bg-surface)', padding: '16px', borderRadius: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Tests</span>
                      <strong style={{ display: 'block', fontSize: '28px' }}>{summary?.totalTests}</strong>
                    </div>
                    <div style={{ background: 'rgba(46,204,113,0.12)', padding: '16px', borderRadius: '8px', color: 'var(--success-text)' }}>
                      <span style={{ fontSize: '11px', textTransform: 'uppercase' }}>Passed</span>
                      <strong style={{ display: 'block', fontSize: '28px' }}>{summary?.passed}</strong>
                    </div>
                    <div style={{ background: 'rgba(248,113,113,0.12)', padding: '16px', borderRadius: '8px', color: 'var(--danger-text)' }}>
                      <span style={{ fontSize: '11px', textTransform: 'uppercase' }}>Failed</span>
                      <strong style={{ display: 'block', fontSize: '28px' }}>{summary?.failed}</strong>
                    </div>
                    <div style={{ background: 'rgba(224,166,74,0.14)', padding: '16px', borderRadius: '8px', color: 'var(--warning-text)' }}>
                      <span style={{ fontSize: '11px', textTransform: 'uppercase' }}>Skipped</span>
                      <strong style={{ display: 'block', fontSize: '28px' }}>{summary?.skipped}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '20px', marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block' }}>Pass Rate</span>
                      <strong style={{ fontSize: '20px', color: 'var(--success-text)' }}>{summary?.passRate}%</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block' }}>Fail Rate</span>
                      <strong style={{ fontSize: '20px', color: 'var(--danger-text)' }}>{summary?.failRate}%</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block' }}>Execution Duration</span>
                      <strong style={{ fontSize: '20px' }}>{formatDuration(summary?.durationSeconds)}</strong>
                    </div>
                  </div>
                </Panel>

                <Panel title="Ingested Artifacts" style={{ marginTop: '20px' }}>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {artifacts.map(art => (
                      <div key={art.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: '8px', alignItems: 'center' }}>
                        <div>
                          <strong style={{ fontSize: '13px' }}>{art.fileName}</strong>
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>{art.artifactType}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {(art.artifactType === 'EXTENT_REPORT' || art.artifactType === 'REPORT') && (
                            <a href={`/api/reports/${executionId}/view`} target="_blank" rel="noreferrer" className="secondary-action" style={{ display: 'inline-flex', padding: '6px 8px', minHeight: 'unset' }}>
                              <ExternalLink size={14} /> Open & See Report
                            </a>
                          )}
                          {art.artifactType === 'VIDEO' && (
                            <button
                              type="button"
                              onClick={() => setActiveMediaItem({ screenshotPath: art.filePath, mediaType: 'VIDEO', testName: art.fileName })}
                              className="secondary-action"
                              style={{ display: 'inline-flex', padding: '6px 8px', minHeight: 'unset', cursor: 'pointer', gap: '4px', alignItems: 'center' }}
                            >
                              <Play size={14} /> Play
                            </button>
                          )}
                          <a href={`/uploads/${art.filePath}`} download className="secondary-action" style={{ display: 'inline-flex', padding: '6px 8px', minHeight: 'unset' }}>
                            <Download size={14} /> Download
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

              <div>
                <Panel title="Run Environment Details">
                  <div style={{ display: 'grid', gap: '12px', fontSize: '13px' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>HOST MACHINE</span>
                      <strong>{summary?.machineName ?? 'N/A'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>OPERATING SYSTEM</span>
                      <strong>{summary?.osName ?? 'N/A'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>JAVA VERSION</span>
                      <strong>Java {summary?.javaVersion ?? 'N/A'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>BROWSER ENGINE</span>
                      <strong>{summary?.browserName ?? 'N/A'}</strong>
                    </div>
                    {summary?.finalReportPath && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }}>
                        <a href={`/api/reports/${executionId}/view`} target="_blank" rel="noreferrer" className="primary-action" style={{ display: 'inline-flex', gap: '8px' }}>
                          <ExternalLink size={16} /> {summary?.framework === 'PLAYWRIGHT' ? 'Open Playwright HTML Report' : 'Open HTML Report'}
                        </a>
                      </div>
                    )}
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {/* Test Cases Tab */}
          {activeTab === 'testCases' && (
            <Panel title="Execution Test Cases">
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search method or class..."
                  value={tcSearch}
                  onChange={(e) => setTcSearch(e.target.value)}
                  style={{ flex: 1, height: '36px', borderRadius: '8px', border: '1px solid var(--border)', padding: '0 12px', fontSize: '13px' }}
                />
                <select
                  value={tcStatus}
                  onChange={(e) => setTcStatus(e.target.value)}
                  style={{ height: '36px', borderRadius: '8px', border: '1px solid var(--border)', padding: '0 8px', background: 'var(--bg-inset)', fontSize: '13px' }}
                >
                  <option value="">All Statuses</option>
                  <option value="PASS">Pass</option>
                  <option value="FAIL">Fail</option>
                  <option value="SKIP">Skip</option>
                </select>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={tcShowConfig}
                    onChange={(e) => setTcShowConfig(e.target.checked)}
                  />
                  Show Setup/Teardown
                </label>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Method Name</th>
                      <th>Class Name</th>
                      <th>Parameters</th>
                      <th style={{ textAlign: 'right' }}>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTestCases.map(tc => {
                      const isExpanded = expandedTcIds.has(tc.id);
                      return (
                        <React.Fragment key={tc.id}>
                          <tr
                            onClick={() => toggleTcExpand(tc.id)}
                            style={{ cursor: 'pointer', background: isExpanded ? 'var(--bg-surface)' : 'transparent', transition: 'background 0.15s' }}
                          >
                            <td>
                              <span className={`status ${tc.status.toLowerCase()}`}>
                                {tc.status}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <strong style={{ color: 'var(--text-primary)' }}>{tc.methodName}</strong>
                                {tc.isConfigMethod && <span style={{ fontSize: '10px', color: 'var(--warning-text)', background: 'rgba(224,166,74,0.14)', padding: '2px 6px', borderRadius: '50px', fontWeight: 700 }}>CONFIG</span>}
                                {tc.retries > 0 && <span style={{ fontSize: '10px', color: 'var(--warning-text)', background: 'rgba(245,158,11,0.15)', padding: '2px 6px', borderRadius: '50px', fontWeight: 700 }}>RETRIED ({tc.retries})</span>}
                              </div>
                            </td>
                            <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tc.className}</td>
                            <td style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tc.parameters}>
                              {tc.parameters ?? '-'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{tc.durationMs ? (tc.durationMs / 1000.0).toFixed(2) + 's' : '0s'}</td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={5} style={{ background: 'var(--bg-surface)', padding: '16px', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'grid', gap: '12px' }}>
                                  {tc.tags && tc.tags.length > 0 && (
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Tags:</span>
                                      {tc.tags.map(t => (
                                        <span
                                          key={t.id}
                                          style={{
                                            fontSize: '10px',
                                            background: 'rgba(0, 176, 255, 0.15)',
                                            color: '#00b0ff',
                                            padding: '3px 10px',
                                            borderRadius: '50px',
                                            fontWeight: 700,
                                            border: '1px solid rgba(0, 176, 255, 0.2)'
                                          }}
                                        >
                                          {t.name}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  <TestStepPanel testCaseId={tc.id} />
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {/* Failures Tab */}
          {activeTab === 'failures' && (
            <div style={{ display: 'grid', gap: '16px' }}>
              {failedTestCases.length === 0 ? (
                <Panel title="Regression Failures">
                  <p style={{ textAlign: 'center', color: 'var(--success-text)', padding: '40px 0', fontWeight: 600 }}>
                    <CheckCircle2 size={36} style={{ display: 'block', margin: '0 auto 10px' }} />
                    Zero failures! All tests passed in this execution.
                  </p>
                </Panel>
              ) : (
                failedTestCases.map(tc => (
                  <Panel key={tc.id} title={`${tc.methodName} - Failed`}>
                    <div style={{ fontSize: '13px' }}>
                      <div style={{ display: 'flex', gap: '20px', marginBottom: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>CLASS NAME</span>
                          <strong>{tc.className}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>EXCEPTION TYPE</span>
                          <strong style={{ color: 'var(--danger-text)' }}>{tc.exceptionType}</strong>
                        </div>
                      </div>

                      <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.35)', padding: '12px', borderRadius: '8px', color: 'var(--danger-text)', marginBottom: '12px', fontWeight: 600 }}>
                        {tc.failureReason}
                      </div>

                      {tc.screenshotPath && (
                        <div style={{ marginBottom: '16px' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '6px' }}>FAILURE SCREENSHOT</span>
                          <a href={`/uploads/${tc.screenshotPath}`} target="_blank" rel="noreferrer">
                            <img
                              src={`/uploads/${tc.screenshotPath}`}
                              alt="Failure screenshot"
                              style={{ maxWidth: '360px', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer' }}
                            />
                          </a>
                        </div>
                      )}

                      {tc.stackTrace && (
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '6px' }}>STACK TRACE</span>
                          <pre style={{ margin: 0, padding: '14px', background: 'var(--bg-inset)', color: 'var(--text-primary)', borderRadius: '8px', overflowX: 'auto', fontSize: '12px', maxHeight: '250px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                            {tc.stackTrace}
                          </pre>
                        </div>
                      )}
                    </div>
                  </Panel>
                ))
              )}
            </div>
          )}

          {/* Media & Screenshots Tab */}
          {activeTab === 'screenshots' && (
            <Panel title="Execution Media & Failure Captures">
              {combinedMedia.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0' }}>No screenshots or video recordings captured during this execution run.</p>
              ) : (
                <>
                  <div className="sg-media-tabs" style={{ marginBottom: '18px' }}>
                    <button
                      type="button"
                      className={`sg-media-tab ${mediaFilter === 'ALL' ? 'active' : ''}`}
                      onClick={() => setMediaFilter('ALL')}
                    >
                      All Media ({combinedMedia.length})
                    </button>
                    <button
                      type="button"
                      className={`sg-media-tab ${mediaFilter === 'IMAGE' ? 'active' : ''}`}
                      onClick={() => setMediaFilter('IMAGE')}
                    >
                      <ImageIcon size={14} /> Screenshots ({imageCount})
                    </button>
                    <button
                      type="button"
                      className={`sg-media-tab ${mediaFilter === 'VIDEO' ? 'active' : ''}`}
                      onClick={() => setMediaFilter('VIDEO')}
                    >
                      <Play size={14} /> Video Recordings ({videoCount})
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                    {displayedMedia.map(m => (
                      <div key={m.id || m.screenshotPath} style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-inset)', display: 'flex', flexDirection: 'column' }}>
                        {m.mediaType === 'VIDEO' ? (
                          <div className="sg-video-thumb-card" onClick={() => setActiveMediaItem(m)} style={{ height: '160px' }}>
                            <div className="sg-play-badge">
                              <Play size={20} fill="currentColor" />
                            </div>
                            <span className="sg-video-indicator">VIDEO RECORDING</span>
                          </div>
                        ) : (
                          <div
                            style={{ height: '160px', overflow: 'hidden', background: '#000', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                            onClick={() => setActiveMediaItem(m)}
                          >
                            <img
                              src={`/uploads/${m.screenshotPath}`}
                              alt={m.methodName}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          </div>
                        )}
                        <div style={{ padding: '10px 14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div>
                            <strong style={{ display: 'block', fontSize: '13px', color: 'var(--text-primary)' }}>{m.testName || m.methodName}</strong>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{m.methodName || m.className}</span>
                            {m.failureReason && (
                              <p style={{ fontSize: '12px', color: m.mediaType === 'VIDEO' ? 'var(--accent-text)' : 'var(--danger-text)', margin: '6px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                {m.failureReason}
                              </p>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            {m.mediaType === 'VIDEO' ? (
                              <button
                                type="button"
                                onClick={() => setActiveMediaItem(m)}
                                className="primary-action"
                                style={{ padding: '5px 10px', fontSize: '12px', minHeight: 'unset', width: 'auto', display: 'inline-flex', gap: '5px', alignItems: 'center' }}
                              >
                                <Play size={12} fill="currentColor" /> Play
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setActiveMediaItem(m)}
                                className="secondary-action"
                                style={{ padding: '5px 10px', fontSize: '12px', minHeight: 'unset', display: 'inline-flex', gap: '5px', alignItems: 'center' }}
                              >
                                <ExternalLink size={12} /> View Full
                              </button>
                            )}
                            <a
                              href={`/uploads/${m.screenshotPath}`}
                              download
                              className="secondary-action"
                              style={{ padding: '5px 10px', fontSize: '12px', minHeight: 'unset', display: 'inline-flex', gap: '5px', alignItems: 'center' }}
                            >
                              <Download size={12} /> Download
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Panel>
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && (
            <Panel title="Console Execution Stream (Stdout/Stderr)">
              <div style={{ background: 'var(--bg-inset)', borderRadius: '8px', padding: '16px' }}>
                <pre style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'pre-wrap', maxHeight: '500px', overflowY: 'auto', fontFamily: 'monospace' }}>
                  {logs.length === 0 ? (
                    "[INFO] Awaiting console stream initialization..."
                  ) : (
                    logs.map((log, idx) => (
                      <div key={idx} style={{ color: log.level === 'ERROR' ? 'var(--danger-text)' : 'var(--text-muted)', marginBottom: '4px' }}>
                        [{log.level}] {log.message}
                      </div>
                    ))
                  )}
                </pre>
              </div>
            </Panel>
          )}

          {/* Artifacts Tab */}
          {activeTab === 'artifacts' && (
            <Panel title="Download / Open Automation Results">
              <div style={{ display: 'grid', gap: '12px' }}>
                {artifacts.map(art => (
                  <div key={art.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: '8px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      {art.artifactType === 'SCREENSHOT' ? (
                        <a href={`/uploads/${art.filePath}`} target="_blank" rel="noreferrer">
                          <img src={`/uploads/${art.filePath}`} alt={art.fileName} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
                        </a>
                      ) : (
                        <div style={{ width: '40px', height: '40px', background: 'rgba(124,58,237,0.15)', borderRadius: '8px', display: 'grid', placeItems: 'center', color: 'var(--accent-text)' }}>
                          {art.artifactType === 'VIDEO' ? <Play size={20} /> : <FileText size={20} />}
                        </div>
                      )}
                      <div>
                        <strong style={{ display: 'block', fontSize: '14px' }}>{art.fileName}</strong>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{art.artifactType} • {(art.sizeBytes / 1024).toFixed(1)} KB</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(art.artifactType === 'EXTENT_REPORT' || art.artifactType === 'REPORT') && (
                        <a href={`/api/reports/${executionId}/view`} target="_blank" rel="noreferrer" className="secondary-action" style={{ display: 'inline-flex', padding: '6px 12px', minHeight: 'unset', gap: '6px' }}>
                          <ExternalLink size={14} /> View HTML Report
                        </a>
                      )}
                      {art.artifactType === 'VIDEO' && (
                        <button
                          type="button"
                          onClick={() => setActiveMediaItem({ screenshotPath: art.filePath, mediaType: 'VIDEO', testName: art.fileName })}
                          className="secondary-action"
                          style={{ display: 'inline-flex', padding: '6px 12px', minHeight: 'unset', gap: '6px', cursor: 'pointer', alignItems: 'center' }}
                        >
                          <Play size={14} /> Play Video
                        </button>
                      )}
                      <a href={`/uploads/${art.filePath}`} download className="primary-action" style={{ display: 'inline-flex', padding: '6px 12px', minHeight: 'unset', width: 'auto', gap: '6px' }}>
                        <Download size={14} /> Download File
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Comparison Tab */}
          {activeTab === 'comparison' && (
            <Panel title="Compare Execution Against Previous Runs">
              <div style={{ display: 'grid', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Compare with:</span>
                  <select
                    value={compareTargetId}
                    onChange={(e) => setCompareTargetId(e.target.value)}
                    style={{ height: '36px', borderRadius: '8px', border: '1px solid var(--border)', padding: '0 8px', background: 'var(--bg-inset)', fontSize: '13px', flex: 1 }}
                  >
                    <option value="">Select an execution run...</option>
                    {compExecutions.map(e => (
                      <option key={e.id} value={e.id}>{e.executionCode} ({e.moduleCode} - {e.passRate}% Pass)</option>
                    ))}
                  </select>
                  <button
                    onClick={handleCompare}
                    className="primary-action"
                    style={{ height: '36px', width: 'auto', padding: '0 16px', borderRadius: '8px' }}
                    disabled={!compareTargetId}
                  >
                    Compare
                  </button>
                </div>

                {comparisonResult && (
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', textAlign: 'center', marginBottom: '16px' }}>
                      <div style={{ background: 'var(--bg-inset)', padding: '10px', borderRadius: '6px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>PASS RATE DELTA</span>
                        <strong style={{ fontSize: '18px', color: comparisonResult.delta.passRateChange >= 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>
                          {comparisonResult.delta.passRateChange >= 0 ? '+' : ''}{comparisonResult.delta.passRateChange}%
                        </strong>
                      </div>
                      <div style={{ background: 'var(--bg-inset)', padding: '10px', borderRadius: '6px', color: 'var(--danger-text)' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>NEW REGRESSIONS</span>
                        <strong style={{ fontSize: '18px' }}>{comparisonResult.delta.newFailures}</strong>
                      </div>
                      <div style={{ background: 'var(--bg-inset)', padding: '10px', borderRadius: '6px', color: 'var(--success-text)' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>FIXED FAILURES</span>
                        <strong style={{ fontSize: '18px' }}>{comparisonResult.delta.fixedFailures}</strong>
                      </div>
                      <div style={{ background: 'var(--bg-inset)', padding: '10px', borderRadius: '6px', color: 'var(--warning-text)' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>STILL FAILING</span>
                        <strong style={{ fontSize: '18px' }}>{comparisonResult.delta.stillFailing}</strong>
                      </div>
                    </div>

                    {comparisonResult.newFailures.length > 0 && (
                      <div style={{ background: 'var(--bg-inset)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(248,113,113,0.35)', marginBottom: '12px' }}>
                        <h4 style={{ color: 'var(--danger-text)', margin: '0 0 8px 0', fontSize: '13px' }}>New Failures in Current Run</h4>
                        {comparisonResult.newFailures.map((item, idx) => (
                          <div key={idx} style={{ fontSize: '12px', padding: '4px 0', borderBottom: idx < comparisonResult.newFailures.length - 1 ? '1px solid #fcf2f2' : 0 }}>
                            <strong>{item.methodName}</strong> <span style={{ color: 'var(--text-muted)' }}>({item.className})</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {comparisonResult.fixedTests.length > 0 && (
                      <div style={{ background: 'var(--bg-inset)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(46,204,113,0.25)' }}>
                        <h4 style={{ color: 'var(--success-text)', margin: '0 0 8px 0', fontSize: '13px' }}>Fixed Failures (Now Passing)</h4>
                        {comparisonResult.fixedTests.map((item, idx) => (
                          <div key={idx} style={{ fontSize: '12px', padding: '4px 0', borderBottom: idx < comparisonResult.fixedTests.length - 1 ? '1px solid #f4fbf6' : 0 }}>
                            <strong>{item.methodName}</strong> <span style={{ color: 'var(--text-muted)' }}>({item.className})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Panel>
          )}

          {/* System Info Tab */}
          {activeTab === 'sysinfo' && (
            <Panel title="Execution Environment Specs">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Host Server</span>
                  <strong style={{ fontSize: '18px', display: 'block', marginTop: '4px', color: 'var(--text-primary)' }}>{summary?.machineName ?? 'N/A'}</strong>
                </div>

                <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Operating System</span>
                  <strong style={{ fontSize: '18px', display: 'block', marginTop: '4px', color: 'var(--text-primary)' }}>{summary?.osName ?? 'N/A'}</strong>
                </div>

                <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Java Runtime</span>
                  <strong style={{ fontSize: '18px', display: 'block', marginTop: '4px', color: 'var(--text-primary)' }}>Java {summary?.javaVersion ?? 'N/A'}</strong>
                </div>

                <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Web Driver Browser</span>
                  <strong style={{ fontSize: '18px', display: 'block', marginTop: '4px', color: 'var(--success-text)' }}>{summary?.browserName ?? 'N/A'}</strong>
                </div>
              </div>
            </Panel>
          )}

        </div>

        {/* Media Preview / Video Player Modal */}
        {activeMediaItem && (
          <div
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'grid', placeItems: 'center', padding: '24px' }}
            onClick={() => setActiveMediaItem(null)}
          >
            <div
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', maxWidth: '850px', width: '100%', overflow: 'hidden', padding: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="sg-video-indicator" style={{ textTransform: 'uppercase' }}>
                    {activeMediaItem.mediaType === 'VIDEO' ? 'Playwright Video' : 'Screenshot'}
                  </span>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {activeMediaItem.testName || activeMediaItem.methodName}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveMediaItem(null)}
                  style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', padding: '4px', borderRadius: '6px' }}
                >
                  <X size={20} />
                </button>
              </div>

              {activeMediaItem.mediaType === 'VIDEO' ? (
                <div className="sg-video-modal-wrap">
                  <video
                    controls
                    autoPlay
                    className="sg-video-player-el"
                    src={`/uploads/${activeMediaItem.screenshotPath}`}
                  >
                    Your browser does not support HTML5 video playback.
                  </video>
                </div>
              ) : (
                <div style={{ display: 'grid', placeItems: 'center', background: '#05070c', borderRadius: '8px', padding: '10px', maxHeight: '500px', overflow: 'hidden' }}>
                  <img
                    src={`/uploads/${activeMediaItem.screenshotPath}`}
                    alt={activeMediaItem.methodName || 'Screenshot'}
                    style={{ maxWidth: '100%', maxHeight: '480px', objectFit: 'contain', borderRadius: '4px' }}
                  />
                </div>
              )}

              <div className="sg-video-modal-footer" style={{ marginTop: '14px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {activeMediaItem.methodName || activeMediaItem.testName}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <a
                    href={`/uploads/${activeMediaItem.screenshotPath}`}
                    download
                    className="primary-action"
                    style={{ width: 'auto', padding: '6px 14px', fontSize: '13px', display: 'inline-flex', gap: '6px', alignItems: 'center' }}
                  >
                    <Download size={14} /> Download
                  </a>
                  <button
                    type="button"
                    onClick={() => setActiveMediaItem(null)}
                    className="secondary-action"
                    style={{ padding: '6px 14px', fontSize: '13px' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString();
};
