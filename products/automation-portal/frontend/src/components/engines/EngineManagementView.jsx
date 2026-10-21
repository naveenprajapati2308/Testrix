import { useState, useEffect } from 'react';
import { api } from '../../api.js';
import { Modal } from '../shared/index.jsx';
import {
  Settings2,
  GitBranch,
  Laptop,
  FolderTree,
  Download,
  Copy,
  Check,
  RefreshCw,
  Plus,
  TerminalSquare,
  Lock,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Trash2,
  ArrowRight,
  Layers,
  Cpu,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Sparkles
} from 'lucide-react';

export function EngineManagementView({ onNotify, isProjectAdmin, isSuperAdmin, onNavigateToSetup }) {
  const canManage = isProjectAdmin || isSuperAdmin;
  const [engines, setEngines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [configRoot, setConfigRoot] = useState('');
  
  const [editingEngine, setEditingEngine] = useState(null);
  const [snippetEngine, setSnippetEngine] = useState(null);
  const [disableEngine, setDisableEngine] = useState(null);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const refreshData = async () => {
    setLoading(true);
    try {
      const [list, cfg] = await Promise.all([
        api.testEngines(),
        api.testEngineConfig().catch(() => ({ projectFrameworksRoot: '' }))
      ]);
      setEngines(list || []);
      setConfigRoot(cfg.projectFrameworksRoot || '');
    } catch (err) {
      onNotify?.(err.message || 'Failed to load test engines', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleDownloadKit = async (engine) => {
    setDownloadingId(engine.id);
    try {
      await api.downloadEngineStarterKit(engine.id, null);
      onNotify?.(`Starter kit downloaded for ${engine.name}`, 'success');
    } catch (err) {
      onNotify?.(err.message || 'Failed to download starter kit', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDisableEngine = async () => {
    if (!disableEngine) return;
    try {
      await api.updateTestEngine(disableEngine.id, { description: disableEngine.description });
      // or soft-disable via DELETE /api/test-engines/:id
      const res = await fetch(`/api/test-engines/${disableEngine.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('portal_token') || ''}`
        }
      });
      if (!res.ok) throw new Error('Failed to disable engine');
      onNotify?.(`Engine ${disableEngine.name} disabled`, 'success');
      setDisableEngine(null);
      refreshData();
    } catch (err) {
      onNotify?.(err.message || 'Failed to disable engine', 'error');
    }
  };

  const gitEnginesCount = engines.filter((e) => (e.sourceType || 'LOCAL_DEV') === 'GIT_REMOTE').length;
  const localEnginesCount = engines.filter((e) => (e.sourceType || 'LOCAL_DEV') === 'LOCAL_DEV').length;
  const activeEnginesCount = engines.filter((e) => (e.status || 'ACTIVE') === 'ACTIVE').length;

  return (
    <div className="eng-page">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="eng-header">
        <div className="eng-header-left">
          <h1>
            <Settings2 size={24} color="#3b82f6" />
            Engine Settings &amp; Execution Sources
          </h1>
          <p>
            Configure how Testrix fetches and runs your test frameworks across <strong>Git Remote</strong>, 
            <strong> Local Agent</strong>, or <strong>Local Dev Folder</strong>.
          </p>
        </div>
        <div className="eng-header-actions">
          <button 
            type="button" 
            className="eng-btn eng-btn-secondary" 
            onClick={refreshData} 
            disabled={loading}
            title="Refresh engines list"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh
          </button>
          {canManage && (
            <button 
              type="button" 
              className="eng-btn eng-btn-primary" 
              onClick={() => setRegisterModalOpen(true)}
            >
              <Plus size={15} />
              Register Engine
            </button>
          )}
        </div>
      </div>

      {/* ── Top Metrics ─────────────────────────────────────────────────────── */}
      <div className="eng-metrics-grid">
        <div className="eng-metric-card">
          <div className="eng-metric-icon blue"><Layers size={20} /></div>
          <div className="eng-metric-info">
            <span>Registered Engines</span>
            <strong>{engines.length}</strong>
          </div>
        </div>
        <div className="eng-metric-card">
          <div className="eng-metric-icon green"><GitBranch size={20} /></div>
          <div className="eng-metric-info">
            <span>Git Remote Sources</span>
            <strong>{gitEnginesCount}</strong>
          </div>
        </div>
        <div className="eng-metric-card">
          <div className="eng-metric-icon amber"><FolderTree size={20} /></div>
          <div className="eng-metric-info">
            <span>Local Dev Sources</span>
            <strong>{localEnginesCount}</strong>
          </div>
        </div>
        <div className="eng-metric-card">
          <div className="eng-metric-icon purple"><Cpu size={20} /></div>
          <div className="eng-metric-info">
            <span>Active Status</span>
            <strong>{activeEnginesCount} / {engines.length}</strong>
          </div>
        </div>
      </div>

      {/* ── Engine Cards Grid ───────────────────────────────────────────────── */}
      {engines.length === 0 && !loading && (
        <div className="eng-empty-state">
          <Settings2 size={36} color="var(--text-muted)" />
          <h3>No Test Engines Registered</h3>
          <p>
            This workspace doesn't have an automation test engine registered yet. 
            Use the setup wizard to pick a framework and configure your execution source.
          </p>
          {canManage && (
            <button 
              type="button" 
              className="eng-btn eng-btn-primary"
              onClick={() => onNavigateToSetup ? onNavigateToSetup() : setRegisterModalOpen(true)}
            >
              Start Automation Setup <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}

      <div className="eng-cards-grid">
        {engines.map((engine) => {
          const mode = engine.sourceType || 'LOCAL_DEV';
          const isGit = mode === 'GIT_REMOTE';
          const isAgent = mode === 'LOCAL_AGENT';
          const isLocal = mode === 'LOCAL_DEV';

          return (
            <div key={engine.id} className="eng-card">
              <div className="eng-card-header">
                <div className="eng-card-title-group">
                  <h3>{engine.name}</h3>
                  <span className="eng-card-id">{engine.businessId || `ENG-${engine.id}`}</span>
                </div>
                <div className="eng-badges">
                  <span className={`eng-badge ${engine.engineType === 'PLAYWRIGHT' ? 'eng-badge-fw-playwright' : 'eng-badge-fw-selenium'}`}>
                    {engine.engineType}
                  </span>
                  <span className={`eng-badge ${(engine.status || 'ACTIVE') === 'ACTIVE' ? 'eng-badge-status-active' : 'eng-badge-status-disabled'}`}>
                    {engine.status || 'ACTIVE'}
                  </span>
                </div>
              </div>

              {/* Source Mode Section */}
              <div className="eng-source-box">
                <div className="eng-source-box-head">
                  <span className="eng-detail-label">Current Source Mode:</span>
                  {isGit && (
                    <span className="eng-source-mode-pill git">
                      <GitBranch size={12} /> Git Remote
                    </span>
                  )}
                  {isAgent && (
                    <span className="eng-source-mode-pill agent">
                      <Laptop size={12} /> Local Agent
                    </span>
                  )}
                  {isLocal && (
                    <span className="eng-source-mode-pill local">
                      <FolderTree size={12} /> Developer Mode (Local-to-Local)
                    </span>
                  )}
                </div>

                <div className="eng-source-details">
                  {isGit && (
                    <>
                      <div className="eng-detail-row">
                        <span className="eng-detail-label">Repository:</span>
                        <span className="eng-detail-val" title={engine.gitRepoUrl || 'Not set'}>
                          {engine.gitRepoUrl || <em style={{ color: 'var(--text-muted)' }}>Not configured</em>}
                        </span>
                      </div>
                      <div className="eng-detail-row">
                        <span className="eng-detail-label">Branch:</span>
                        <span className="eng-detail-val">{engine.gitBranch || 'main'}</span>
                      </div>
                      <div className="eng-detail-row">
                        <span className="eng-detail-label">Authentication:</span>
                        <span className="eng-detail-val">
                          {engine.gitAuthType === 'TOKEN' ? (
                            <span style={{ color: '#22c55e', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Lock size={11} /> Token Encrypted ({engine.gitTokenMasked || '••••••••'})
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Public (No Auth)</span>
                          )}
                        </span>
                      </div>
                      {engine.gitUsername && (
                        <div className="eng-detail-row">
                          <span className="eng-detail-label">Username:</span>
                          <span className="eng-detail-val">{engine.gitUsername}</span>
                        </div>
                      )}
                    </>
                  )}

                  {isAgent && (
                    <div className="eng-detail-row">
                      <span className="eng-detail-label">Agent ID:</span>
                      <span className="eng-detail-val">{engine.localAgentId || 'default-agent'}</span>
                    </div>
                  )}

                  {isLocal && (
                    <div className="eng-detail-row">
                      <span className="eng-detail-label">Framework Folder:</span>
                      <span className="eng-detail-val" title={`${configRoot}\\${engine.frameworkPath || ''}`}>
                        {engine.frameworkPath || <em style={{ color: 'var(--text-muted)' }}>Default checkout</em>}
                      </span>
                    </div>
                  )}

                  {engine.activeKeyPrefix && (
                    <div className="eng-detail-row" style={{ marginTop: 4, paddingTop: 4, borderTop: '1px dashed var(--border)' }}>
                      <span className="eng-detail-label">Credential Key:</span>
                      <span className="eng-detail-val" style={{ color: 'var(--text-muted)' }}>
                        <ShieldCheck size={11} style={{ display: 'inline', marginRight: 4 }} />
                        {engine.activeKeyPrefix}••••
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="eng-card-actions">
                {canManage && (
                  <button 
                    type="button" 
                    className="eng-btn eng-btn-primary"
                    onClick={() => setEditingEngine(engine)}
                  >
                    <Settings2 size={13} />
                    Configure Source
                  </button>
                )}

                {isLocal && canManage && (
                  <button 
                    type="button" 
                    className="eng-btn"
                    style={{
                      background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                      color: '#ffffff',
                      border: 'none',
                      boxShadow: '0 2px 6px rgba(59, 130, 246, 0.4)',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                    onClick={() => setEditingEngine({ ...engine, _forceSourceType: 'GIT_REMOTE' })}
                    title="Convert / Upgrade to Git Remote (Live) so runner instances can execute from repo"
                  >
                    <Sparkles size={13} />
                    Upgrade to Git (Live)
                  </button>
                )}

                <button 
                  type="button" 
                  className="eng-btn eng-btn-secondary"
                  onClick={() => handleDownloadKit(engine)}
                  disabled={downloadingId === engine.id}
                  title="Download clean starter kit for this engine"
                >
                  <Download size={13} />
                  {downloadingId === engine.id ? 'Downloading…' : 'Starter Kit'}
                </button>

                {isGit && (
                  <button 
                    type="button" 
                    className="eng-btn eng-btn-secondary"
                    onClick={() => setSnippetEngine(engine)}
                    title="View Git push command snippets"
                  >
                    <TerminalSquare size={13} />
                    Push Snippet
                  </button>
                )}

                {canManage && (engine.status || 'ACTIVE') === 'ACTIVE' && (
                  <button 
                    type="button" 
                    className="eng-btn eng-btn-danger"
                    onClick={() => setDisableEngine(engine)}
                    title="Disable engine"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Configure Source Mode Modal ─────────────────────────────────────── */}
      {editingEngine && (
        <EngineSourceConfigModal 
          engine={editingEngine}
          configRoot={configRoot}
          onClose={() => setEditingEngine(null)}
          onSaved={() => {
            setEditingEngine(null);
            refreshData();
            onNotify?.(`Engine ${editingEngine.name} configuration updated successfully!`, 'success');
          }}
          onNotify={onNotify}
        />
      )}

      {/* ── Push Snippet Modal ──────────────────────────────────────────────── */}
      {snippetEngine && (
        <GitSnippetModal 
          engine={snippetEngine} 
          onClose={() => setSnippetEngine(null)}
          onNotify={onNotify}
        />
      )}

      {/* ── Register Engine Modal ───────────────────────────────────────────── */}
      {registerModalOpen && (
        <RegisterEngineModal 
          configRoot={configRoot}
          onClose={() => setRegisterModalOpen(false)}
          onCreated={(newEngine) => {
            setRegisterModalOpen(false);
            refreshData();
            onNotify?.(`Engine ${newEngine.name} registered successfully!`, 'success');
          }}
          onNotify={onNotify}
        />
      )}

      {/* ── Disable Confirm Modal ───────────────────────────────────────────── */}
      {disableEngine && (
        <Modal title="Disable Test Engine" onClose={() => setDisableEngine(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to disable <strong>{disableEngine.name}</strong>? 
              This engine will no longer be available for dispatching executions. Existing historical results will be preserved.
            </p>
            <div className="eng-modal-actions">
              <button type="button" className="eng-btn eng-btn-secondary" onClick={() => setDisableEngine(null)}>
                Cancel
              </button>
              <button type="button" className="eng-btn eng-btn-danger" style={{ background: '#ef4444', color: '#fff' }} onClick={handleDisableEngine}>
                Disable Engine
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Configure Source Mode Modal Component ─────────────────────────────────────
function EngineSourceConfigModal({ engine, configRoot, onClose, onSaved, onNotify }) {
  const [sourceType, setSourceType] = useState(engine._forceSourceType || engine.sourceType || 'GIT_REMOTE');
  const [name, setName] = useState(engine.name || '');
  const [description, setDescription] = useState(engine.description || '');

  // Git remote state
  const [gitRepoUrl, setGitRepoUrl] = useState(engine.gitRepoUrl || '');
  const [gitBranch, setGitBranch] = useState(engine.gitBranch || 'main');
  const [gitAuthType, setGitAuthType] = useState(engine.gitAuthType || 'NONE');
  const [gitUsername, setGitUsername] = useState(engine.gitUsername || '');
  const [gitToken, setGitToken] = useState('');
  const [gitSnippetMode, setGitSnippetMode] = useState('STARTER_KIT');
  const [copiedCmdIndex, setCopiedCmdIndex] = useState(null);

  // Local agent state
  const [localAgentId, setLocalAgentId] = useState(engine.localAgentId || '');

  // Local dev state
  const [frameworkPath, setFrameworkPath] = useState(engine.frameworkPath || '');

  // Connection & Verification states
  const [testingGit, setTestingGit] = useState(false);
  const [gitTestResult, setGitTestResult] = useState(null);
  const [verifyingFolder, setVerifyingFolder] = useState(false);
  const [folderResult, setFolderResult] = useState(null);
  const [generatingToken, setGeneratingToken] = useState(false);

  const copyStepCommand = (cmdText, idx) => {
    navigator.clipboard.writeText(cmdText);
    setCopiedCmdIndex(idx);
    onNotify?.(`Copied: ${cmdText}`, 'success');
    setTimeout(() => setCopiedCmdIndex(null), 2500);
  };

  const handleTestGitConnection = async () => {
    if (!gitRepoUrl.trim()) {
      onNotify?.('Please enter a Git repository URL first', 'warning');
      return;
    }
    setTestingGit(true);
    setGitTestResult(null);
    try {
      const res = await api.testGitConnection({
        gitRepoUrl: gitRepoUrl.trim(),
        gitBranch: gitBranch.trim(),
        gitAuthType,
        gitToken: gitAuthType === 'TOKEN' ? (gitToken.trim() || null) : null,
        gitUsername: gitUsername.trim() || null
      });
      setGitTestResult(res);
      if (res.success) {
        onNotify?.(res.message, 'success');
      } else {
        onNotify?.(res.message, 'error');
      }
    } catch (e) {
      setGitTestResult({ success: false, message: e.message || 'Connection check failed' });
      onNotify?.(e.message || 'Git connection check failed', 'error');
    } finally {
      setTestingGit(false);
    }
  };

  const handleVerifyFolder = async () => {
    if (!frameworkPath.trim()) {
      onNotify?.('Please enter a framework directory path first', 'warning');
      return;
    }
    setVerifyingFolder(true);
    setFolderResult(null);
    try {
      const res = await api.verifyFrameworkFolder({ frameworkPath: frameworkPath.trim() });
      setFolderResult(res);
      if (res.exists) {
        onNotify?.(res.message, 'success');
      } else {
        onNotify?.(res.message, 'error');
      }
    } catch (e) {
      setFolderResult({ exists: false, message: e.message || 'Folder verification failed' });
      onNotify?.(e.message || 'Folder verification failed', 'error');
    } finally {
      setVerifyingFolder(false);
    }
  };

  const handleGenerateAgentToken = async () => {
    setGeneratingToken(true);
    try {
      const res = await api.generateAgentToken(engine.id);
      setLocalAgentId(res.token);
      onNotify?.('New Agent Token generated!', 'success');
    } catch (e) {
      onNotify?.(e.message || 'Failed to generate agent token', 'error');
    } finally {
      setGeneratingToken(false);
    }
  };

  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();

    if (sourceType === 'INBUILT_STUDIO' || sourceType === 'GRID_CLUSTER') {
      const name = sourceType === 'INBUILT_STUDIO' ? 'In-App Playwright Studio' : 'Distributed Grid Cluster';
      onNotify?.(`${name} will be introduced soon! Please select Git Remote, Local Agent, or Developer Mode.`, 'warning');
      return;
    }

    const payload = {
      name: name.trim() || engine.name,
      description: description.trim() || null,
      sourceType
    };

    if (sourceType === 'GIT_REMOTE') {
      const url = gitRepoUrl.trim();
      if (!url) {
        onNotify?.('Please enter a Git repository URL', 'warning');
        return;
      }
      payload.gitRepoUrl = url;
      payload.gitBranch = gitBranch.trim() || 'main';
      payload.gitAuthType = gitAuthType;
      if (gitUsername.trim()) payload.gitUsername = gitUsername.trim();
      if (gitAuthType === 'TOKEN') {
        if (gitToken.trim()) {
          payload.gitToken = gitToken.trim();
        } else if (!engine.gitTokenMasked) {
          onNotify?.('Personal Access Token is required for private repositories', 'warning');
          return;
        }
      }
    } else if (sourceType === 'LOCAL_AGENT') {
      const agent = localAgentId.trim();
      if (!agent) {
        onNotify?.('Please specify a Local Agent identifier', 'warning');
        return;
      }
      payload.localAgentId = agent;
    } else {
      const folder = frameworkPath.trim();
      if (!folder) {
        onNotify?.('Please specify your framework directory path', 'warning');
        return;
      }
      payload.frameworkPath = folder;
    }

    setSaving(true);
    try {
      await api.updateTestEngine(engine.id, payload);
      onSaved?.();
    } catch (err) {
      onNotify?.(err.message || 'Failed to update engine settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Configure Source Mode — ${engine.name}`} onClose={onClose}>
      <form className="eng-modal-form" onSubmit={handleSave}>
        {/* Top Header Row with Developer Mode Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Configure how Testrix fetches and executes this test engine:
          </div>
          <button
            type="button"
            className={`su-dev-mode-btn ${sourceType === 'LOCAL_DEV' ? 'su-dev-mode-btn-active' : ''}`}
            onClick={() => setSourceType(sourceType === 'LOCAL_DEV' ? 'GIT_REMOTE' : 'LOCAL_DEV')}
            title="Toggle Developer Mode for local-to-local execution on your PC"
          >
            <FolderTree size={13} />
            <span>Developer Mode (Local)</span>
            {sourceType === 'LOCAL_DEV' && <span className="su-dev-mode-dot" />}
          </button>
        </div>

        {/* Basic Info */}
        <div className="eng-form-grid">
          <label className="eng-form-field">
            <span>Engine Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="eng-form-field">
            <span>Framework Type</span>
            <input value={engine.engineType} disabled style={{ background: 'var(--bg-inset)', opacity: 0.8 }} />
          </label>
        </div>

        {/* Source Mode Tabs (when not in Developer Mode) */}
        {sourceType !== 'LOCAL_DEV' && (
          <div className="eng-form-field wide">
            <span>Execution Source Mode</span>
            <div className="eng-modal-tabs" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <button
                type="button"
                className={`eng-modal-tab ${sourceType === 'GIT_REMOTE' ? 'active' : ''}`}
                onClick={() => setSourceType('GIT_REMOTE')}
              >
                <div className="eng-tab-title">
                  <GitBranch size={13} color="#3b82f6" /> Git Remote
                </div>
                <div className="eng-tab-desc">Auto-clone from repo per run</div>
              </button>

              <button
                type="button"
                className={`eng-modal-tab ${sourceType === 'LOCAL_AGENT' ? 'active' : ''}`}
                onClick={() => setSourceType('LOCAL_AGENT')}
              >
                <div className="eng-tab-title">
                  <Laptop size={13} color="#10b981" /> Local Agent
                </div>
                <div className="eng-tab-desc">Run behind firewall/VPN</div>
              </button>

              <button
                type="button"
                className={`eng-modal-tab ${sourceType === 'INBUILT_STUDIO' ? 'active' : ''}`}
                onClick={() => setSourceType('INBUILT_STUDIO')}
              >
                <div className="eng-tab-title">
                  <Sparkles size={13} color="#a855f7" /> In-App Studio
                </div>
                <div className="eng-tab-desc">Browser test builder (Soon)</div>
              </button>

              <button
                type="button"
                className={`eng-modal-tab ${sourceType === 'GRID_CLUSTER' ? 'active' : ''}`}
                onClick={() => setSourceType('GRID_CLUSTER')}
              >
                <div className="eng-tab-title">
                  <Cpu size={13} color="#ec4899" /> Grid Cluster
                </div>
                <div className="eng-tab-desc">Parallel worker pool (Soon)</div>
              </button>
            </div>
          </div>
        )}

        {/* ── GIT REMOTE CONFIGURATION ────────────────────────────────────────── */}
        {sourceType === 'GIT_REMOTE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="su-mode-summary-card">
              <div className="su-mode-summary-title">
                <GitBranch size={14} color="#3b82f6" />
                <span>When to use Git Remote:</span>
              </div>
              <p>
                <strong>Designed for Cloud/Live Testrix:</strong> When Testrix is deployed live on a cloud server, it clones your repository into an isolated ephemeral container on every run.
                <br />
                <em>(Note: While running Testrix locally on your PC, Git Remote still works normally using your machine's internet connection).</em>
              </p>
            </div>

            {/* Sub-tabs */}
            <div className="su-subtab-bar">
              <button
                type="button"
                className={`su-subtab-btn ${gitSnippetMode === 'STARTER_KIT' ? 'su-subtab-btn-active' : ''}`}
                onClick={() => setGitSnippetMode('STARTER_KIT')}
              >
                🚀 Push Starter Kit Commands
              </button>
              <button
                type="button"
                className={`su-subtab-btn ${gitSnippetMode === 'EXISTING' ? 'su-subtab-btn-active' : ''}`}
                onClick={() => setGitSnippetMode('EXISTING')}
              >
                📂 Existing Repository (Migrated Framework)
              </button>
            </div>

            {gitSnippetMode === 'EXISTING' && (
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                  Existing Repository Setup:
                </strong>
                Include Testrix reporter (<code>testrix-reporter.ts</code> or <code>PortalApiClient.java</code>) in your framework repo, then enter your repo details below.
              </div>
            )}

            {gitSnippetMode === 'STARTER_KIT' && (
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px' }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
                  Push Starter Kit Step-by-Step Commands:
                </span>
                <div className="su-step-command-list">
                  {[
                    { label: 'Step 1: Initialize Git in extracted folder', cmd: 'git init' },
                    { label: 'Step 2: Stage all files', cmd: 'git add .' },
                    { label: 'Step 3: Initial commit', cmd: 'git commit -m "Initial commit from Testrix starter kit"' },
                    { label: 'Step 4: Rename branch to main', cmd: `git branch -M ${gitBranch || 'main'}` },
                    { label: 'Step 5: Link remote Git repository', cmd: `git remote add origin ${gitRepoUrl.trim() || '<your-git-repo-url>'}` },
                    { label: 'Step 6: Push to remote', cmd: `git push -u origin ${gitBranch || 'main'}` },
                  ].map((s, idx) => (
                    <div key={idx} className="su-step-command-item">
                      <div className="su-step-command-info">
                        <span className="su-step-command-label">{s.label}</span>
                        <code className="su-step-command-text">{s.cmd}</code>
                      </div>
                      <button
                        type="button"
                        className="su-copy-btn"
                        onClick={() => copyStepCommand(s.cmd, idx)}
                      >
                        {copiedCmdIndex === idx ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="eng-form-grid">
              <label className="eng-form-field wide">
                <span>Git Repository URL</span>
                <input
                  placeholder="https://github.com/organization/my-tests.git"
                  value={gitRepoUrl}
                  onChange={(e) => setGitRepoUrl(e.target.value)}
                />
              </label>
              <label className="eng-form-field">
                <span>Branch</span>
                <input
                  placeholder="main"
                  value={gitBranch}
                  onChange={(e) => setGitBranch(e.target.value)}
                />
              </label>
              <label className="eng-form-field">
                <span>Authentication</span>
                <select value={gitAuthType} onChange={(e) => setGitAuthType(e.target.value)}>
                  <option value="NONE">Public Repository (No Auth)</option>
                  <option value="TOKEN">Personal Access Token (Private)</option>
                </select>
              </label>

              {gitAuthType === 'TOKEN' && (
                <>
                  <label className="eng-form-field">
                    <span>Username (Optional)</span>
                    <input
                      placeholder="e.g. github-username"
                      value={gitUsername}
                      onChange={(e) => setGitUsername(e.target.value)}
                    />
                  </label>
                  <label className="eng-form-field">
                    <span>
                      <Lock size={11} style={{ display: 'inline', marginRight: 4 }} />
                      Personal Access Token
                    </span>
                    <input
                      type="password"
                      placeholder={engine.gitTokenMasked ? `Saved (${engine.gitTokenMasked}) — leave blank to keep` : 'ghp_xxxxxxxxxxxxxxxxxxxx'}
                      value={gitToken}
                      onChange={(e) => setGitToken(e.target.value)}
                    />
                  </label>
                  <div className="eng-guide-box wide">
                    <strong>Why a Token instead of regular password?</strong>
                    GitHub discontinued regular passwords for Git operations. For private repos, generate a <strong>Personal Access Token (classic)</strong> with <code>repo</code> scope:
                    <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 11, color: '#38bdf8' }}>
                      GitHub Profile → Settings → Developer Settings → Personal Access Tokens → Tokens (classic) → Generate token (scope: repo)
                    </div>
                  </div>
                </>
              )}
              <div className="eng-form-field wide su-test-bar" style={{ marginTop: 4 }}>
                <button
                  type="button"
                  className="su-test-btn"
                  onClick={handleTestGitConnection}
                  disabled={testingGit || !gitRepoUrl.trim()}
                >
                  <Activity size={13} color="#38bdf8" />
                  {testingGit ? 'Testing Connection...' : 'Test Git Connection'}
                </button>
                {gitTestResult && (
                  <div className={`su-test-status ${gitTestResult.success ? 'su-test-status-success' : 'su-test-status-error'}`}>
                    {gitTestResult.success ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    {gitTestResult.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── LOCAL AGENT CONFIGURATION ─────────────────────────────────────── */}
        {sourceType === 'LOCAL_AGENT' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="su-agent-callout">
              <div className="su-agent-callout-header">
                <Laptop size={15} />
                <span>When &amp; How to use Local Agent (Behind Corporate Firewall / VPN):</span>
              </div>
              <p className="su-agent-callout-desc">
                <strong>Use Case:</strong> When <strong>Testrix is hosted on Cloud</strong>, but your application or test framework is inside an internal company network, VPN, or local PC where Cloud cannot reach inside.
                <br />
                <strong>How it works:</strong> The agent makes an <em>outbound</em> connection to Testrix, so no firewall ports need to be opened!
              </p>
            </div>

            <div className="eng-form-grid">
              <label className="eng-form-field wide">
                <span>Local Agent Identifier</span>
                <input
                  placeholder="e.g. dev-machine-agent-1"
                  value={localAgentId}
                  onChange={(e) => setLocalAgentId(e.target.value)}
                />
              </label>

              <div className="eng-form-field wide su-test-bar">
                <button
                  type="button"
                  className="su-test-btn"
                  onClick={handleGenerateAgentToken}
                  disabled={generatingToken}
                >
                  <TerminalSquare size={13} color="#10b981" />
                  {generatingToken ? 'Generating Token...' : 'Generate New Agent Token'}
                </button>
              </div>

              <div className="eng-form-field wide" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 14px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 8 }}>
                  Run the Agent on Your Machine:
                </span>
                <div className="su-step-command-list">
                  <div className="su-step-command-item">
                    <div className="su-step-command-info">
                      <span className="su-step-command-label">Step 1: Open terminal in your framework folder</span>
                      <code className="su-step-command-text">cd path/to/your/framework</code>
                    </div>
                    <button type="button" className="su-copy-btn" onClick={() => copyStepCommand('cd path/to/your/framework', 201)}>
                      {copiedCmdIndex === 201 ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                  </div>
                  <div className="su-step-command-item">
                    <div className="su-step-command-info">
                      <span className="su-step-command-label">Step 2: Start the agent CLI</span>
                      <code className="su-step-command-text">
                        npx @testrix/agent start --id="{localAgentId || 'my-agent'}" --server="{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:15000'}"
                      </code>
                    </div>
                    <button type="button" className="su-copy-btn" onClick={() => copyStepCommand(`npx @testrix/agent start --id="${localAgentId || 'my-agent'}" --server="${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:15000'}"`, 202)}>
                      {copiedCmdIndex === 202 ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── COMING SOON MODES ─────────────────────────────────────────────── */}
        {sourceType === 'INBUILT_STUDIO' && (
          <div className="su-preview-card">
            <span className="su-preview-card-badge">
              <Sparkles size={12} color="#a855f7" /> Will Introduce Soon (Phase 2)
            </span>
            <h4>In-App Playwright Studio</h4>
            <p>
              Visual browser test recorder &amp; codegen directly inside Testrix. Zero setup required — create and run tests in your browser without local code editors.
            </p>
          </div>
        )}

        {sourceType === 'GRID_CLUSTER' && (
          <div className="su-preview-card">
            <span className="su-preview-card-badge">
              <Cpu size={12} color="#ec4899" /> Will Introduce Soon (Phase 3)
            </span>
            <h4>Distributed Grid / Worker Pool</h4>
            <p>
              High-throughput distributed test execution across Selenium Grid and Playwright cluster nodes with auto-scaling container worker pods.
            </p>
          </div>
        )}

        {/* ── DEVELOPER MODE (LOCAL-TO-LOCAL) ───────────────────────────────── */}
        {sourceType === 'LOCAL_DEV' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="su-mode-summary-card" style={{ background: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
              <div className="su-mode-summary-title" style={{ color: '#f59e0b' }}>
                <FolderTree size={14} />
                <span>Developer Mode Active (Local-to-Local Execution)</span>
              </div>
              <p>
                <strong>Use Case:</strong> Testrix and your test framework are running on the <strong>same computer (localhost)</strong>. Direct folder execution with zero network latency.
                <br />
                <strong>Any Folder Location Supported:</strong> Your framework can be anywhere on your machine (e.g. <code>D:\playwright-js</code>, <code>D:\New folder\MPHIDB</code>, <code>C:\projects\tests</code>, or a subfolder). There is no restriction to save in a specific predefined folder — jahan bhi framework hai, Testrix direct wahan se run karega!
              </p>
            </div>

            <div className="eng-form-grid">
              <label className="eng-form-field wide">
                <span>Framework Directory Path (Any location on your machine)</span>
                <input
                  placeholder={engine.engineType === 'PLAYWRIGHT' ? 'e.g. D:\\playwright-js or my-framework' : 'e.g. D:\\New folder\\MPHIDB or my-framework'}
                  value={frameworkPath}
                  onChange={(e) => setFrameworkPath(e.target.value)}
                />
              </label>

              <div className="eng-form-field wide su-test-bar">
                <button
                  type="button"
                  className="su-test-btn"
                  onClick={handleVerifyFolder}
                  disabled={verifyingFolder || !frameworkPath.trim()}
                >
                  <FolderTree size={13} color="#f59e0b" />
                  {verifyingFolder ? 'Verifying Path...' : 'Verify Folder on Machine'}
                </button>
                {folderResult && (
                  <div className={`su-test-status ${folderResult.exists ? 'su-test-status-success' : 'su-test-status-error'}`}>
                    {folderResult.exists ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    {folderResult.message}
                  </div>
                )}
                {folderResult && !folderResult.exists && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Missing folder?</span>
                    <button
                      type="button"
                      className="eng-btn eng-btn-primary"
                      style={{ fontSize: 11, padding: '4px 10px', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => setSourceType('GIT_REMOTE')}
                    >
                      <Sparkles size={11} />
                      Switch to Git Remote (Live)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Description */}
        <label className="eng-form-field wide" style={{ marginTop: 8 }}>
          <span>Description (Optional)</span>
          <textarea
            placeholder="Notes about this engine deployment or test suite..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {/* Modal Actions */}
        <div className="eng-modal-actions">
          <button type="button" className="eng-btn eng-btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="eng-btn eng-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Git Snippet Modal ─────────────────────────────────────────────────────────
function GitSnippetModal({ engine, onClose, onNotify }) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const repoUrl = engine.gitRepoUrl || '<your-repo-url>';
  const branch = engine.gitBranch || 'main';
  const allSnippet = `git init && git add . && git commit -m "Initial commit from Testrix starter kit" && git branch -M ${branch} && git remote add origin ${repoUrl} && git push -u origin ${branch}`;

  const steps = [
    { label: 'Step 1: Open terminal in extracted folder and initialize Git', cmd: 'git init' },
    { label: 'Step 2: Stage all starter kit files', cmd: 'git add .' },
    { label: 'Step 3: Initial commit', cmd: 'git commit -m "Initial commit from Testrix starter kit"' },
    { label: 'Step 4: Rename default branch to main', cmd: `git branch -M ${branch}` },
    { label: 'Step 5: Link remote Git repository', cmd: `git remote add origin ${repoUrl}` },
    { label: 'Step 6: Push to remote repository', cmd: `git push -u origin ${branch}` },
  ];

  const copySingle = (cmd, idx) => {
    navigator.clipboard.writeText(cmd);
    setCopiedIdx(idx);
    onNotify?.(`Copied: ${cmd}`, 'success');
    setTimeout(() => setCopiedIdx(null), 2500);
  };

  const copyAll = () => {
    navigator.clipboard.writeText(allSnippet);
    setCopiedAll(true);
    onNotify?.('All Git commands copied to clipboard!', 'success');
    setTimeout(() => setCopiedAll(false), 2500);
  };

  return (
    <Modal title={`Push Starter Kit — ${engine.name}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            Run these step-by-step commands inside your extracted starter kit folder:
          </p>
          <button type="button" className="su-copy-btn" onClick={copyAll}>
            {copiedAll ? <><Check size={11} /> Copied All</> : <><Copy size={11} /> Copy All Commands</>}
          </button>
        </div>

        <div className="su-step-command-list">
          {steps.map((s, idx) => (
            <div key={idx} className="su-step-command-item">
              <div className="su-step-command-info">
                <span className="su-step-command-label">{s.label}</span>
                <code className="su-step-command-text">{s.cmd}</code>
              </div>
              <button
                type="button"
                className="su-copy-btn"
                onClick={() => copySingle(s.cmd, idx)}
              >
                {copiedIdx === idx ? <Check size={11} /> : <Copy size={11} />}
              </button>
            </div>
          ))}
        </div>

        <div className="eng-modal-actions">
          <button type="button" className="eng-btn eng-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Register Engine Modal ─────────────────────────────────────────────────────
function RegisterEngineModal({ configRoot, onClose, onCreated, onNotify }) {
  const [frameworkType, setFrameworkType] = useState('PLAYWRIGHT');
  const [name, setName] = useState('Secondary Playwright Engine');
  const [sourceType, setSourceType] = useState('GIT_REMOTE');
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [gitAuthType, setGitAuthType] = useState('NONE');
  const [gitToken, setGitToken] = useState('');
  const [gitUsername, setGitUsername] = useState('');
  const [localAgentId, setLocalAgentId] = useState('');
  const [frameworkPath, setFrameworkPath] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      onNotify?.('Engine name is required', 'warning');
      return;
    }

    if (sourceType === 'INBUILT_STUDIO' || sourceType === 'GRID_CLUSTER') {
      const modeName = sourceType === 'INBUILT_STUDIO' ? 'In-App Playwright Studio' : 'Distributed Grid Cluster';
      onNotify?.(`${modeName} will be introduced soon! Please select Git Remote, Local Agent, or Developer Mode.`, 'warning');
      return;
    }

    const payload = {
      engineType: frameworkType,
      name: name.trim(),
      sourceType
    };

    if (sourceType === 'GIT_REMOTE') {
      if (gitRepoUrl.trim()) payload.gitRepoUrl = gitRepoUrl.trim();
      payload.gitBranch = gitBranch.trim() || 'main';
      payload.gitAuthType = gitAuthType;
      if (gitToken.trim()) payload.gitToken = gitToken.trim();
      if (gitUsername.trim()) payload.gitUsername = gitUsername.trim();
    } else if (sourceType === 'LOCAL_AGENT') {
      if (localAgentId.trim()) payload.localAgentId = localAgentId.trim();
    } else if (sourceType === 'LOCAL_DEV') {
      if (frameworkPath.trim()) payload.frameworkPath = frameworkPath.trim();
    }

    setBusy(true);
    try {
      const res = await api.registerTestEngine(payload);
      // Auto-trigger starter kit download
      try {
        await api.downloadEngineStarterKit(res.engine.id, res.credential?.plaintextKey);
      } catch (ignored) {}
      onCreated?.(res.engine);
    } catch (err) {
      onNotify?.(err.message || 'Failed to register engine', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Register New Test Engine" onClose={onClose}>
      <form className="eng-modal-form" onSubmit={handleSubmit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Register a new framework engine for this workspace:
          </div>
          <button
            type="button"
            className={`su-dev-mode-btn ${sourceType === 'LOCAL_DEV' ? 'su-dev-mode-btn-active' : ''}`}
            onClick={() => setSourceType(sourceType === 'LOCAL_DEV' ? 'GIT_REMOTE' : 'LOCAL_DEV')}
            title="Toggle Developer Mode for local-to-local execution on your PC"
          >
            <FolderTree size={13} />
            <span>Developer Mode (Local)</span>
            {sourceType === 'LOCAL_DEV' && <span className="su-dev-mode-dot" />}
          </button>
        </div>

        <div className="eng-form-grid">
          <label className="eng-form-field">
            <span>Framework</span>
            <select 
              value={frameworkType} 
              onChange={(e) => {
                setFrameworkType(e.target.value);
                setName(`Primary ${e.target.value === 'PLAYWRIGHT' ? 'Playwright' : 'Selenium'} Engine`);
              }}
            >
              <option value="PLAYWRIGHT">Playwright (TypeScript)</option>
              <option value="SELENIUM">Selenium (Java / TestNG)</option>
            </select>
          </label>
          <label className="eng-form-field">
            <span>Engine Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        </div>

        {sourceType !== 'LOCAL_DEV' && (
          <div className="eng-form-field wide">
            <span>Initial Source Mode</span>
            <div className="eng-modal-tabs" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <button
                type="button"
                className={`eng-modal-tab ${sourceType === 'GIT_REMOTE' ? 'active' : ''}`}
                onClick={() => setSourceType('GIT_REMOTE')}
              >
                <div className="eng-tab-title"><GitBranch size={13} color="#3b82f6" /> Git Remote</div>
                <div className="eng-tab-desc">Auto-clone per execution</div>
              </button>
              <button
                type="button"
                className={`eng-modal-tab ${sourceType === 'LOCAL_AGENT' ? 'active' : ''}`}
                onClick={() => setSourceType('LOCAL_AGENT')}
              >
                <div className="eng-tab-title"><Laptop size={13} color="#10b981" /> Local Agent</div>
                <div className="eng-tab-desc">Behind VPN/firewall</div>
              </button>
              <button
                type="button"
                className={`eng-modal-tab ${sourceType === 'INBUILT_STUDIO' ? 'active' : ''}`}
                onClick={() => setSourceType('INBUILT_STUDIO')}
              >
                <div className="eng-tab-title"><Sparkles size={13} color="#a855f7" /> In-App Studio</div>
                <div className="eng-tab-desc">Browser builder (Soon)</div>
              </button>
              <button
                type="button"
                className={`eng-modal-tab ${sourceType === 'GRID_CLUSTER' ? 'active' : ''}`}
                onClick={() => setSourceType('GRID_CLUSTER')}
              >
                <div className="eng-tab-title"><Cpu size={13} color="#ec4899" /> Grid Cluster</div>
                <div className="eng-tab-desc">Worker pool (Soon)</div>
              </button>
            </div>
          </div>
        )}

        {sourceType === 'GIT_REMOTE' && (
          <div className="eng-form-grid">
            <label className="eng-form-field wide">
              <span>Git Repository URL (Optional, can add later)</span>
              <input 
                placeholder="https://github.com/org/repo.git" 
                value={gitRepoUrl} 
                onChange={(e) => setGitRepoUrl(e.target.value)} 
              />
            </label>
          </div>
        )}

        {sourceType === 'LOCAL_AGENT' && (
          <div className="eng-form-grid">
            <label className="eng-form-field wide">
              <span>Local Agent Identifier</span>
              <input 
                placeholder="e.g. office-laptop-agent-1" 
                value={localAgentId} 
                onChange={(e) => setLocalAgentId(e.target.value)} 
              />
            </label>
          </div>
        )}

        {sourceType === 'LOCAL_DEV' && (
          <div className="eng-form-grid">
            <div className="eng-guide-box wide" style={{ background: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.25)' }}>
              <strong style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FolderTree size={14} /> Developer Mode (Local-to-Local)
              </strong>
              Runs directly from any folder on this machine. No specific folder restriction.
            </div>
            <label className="eng-form-field wide">
              <span>Framework Directory Path (Any location on machine)</span>
              <input 
                placeholder="e.g. D:\playwright-js or D:\New folder\MPHIDB or my-framework" 
                value={frameworkPath} 
                onChange={(e) => setFrameworkPath(e.target.value)} 
              />
            </label>
          </div>
        )}

        <div className="eng-modal-actions">
          <button type="button" className="eng-btn eng-btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="eng-btn eng-btn-primary" disabled={busy}>
            {busy ? 'Registering…' : 'Register & Download Starter Kit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
