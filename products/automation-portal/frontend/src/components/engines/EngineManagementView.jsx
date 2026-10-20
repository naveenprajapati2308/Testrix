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
  AlertTriangle
} from 'lucide-react';

export function EngineManagementView({ onNotify, isProjectAdmin, onNavigateToSetup }) {
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
          {isProjectAdmin && (
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
          {isProjectAdmin && (
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
                {isProjectAdmin && (
                  <button 
                    type="button" 
                    className="eng-btn eng-btn-primary"
                    onClick={() => setEditingEngine(engine)}
                  >
                    <Settings2 size={13} />
                    Configure Source
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

                {isProjectAdmin && (engine.status || 'ACTIVE') === 'ACTIVE' && (
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
  const [sourceType, setSourceType] = useState(engine.sourceType || 'GIT_REMOTE');
  const [name, setName] = useState(engine.name || '');
  const [description, setDescription] = useState(engine.description || '');

  // Git remote state
  const [gitRepoUrl, setGitRepoUrl] = useState(engine.gitRepoUrl || '');
  const [gitBranch, setGitBranch] = useState(engine.gitBranch || 'main');
  const [gitAuthType, setGitAuthType] = useState(engine.gitAuthType || 'NONE');
  const [gitUsername, setGitUsername] = useState(engine.gitUsername || '');
  const [gitToken, setGitToken] = useState('');

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
      onNotify?.('Please enter a framework folder name first', 'warning');
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
        onNotify?.('Please specify the folder name under the frameworks root', 'warning');
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

        {/* Source Mode Tabs */}
        <div className="eng-form-field wide">
          <span>Execution Source Mode</span>
          <div className="eng-modal-tabs">
            <button
              type="button"
              className={`eng-modal-tab ${sourceType === 'GIT_REMOTE' ? 'active' : ''}`}
              onClick={() => setSourceType('GIT_REMOTE')}
            >
              <div className="eng-tab-title">
                <GitBranch size={13} color="#3b82f6" /> Git Remote
              </div>
              <div className="eng-tab-desc">Auto-clone from GitHub/GitLab per run</div>
            </button>

            <button
              type="button"
              className={`eng-modal-tab ${sourceType === 'LOCAL_AGENT' ? 'active' : ''}`}
              onClick={() => setSourceType('LOCAL_AGENT')}
            >
              <div className="eng-tab-title">
                <Laptop size={13} color="#10b981" /> Local Agent
              </div>
              <div className="eng-tab-desc">Run on machine behind firewall/VPN</div>
            </button>

            <button
              type="button"
              className={`eng-modal-tab ${sourceType === 'LOCAL_DEV' ? 'active' : ''}`}
              onClick={() => setSourceType('LOCAL_DEV')}
            >
              <div className="eng-tab-title">
                <FolderTree size={13} color="#f59e0b" /> Developer Mode (Local-to-Local)
              </div>
              <div className="eng-tab-desc">Direct execution on machine (Testrix local + framework local)</div>
            </button>
          </div>
        </div>

        {/* Git Remote Configuration */}
        {sourceType === 'GIT_REMOTE' && (
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
                  GitHub discontinued regular account passwords for Git operations in August 2021. For private repos, generate a <strong>Personal Access Token (classic)</strong> with <code>repo</code> scope:
                  <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 11, color: '#38bdf8' }}>
                    GitHub Profile → Settings → Developer Settings → Personal Access Tokens → Tokens (classic) → Generate token (scope: repo)
                  </div>
                </div>
              </>
            )}
            <div className="eng-form-field wide su-test-bar" style={{ marginTop: 6 }}>
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
        )}

        {/* Local Agent Configuration */}
        {sourceType === 'LOCAL_AGENT' && (
          <div className="eng-form-grid">
            <label className="eng-form-field wide">
              <span>Local Agent Identifier</span>
              <input
                placeholder="e.g. dev-machine-agent-1"
                value={localAgentId}
                onChange={(e) => setLocalAgentId(e.target.value)}
              />
            </label>
            <div className="eng-form-field wide su-test-bar" style={{ marginTop: 4 }}>
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
            <div className="eng-guide-box wide">
              <strong>Local Agent Execution</strong>
              The agent polls the Testrix platform for jobs targeted to this identifier and executes tests locally behind your firewall.
            </div>
          </div>
        )}

        {/* Local Dev Folder Configuration */}
        {sourceType === 'LOCAL_DEV' && (
          <div className="eng-form-grid">
            <div className="eng-guide-box wide" style={{ background: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.25)' }}>
              <strong style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FolderTree size={14} /> Developer Mode (Local-to-Local)
              </strong>
              Both Testrix and your test framework run directly on this local machine. No Git cloning or remote agents involved.
            </div>

            <div className="eng-form-field wide">
              <span>Host Frameworks Directory (on your Windows PC)</span>
              <code style={{ background: 'var(--bg-inset)', padding: '8px 12px', borderRadius: 8, fontSize: 12, border: '1px dashed var(--border)', display: 'block' }}>
                D:\testrix-project-frameworks\<b>{frameworkPath.trim() || 'your-folder-name'}</b>
              </code>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Docker container mount: {configRoot || '/app/project-frameworks'}/{frameworkPath.trim() || 'your-folder-name'}
              </span>
            </div>

            <label className="eng-form-field wide">
              <span>Framework Folder Name</span>
              <input
                placeholder={engine.engineType === 'PLAYWRIGHT' ? 'playwright-js or your-folder' : 'MPHIDB or your-folder'}
                value={frameworkPath}
                onChange={(e) => setFrameworkPath(e.target.value)}
              />
            </label>
            <div className="eng-form-field wide su-test-bar" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="su-test-btn"
                onClick={handleVerifyFolder}
                disabled={verifyingFolder || !frameworkPath.trim()}
              >
                <FolderTree size={13} color="#f59e0b" />
                {verifyingFolder ? 'Verifying Folder...' : 'Verify Folder on Server'}
              </button>
              {folderResult && (
                <div className={`su-test-status ${folderResult.exists ? 'su-test-status-success' : 'su-test-status-error'}`}>
                  {folderResult.exists ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  {folderResult.message}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Description */}
        <label className="eng-form-field wide">
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
  const [copied, setCopied] = useState(false);
  const repoUrl = engine.gitRepoUrl || '<your-repo-url>';
  const branch = engine.gitBranch || 'main';
  const snippet = `git init && git add . && git commit -m "Initial commit from Testrix starter kit" && git branch -M ${branch} && git remote add origin ${repoUrl} && git push -u origin ${branch}`;

  const copy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    onNotify?.('Git commands copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Modal title={`Push Starter Kit — ${engine.name}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          If you downloaded the starter kit and want to publish it to your connected Git repository, run these commands inside the extracted directory:
        </p>
        <div className="eng-snippet-box">
          <span>{snippet}</span>
          <button type="button" className="eng-btn eng-btn-secondary" onClick={copy} style={{ height: 30, padding: '0 8px' }}>
            {copied ? <><Check size={12} color="#10b981" /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
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
  const [frameworkPath, setFrameworkPath] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      onNotify?.('Engine name is required', 'warning');
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

        <div className="eng-form-field wide">
          <span>Initial Source Mode</span>
          <div className="eng-modal-tabs">
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
              className={`eng-modal-tab ${sourceType === 'LOCAL_DEV' ? 'active' : ''}`}
              onClick={() => setSourceType('LOCAL_DEV')}
            >
              <div className="eng-tab-title"><FolderTree size={13} color="#f59e0b" /> Local Dev</div>
              <div className="eng-tab-desc">Server directory</div>
            </button>
          </div>
        </div>

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

        {sourceType === 'LOCAL_DEV' && (
          <div className="eng-form-grid">
            <label className="eng-form-field wide">
              <span>Folder Name Under Frameworks Root</span>
              <input 
                placeholder="e.g. my-framework-folder" 
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
