import { useState, useEffect } from 'react';
import { api } from '../../api.js';
import {
  Rocket,
  Download,
  FolderTree,
  PackagePlus,
  Globe2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  GitBranch,
  Laptop,
  Copy,
  Check,
  Lock,
  AlertCircle,
  AlertTriangle,
  Activity,
  X,
  Sparkles,
  Cpu,
  Layers,
  Terminal,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';

const FRAMEWORK_OPTIONS = [
  { type: 'SELENIUM', label: 'Selenium (Java / TestNG)', runnerType: 'MAVEN_TESTNG' },
  { type: 'PLAYWRIGHT', label: 'Playwright (TypeScript)', runnerType: 'PLAYWRIGHT' },
];

const STEP_LABELS = ['Framework & Code', 'Connect Repository', 'First Module', 'Environment', 'Done'];

// Shown instead of the normal Dashboard for a Project Admin whose project has no Test Engine
// configured yet. Supports Git Remote (Cloud / CI/CD), Local Agent, and Local Dev Folder.
export function AutomationSetupWizard({ onFinish }) {
  const [step, setStep] = useState(1);
  const [maxVisitedStep, setMaxVisitedStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null); // { message, tone: 'success' | 'error' | 'warning' }

  const showToast = (message, tone = 'success') => {
    setToast({ message, tone });
  };

  const goToStep = (newStep) => {
    if (newStep > maxVisitedStep) {
      setMaxVisitedStep(newStep);
    }
    setStep(newStep);
  };

  // Validates whether the user can jump/switch directly to a given step
  const canAccessStep = (targetStep) => {
    if (targetStep === step) return { allowed: true };
    // Backward navigation to any previous step or any step already reached is always allowed
    if (targetStep <= maxVisitedStep || targetStep < step) {
      return { allowed: true };
    }
    // Forward validation checks
    if (targetStep >= 2 && !engine) {
      return {
        allowed: false,
        reason: 'Please complete Step 1 (Register Test Engine) before moving forward.',
      };
    }
    if (targetStep >= 3) {
      const isConnected =
        engine &&
        ((engine.sourceType === 'GIT_REMOTE' && (engine.gitRepoUrl || gitRepoUrl.trim())) ||
          (engine.sourceType === 'LOCAL_AGENT' && (engine.localAgentId || localAgentId.trim())) ||
          (engine.sourceType === 'LOCAL_DEV' && (engine.frameworkPath || subfolder.trim())) ||
          subfolder.trim() ||
          gitRepoUrl.trim() ||
          localAgentId.trim());

      if (!isConnected) {
        return {
          allowed: false,
          reason: 'Please configure and connect your test repository in Step 2 first.',
        };
      }
    }
    if (targetStep >= 4 && !createdModuleId) {
      return {
        allowed: false,
        reason: 'Please create your first Module in Step 3 before adding an Environment.',
      };
    }
    if (targetStep >= 5) {
      return {
        allowed: false,
        reason: 'Please complete Environment creation in Step 4 first.',
      };
    }
    return { allowed: true };
  };

  const handleStepClick = (targetStep) => {
    if (targetStep === step) return;
    const check = canAccessStep(targetStep);
    if (!check.allowed) {
      setError(check.reason);
      showToast(check.reason, 'warning');
      return;
    }
    setError('');
    goToStep(targetStep);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const [frameworkType, setFrameworkType] = useState('SELENIUM');
  const [engineName, setEngineName] = useState('Primary Selenium Engine');
  const [nameTouched, setNameTouched] = useState(false);
  const [engine, setEngine] = useState(null);

  // Multi-source mode state
  const [sourceType, setSourceType] = useState('GIT_REMOTE'); // 'GIT_REMOTE' | 'LOCAL_DEV' | 'LOCAL_AGENT'
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [gitAuthType, setGitAuthType] = useState('NONE'); // 'NONE' | 'TOKEN'
  const [gitUsername, setGitUsername] = useState('');
  const [gitToken, setGitToken] = useState('');
  const [localAgentId, setLocalAgentId] = useState('');
  const [copiedGit, setCopiedGit] = useState(false);
  const [gitSnippetMode, setGitSnippetMode] = useState('STARTER_KIT'); // 'STARTER_KIT' | 'EXISTING'
  const [copiedCmdIndex, setCopiedCmdIndex] = useState(null);

  // Connection & Folder Verification States
  const [testingGit, setTestingGit] = useState(false);
  const [gitTestResult, setGitTestResult] = useState(null);
  const [verifyingFolder, setVerifyingFolder] = useState(false);
  const [folderResult, setFolderResult] = useState(null);

  const [rootPath, setRootPath] = useState('');
  const [subfolder, setSubfolder] = useState('');

  const [moduleForm, setModuleForm] = useState({ code: '', name: '', xmlFile: '', reportPath: '' });
  const [createdModuleId, setCreatedModuleId] = useState(null);
  const [envForm, setEnvForm] = useState({ code: '', name: '', baseUrl: '' });

  useEffect(() => {
    api.testEngineConfig().then((cfg) => setRootPath(cfg.projectFrameworksRoot || '')).catch(() => {});
  }, []);

  useEffect(() => {
    if (nameTouched) return;
    setEngineName(frameworkType === 'PLAYWRIGHT' ? 'Primary Playwright Engine' : 'Primary Selenium Engine');
  }, [frameworkType, nameTouched]);

  const currentRunnerType = FRAMEWORK_OPTIONS.find((o) => o.type === frameworkType)?.runnerType;

  const handleGetCode = async (skipDownload = false) => {
    setBusy(true);
    setError('');
    try {
      const result = await api.registerTestEngine({
        engineType: frameworkType,
        name: engineName.trim() || `${frameworkType} Engine`,
      });
      setEngine(result.engine);
      if (!skipDownload) {
        await api.downloadEngineStarterKit(result.engine.id, result.credential?.plaintextKey);
        showToast('Engine registered and starter kit downloaded successfully!', 'success');
      } else {
        showToast('Engine registered successfully! Connect your repository.', 'success');
      }
      goToStep(2);
    } catch (e) {
      setError(e.message);
      showToast(e.message || 'Failed to register test engine.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRedownload = async () => {
    if (!engine) return;
    setBusy(true);
    setError('');
    try {
      await api.downloadEngineStarterKit(engine.id, null);
      showToast('Starter kit downloaded successfully!', 'success');
    } catch (e) {
      setError(e.message);
      showToast(e.message || 'Failed to re-download starter kit.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyGitSnippet = () => {
    const targetUrl = gitRepoUrl.trim() || '<your-git-repo-url>';
    const snippet = `git init && git add . && git commit -m "Initial commit from Testrix starter kit" && git branch -M ${gitBranch || 'main'} && git remote add origin ${targetUrl} && git push -u origin ${gitBranch || 'main'}`;
    navigator.clipboard.writeText(snippet);
    setCopiedGit(true);
    showToast('Git commands copied to clipboard!', 'success');
    setTimeout(() => setCopiedGit(false), 2500);
  };

  const copyStepCommand = (cmdText, index) => {
    navigator.clipboard.writeText(cmdText);
    setCopiedCmdIndex(index);
    showToast(`Copied: ${cmdText}`, 'success');
    setTimeout(() => setCopiedCmdIndex(null), 2500);
  };

  const handleTestGitConnection = async () => {
    if (!gitRepoUrl.trim()) {
      showToast('Please enter a Git repository URL first', 'warning');
      return;
    }
    setTestingGit(true);
    setGitTestResult(null);
    try {
      const res = await api.testGitConnection({
        gitRepoUrl: gitRepoUrl.trim(),
        gitBranch: gitBranch.trim(),
        gitAuthType,
        gitToken: gitAuthType === 'TOKEN' ? gitToken.trim() : null,
        gitUsername: gitUsername.trim() || null
      });
      setGitTestResult(res);
      if (res.success) {
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'error');
      }
    } catch (e) {
      setGitTestResult({ success: false, message: e.message || 'Connection check failed' });
      showToast(e.message || 'Git connection check failed', 'error');
    } finally {
      setTestingGit(false);
    }
  };

  const handleVerifyFolder = async () => {
    if (!subfolder.trim()) {
      showToast('Please enter a framework folder name first', 'warning');
      return;
    }
    setVerifyingFolder(true);
    setFolderResult(null);
    try {
      const res = await api.verifyFrameworkFolder({ frameworkPath: subfolder.trim() });
      setFolderResult(res);
      if (res.exists) {
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'error');
      }
    } catch (e) {
      setFolderResult({ exists: false, message: e.message || 'Folder verification failed' });
      showToast(e.message || 'Folder verification failed', 'error');
    } finally {
      setVerifyingFolder(false);
    }
  };

  const handleSavePath = async () => {
    setError('');
    if (sourceType === 'INBUILT_STUDIO' || sourceType === 'GRID_CLUSTER') {
      const modeName = sourceType === 'INBUILT_STUDIO' ? 'In-App Playwright Studio' : 'Distributed Grid / Worker Pool';
      const msg = `${modeName} will be introduced soon! Please select Git Remote, Local Agent, or Developer Mode for current execution.`;
      setError(msg);
      showToast(msg, 'warning');
      return;
    }
    const payload = { sourceType };

    if (sourceType === 'GIT_REMOTE') {
      const url = gitRepoUrl.trim();
      if (!url) {
        const msg = 'Please enter your Git repository URL (e.g. https://github.com/org/repo.git).';
        setError(msg);
        showToast(msg, 'warning');
        return;
      }
      payload.gitRepoUrl = url;
      payload.gitBranch = gitBranch.trim() || 'main';
      payload.gitAuthType = gitAuthType;
      if (gitAuthType === 'TOKEN') {
        if (!gitToken.trim()) {
          const msg = 'Personal Access Token / Password is required for private repository authentication.';
          setError(msg);
          showToast(msg, 'warning');
          return;
        }
        payload.gitToken = gitToken.trim();
        if (gitUsername.trim()) {
          payload.gitUsername = gitUsername.trim();
        }
      }
    } else if (sourceType === 'LOCAL_AGENT') {
      const agent = localAgentId.trim();
      if (!agent) {
        const msg = 'Please enter a Local Agent ID.';
        setError(msg);
        showToast(msg, 'warning');
        return;
      }
      payload.localAgentId = agent;
    } else {
      const folder = subfolder.trim();
      if (!folder) {
        const msg = 'Enter your framework directory path (e.g. D:\\playwright-js or folder name).';
        setError(msg);
        showToast(msg, 'warning');
        return;
      }
      payload.frameworkPath = folder;
    }

    setBusy(true);
    try {
      const updated = await api.updateTestEngine(engine.id, payload);
      setEngine(updated);
      const modeLabel = sourceType === 'GIT_REMOTE' ? 'Git repository' : sourceType === 'LOCAL_AGENT' ? 'Local Agent' : 'Local folder';
      showToast(`${modeLabel} connected successfully!`, 'success');
      goToStep(3);
    } catch (e) {
      setError(e.message);
      showToast(e.message || 'Failed to update framework configuration.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateModule = async () => {
    const code = moduleForm.code.trim().toUpperCase();
    const name = moduleForm.name.trim();
    const xmlFile = moduleForm.xmlFile.trim();
    if (!code || !name || !xmlFile) {
      const msg = 'Code, Name and Suite/Spec file are required.';
      setError(msg);
      showToast(msg, 'warning');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await api.createModule({
        code,
        name,
        xmlFile,
        reportPath: moduleForm.reportPath.trim() || null,
        runnerType: currentRunnerType,
        testEngineId: engine.id,
      });
      setCreatedModuleId(created.id);
      showToast(`Module ${code} created successfully!`, 'success');
      goToStep(4);
    } catch (e) {
      setError(e.message);
      showToast(e.message || 'Failed to create module.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateEnvironment = async () => {
    const code = envForm.code.trim().toUpperCase();
    const name = envForm.name.trim();
    if (!code || !name) {
      const msg = 'Code and Name are required.';
      setError(msg);
      showToast(msg, 'warning');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await api.createEnvironment({ code, name, baseUrl: envForm.baseUrl.trim() || null, active: true });
      // A Module can't actually run against an Environment until this link is enabled — without
      // it, the wizard would create both and still leave the very first execution blocked.
      if (createdModuleId) {
        await api.enableModuleForEnvironment(createdModuleId, created.id);
      }
      showToast(`Environment ${code} created and linked successfully!`, 'success');
      goToStep(5);
    } catch (e) {
      setError(e.message);
      showToast(e.message || 'Failed to create environment.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="su-page">
      <header className="su-head">
        <div className="su-head-icon"><Rocket size={20} /></div>
        <div>
          <h2>Set up Automation for this workspace</h2>
          <p>
            A few quick steps and your team can start running real tests — this project gets its
            own isolated framework folder, never shared with another project.
          </p>
        </div>
      </header>

      <ol className="su-steps">
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1;
          const isActive = stepNum === step;
          const isDone = stepNum < step;
          const access = canAccessStep(stepNum);

          return (
            <li
              key={label}
              className={`su-step-item ${isActive ? 'su-step-active' : ''} ${isDone ? 'su-step-done' : ''} ${access.allowed ? 'su-step-clickable' : 'su-step-disabled'}`}
              onClick={() => handleStepClick(stepNum)}
              role="button"
              tabIndex={0}
              title={access.allowed ? `Click to jump to Step ${stepNum}: ${label}` : access.reason}
            >
              <span className="su-step-num">
                {isDone ? <CheckCircle2 size={14} /> : stepNum}
              </span>
              <span>{label}</span>
              {!access.allowed && <Lock size={11} style={{ opacity: 0.6, marginLeft: 2 }} />}
            </li>
          );
        })}
      </ol>

      {toast && (
        <div className={`su-toast su-toast-${toast.tone}`}>
          <div className="su-toast-content">
            {toast.tone === 'success' && <CheckCircle2 size={16} />}
            {toast.tone === 'error' && <AlertCircle size={16} />}
            {toast.tone === 'warning' && <AlertTriangle size={16} />}
            <span>{toast.message}</span>
          </div>
          <button type="button" className="su-toast-close" onClick={() => setToast(null)} title="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {error && !toast && <p className="su-error">{error}</p>}

      <div className="su-card">
        {step === 1 && (
          <>
            <h3><Download size={16} /> Step 1 — Get your framework code</h3>
            <p className="su-hint">
              Pick a framework. We'll register it for this project and give you a ready-to-run
              starter kit — just add your own test scripts to it.
            </p>
            <div className="su-framework-choice">
              {FRAMEWORK_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  className={`su-framework-card ${frameworkType === opt.type ? 'su-framework-card-selected' : ''}`}
                  onClick={() => setFrameworkType(opt.type)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <label className="su-field">
              <span>Engine name</span>
              <input
                value={engineName}
                onChange={(e) => { setEngineName(e.target.value); setNameTouched(true); }}
              />
            </label>
            <div className="su-actions">
              {engine && (
                <button
                  type="button"
                  className="su-secondary-btn"
                  onClick={() => goToStep(2)}
                  style={{ marginRight: 'auto' }}
                >
                  Return to Step 2 <ArrowRight size={14} />
                </button>
              )}
              <button className="su-secondary-btn" onClick={() => handleGetCode(true)} disabled={busy}>
                I already have existing framework / code (Skip download)
              </button>
              <button className="su-primary-btn" onClick={() => handleGetCode(false)} disabled={busy}>
                {busy ? 'Preparing…' : <>Create &amp; Download Starter Kit <ArrowRight size={14} /></>}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="su-step-header-row">
              <div>
                <h3 style={{ margin: 0 }}><GitBranch size={16} /> Step 2 — Connect your test framework</h3>
                <p className="su-hint" style={{ margin: '4px 0 0 0' }}>
                  Choose how Testrix reaches and executes your automation code:
                </p>
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

            {/* ── Main Production / Cloud Modes (when not in Developer Mode) ──── */}
            {sourceType !== 'LOCAL_DEV' && (
              <div className="su-mode-tabs" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <button
                  type="button"
                  className={`su-mode-tab ${sourceType === 'GIT_REMOTE' ? 'su-mode-tab-active' : ''}`}
                  onClick={() => setSourceType('GIT_REMOTE')}
                >
                  <div className="su-mode-tab-title">
                    <GitBranch size={14} color="#3b82f6" /> Git Remote
                    <span className="su-badge-rec">Live</span>
                  </div>
                  <div className="su-mode-tab-desc">Auto-clone from GitHub/GitLab per run.</div>
                </button>

                <button
                  type="button"
                  className={`su-mode-tab ${sourceType === 'LOCAL_AGENT' ? 'su-mode-tab-active' : ''}`}
                  onClick={() => setSourceType('LOCAL_AGENT')}
                >
                  <div className="su-mode-tab-title">
                    <Laptop size={14} color="#10b981" /> Local Agent
                    <span className="su-badge-rec" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>VPN/Private</span>
                  </div>
                  <div className="su-mode-tab-desc">Runs inside private network/firewall.</div>
                </button>

                <button
                  type="button"
                  className={`su-mode-tab ${sourceType === 'INBUILT_STUDIO' ? 'su-mode-tab-active' : ''}`}
                  onClick={() => setSourceType('INBUILT_STUDIO')}
                >
                  <div className="su-mode-tab-title">
                    <Sparkles size={14} color="#a855f7" /> In-App Studio
                    <span className="su-badge-soon">Soon</span>
                  </div>
                  <div className="su-mode-tab-desc">Browser Playwright test recorder.</div>
                </button>

                <button
                  type="button"
                  className={`su-mode-tab ${sourceType === 'GRID_CLUSTER' ? 'su-mode-tab-active' : ''}`}
                  onClick={() => setSourceType('GRID_CLUSTER')}
                >
                  <div className="su-mode-tab-title">
                    <Cpu size={14} color="#ec4899" /> Grid Cluster
                    <span className="su-badge-soon">Soon</span>
                  </div>
                  <div className="su-mode-tab-desc">Multi-browser worker pool execution.</div>
                </button>
              </div>
            )}

            {/* ── MODE 1: GIT REMOTE ────────────────────────────────────────── */}
            {sourceType === 'GIT_REMOTE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                <div className="su-mode-summary-card">
                  <div className="su-mode-summary-title">
                    <GitBranch size={14} color="#3b82f6" />
                    <span>When to use Git Remote:</span>
                  </div>
                  <p>
                    <strong>Designed for Cloud/Live Testrix:</strong> When Testrix is deployed live on a cloud server (AWS, GCP, etc.), it clones your repository into an isolated ephemeral container on every run.
                    <br />
                    <em>(Note: While running Testrix locally on your PC, Git Remote still works normally using your machine's internet connection).</em>
                  </p>
                </div>

                {/* Sub-tabs for Existing Repository vs Starter Kit */}
                <div className="su-subtab-bar">
                  <button
                    type="button"
                    className={`su-subtab-btn ${gitSnippetMode === 'STARTER_KIT' ? 'su-subtab-btn-active' : ''}`}
                    onClick={() => setGitSnippetMode('STARTER_KIT')}
                  >
                    🚀 I'm using Testrix Starter Kit (New Framework)
                  </button>
                  <button
                    type="button"
                    className={`su-subtab-btn ${gitSnippetMode === 'EXISTING' ? 'su-subtab-btn-active' : ''}`}
                    onClick={() => setGitSnippetMode('EXISTING')}
                  >
                    📂 I have an Existing Git Repository (Migrated Framework)
                  </button>
                </div>

                {/* Tab A: Existing Repository instructions */}
                {gitSnippetMode === 'EXISTING' && (
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 14px', fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
                      Steps to Connect Your Existing Framework:
                    </strong>
                    <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <li>Ensure your repository contains your test suites (e.g. TestNG XML files or Playwright specs).</li>
                      <li>Include the Testrix event listener/reporter (copy <code>testrix-reporter.ts</code> for Playwright or <code>PortalApiClient.java</code> for Selenium).</li>
                      <li>Enter your repository URL and branch below.</li>
                      <li>For private repositories, provide a Personal Access Token (PAT) with <code>repo:read</code> access.</li>
                      <li>Click <strong>Test Git Connection</strong> to verify immediate connectivity.</li>
                    </ol>
                  </div>
                )}

                {/* Tab B: Starter Kit Step-by-Step Instructions */}
                {gitSnippetMode === 'STARTER_KIT' && (
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                        Step-by-Step: Push Downloaded Starter Kit to Your Git Repo:
                      </span>
                      <button
                        type="button"
                        className="su-copy-btn"
                        onClick={copyGitSnippet}
                        title="Copy all commands as a single script"
                      >
                        {copiedGit ? <><Check size={11} /> All Copied</> : <><Copy size={11} /> Copy All Commands</>}
                      </button>
                    </div>

                    <div className="su-step-command-list">
                      {[
                        { label: 'Step 1: Open terminal in extracted folder and initialize Git', cmd: 'git init' },
                        { label: 'Step 2: Stage all starter kit files', cmd: 'git add .' },
                        { label: 'Step 3: Commit initial framework code', cmd: 'git commit -m "Initial commit with Testrix starter kit"' },
                        { label: 'Step 4: Rename default branch to main', cmd: `git branch -M ${gitBranch || 'main'}` },
                        { label: 'Step 5: Link to your remote Git repository', cmd: `git remote add origin ${gitRepoUrl.trim() || '<your-git-repo-url>'}` },
                        { label: 'Step 6: Push your code to remote', cmd: `git push -u origin ${gitBranch || 'main'}` },
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
                            title="Copy this command"
                          >
                            {copiedCmdIndex === idx ? <Check size={11} /> : <Copy size={11} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Git Repository Form */}
                <div className="su-form-grid" style={{ marginTop: 4 }}>
                  <label className="su-field su-field-wide">
                    <span>Git Repository URL</span>
                    <input
                      placeholder="https://github.com/organization/my-test-suite.git"
                      value={gitRepoUrl}
                      onChange={(e) => setGitRepoUrl(e.target.value)}
                    />
                  </label>
                  <label className="su-field">
                    <span>Branch</span>
                    <input
                      placeholder="main"
                      value={gitBranch}
                      onChange={(e) => setGitBranch(e.target.value)}
                    />
                  </label>
                  <label className="su-field">
                    <span>Authentication</span>
                    <select
                      className="su-field input"
                      value={gitAuthType}
                      onChange={(e) => setGitAuthType(e.target.value)}
                      style={{ height: 38, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', padding: '0 12px' }}
                    >
                      <option value="NONE">Public Repository (No Auth Required)</option>
                      <option value="TOKEN">Token / Private Authentication</option>
                    </select>
                  </label>

                  {gitAuthType === 'TOKEN' && (
                    <>
                      <label className="su-field">
                        <span>Username / Account (optional)</span>
                        <input
                          placeholder="e.g. github-username"
                          value={gitUsername}
                          onChange={(e) => setGitUsername(e.target.value)}
                        />
                      </label>
                      <label className="su-field">
                        <span><Lock size={12} style={{ display: 'inline', marginRight: 4 }} /> Access Token / Password</span>
                        <input
                          type="password"
                          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                          value={gitToken}
                          onChange={(e) => setGitToken(e.target.value)}
                        />
                      </label>
                      <div className="su-field-wide" style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Why a Token instead of regular password?</strong>
                        <p style={{ margin: '4px 0 0 0' }}>
                          GitHub/GitLab discontinued regular account passwords for Git operations. For private repos, generate a <strong>Personal Access Token (classic)</strong> with <code>repo</code> scope:
                        </p>
                        <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 11, color: '#38bdf8' }}>
                          GitHub Profile → Settings → Developer Settings → Personal Access Tokens → Tokens (classic) → Generate token (scope: repo)
                        </div>
                      </div>
                    </>
                  )}

                  <div className="su-field-wide su-test-bar">
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

            {/* ── MODE 2: LOCAL AGENT ──────────────────────────────────────── */}
            {sourceType === 'LOCAL_AGENT' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                <div className="su-agent-callout">
                  <div className="su-agent-callout-header">
                    <Laptop size={15} />
                    <span>When &amp; How to use Local Agent (Behind Corporate Firewall / VPN):</span>
                  </div>
                  <p className="su-agent-callout-desc">
                    <strong>Use Case:</strong> When <strong>Testrix is hosted on the Cloud</strong>, but your application or test framework is inside an internal company network, VPN, or your local machine that the internet cannot reach.
                    <br />
                    <strong>How it works:</strong> The agent makes an <em>outbound</em> connection to Testrix, so you <strong>do NOT have to open any inbound firewall ports</strong> or expose your network!
                  </p>
                </div>

                <div className="su-form-grid">
                  <label className="su-field su-field-wide">
                    <span>Local Agent Identifier</span>
                    <input
                      placeholder="e.g. office-laptop-agent-1"
                      value={localAgentId}
                      onChange={(e) => setLocalAgentId(e.target.value)}
                    />
                  </label>

                  <div className="su-field-wide" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 14px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 8 }}>
                      Step-by-Step: Run the Agent on Your Machine:
                    </span>

                    <div className="su-step-command-list">
                      <div className="su-step-command-item">
                        <div className="su-step-command-info">
                          <span className="su-step-command-label">Step 1: Open terminal in your framework folder</span>
                          <code className="su-step-command-text">cd path/to/your/framework</code>
                        </div>
                        <button
                          type="button"
                          className="su-copy-btn"
                          onClick={() => copyStepCommand('cd path/to/your/framework', 101)}
                        >
                          {copiedCmdIndex === 101 ? <Check size={11} /> : <Copy size={11} />}
                        </button>
                      </div>

                      <div className="su-step-command-item">
                        <div className="su-step-command-info">
                          <span className="su-step-command-label">Step 2: Start the agent with your unique identifier</span>
                          <code className="su-step-command-text">
                            npx @testrix/agent start --id="{localAgentId || 'my-agent'}" --server="{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:15000'}"
                          </code>
                        </div>
                        <button
                          type="button"
                          className="su-copy-btn"
                          onClick={() => copyStepCommand(`npx @testrix/agent start --id="${localAgentId || 'my-agent'}" --server="${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:15000'}"`, 102)}
                        >
                          {copiedCmdIndex === 102 ? <Check size={11} /> : <Copy size={11} />}
                        </button>
                      </div>

                      <div className="su-step-command-item">
                        <div className="su-step-command-info">
                          <span className="su-step-command-label">Step 3: Agent establishes outbound connection and waits for runs</span>
                          <code className="su-step-command-text">[STATUS: CONNECTED] Ready to execute tests</code>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── MODE 4: IN-APP PLAYWRIGHT STUDIO (COMING SOON) ────────────── */}
            {sourceType === 'INBUILT_STUDIO' && (
              <div className="su-preview-card">
                <span className="su-preview-card-badge">
                  <Sparkles size={12} color="#a855f7" /> Will Introduce Soon in Phase 2
                </span>
                <h4>In-App Playwright Studio (Browser-Based Test Builder)</h4>
                <p>
                  Create, record, and maintain end-to-end Playwright tests directly within Testrix without touching any terminal, Node.js, or local Git repositories.
                </p>
                <div className="su-preview-features">
                  <div className="su-preview-feature-item">
                    <strong>🎬 Visual Test Recorder</strong>
                    Click elements on your live website to record interactions and assertions automatically.
                  </div>
                  <div className="su-preview-feature-item">
                    <strong>💻 Zero Local Setup</strong>
                    No VS Code, Node.js, or local dependencies needed. Ready in seconds for QA engineers.
                  </div>
                  <div className="su-preview-feature-item">
                    <strong>⚡ Instant In-Portal Runs</strong>
                    Run recorded tests directly inside Testrix with live logs and video playback.
                  </div>
                </div>
                <p style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  For now, please select <strong>Git Remote</strong>, <strong>Local Agent</strong>, or <strong>Developer Mode (Local)</strong> above to connect your test code.
                </p>
              </div>
            )}

            {/* ── MODE 5: DISTRIBUTED GRID / WORKER POOL (COMING SOON) ──────── */}
            {sourceType === 'GRID_CLUSTER' && (
              <div className="su-preview-card">
                <span className="su-preview-card-badge">
                  <Cpu size={12} color="#ec4899" /> Will Introduce Soon in Phase 3
                </span>
                <h4>Distributed Grid / Worker Pool (Container Cluster)</h4>
                <p>
                  High-scale enterprise parallel execution across distributed Selenium Grid and Playwright worker nodes. Package frameworks into container images and run across multiple browser nodes simultaneously.
                </p>
                <div className="su-preview-features">
                  <div className="su-preview-feature-item">
                    <strong>🚀 50+ Parallel Suites</strong>
                    Distribute test suites across scalable Docker worker pods for lightning-fast regression runs.
                  </div>
                  <div className="su-preview-feature-item">
                    <strong>🌐 Multi-Browser Cluster</strong>
                    Simultaneous cross-browser validation on Chrome, Firefox, Safari (WebKit), and Edge.
                  </div>
                  <div className="su-preview-feature-item">
                    <strong>⚖️ Dynamic Load Balancing</strong>
                    Intelligent queue-based dispatch with automatic slot management and fault isolation.
                  </div>
                </div>
                <p style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  For now, please select <strong>Git Remote</strong>, <strong>Local Agent</strong>, or <strong>Developer Mode (Local)</strong> above to connect your test code.
                </p>
              </div>
            )}

            {/* ── MODE 3: DEVELOPER MODE (LOCAL-TO-LOCAL / ANY FOLDER) ────────── */}
            {sourceType === 'LOCAL_DEV' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                <div className="su-mode-summary-card" style={{ background: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                  <div className="su-mode-summary-title" style={{ color: '#f59e0b' }}>
                    <FolderTree size={14} />
                    <span>Developer Mode Active (Local-to-Local Execution)</span>
                  </div>
                  <p>
                    <strong>Use Case:</strong> Testrix and your framework are on the <strong>same computer (localhost)</strong>. Direct folder execution with zero network latency.
                    <br />
                    <strong>Any Folder Location Supported:</strong> Your framework can be anywhere on your machine (e.g. <code>D:\playwright-js</code>, <code>D:\New folder\MPHIDB</code>, <code>C:\projects\tests</code>, or a subfolder). There is no restriction to save in a specific predefined folder — jahan bhi framework hai, Testrix direct wahan se run karega!
                  </p>
                </div>

                <div className="su-form-grid">
                  <label className="su-field su-field-wide">
                    <span>Framework Directory Path (Any location on your machine)</span>
                    <input
                      placeholder="e.g. D:\playwright-js or D:\New folder\MPHIDB or my-framework"
                      value={subfolder}
                      onChange={(e) => setSubfolder(e.target.value)}
                    />
                  </label>

                  <div className="su-field-wide su-test-bar">
                    <button
                      type="button"
                      className="su-test-btn"
                      onClick={handleVerifyFolder}
                      disabled={verifyingFolder || !subfolder.trim()}
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
                  </div>
                </div>
              </div>
            )}

            <div className="su-actions">
              <button
                type="button"
                className="su-back-btn"
                onClick={() => goToStep(1)}
                disabled={busy}
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button className="su-secondary-btn" onClick={handleRedownload} disabled={busy}>
                Re-download starter kit
              </button>
              <button className="su-primary-btn" onClick={handleSavePath} disabled={busy}>
                {busy ? 'Saving…' : <>Connect &amp; Continue <ArrowRight size={14} /></>}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h3><PackagePlus size={16} /> Step 3 — Create your first Module</h3>
            <p className="su-hint">
              A Module points at one suite/spec inside your framework folder — you can add more
              later from Manage Modules.
            </p>
            <div className="su-form-grid">
              <label className="su-field">
                <span>Module code</span>
                <input
                  placeholder="e.g. LOGIN"
                  value={moduleForm.code}
                  onChange={(e) => setModuleForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                />
              </label>
              <label className="su-field">
                <span>Module name</span>
                <input
                  placeholder="e.g. Login Suite"
                  value={moduleForm.name}
                  onChange={(e) => setModuleForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label className="su-field">
                <span>Suite / spec file</span>
                <input
                  placeholder={frameworkType === 'PLAYWRIGHT' ? 'e.g. tests/login.spec.ts' : 'e.g. testng.xml'}
                  value={moduleForm.xmlFile}
                  onChange={(e) => setModuleForm((f) => ({ ...f, xmlFile: e.target.value }))}
                />
              </label>
              <label className="su-field">
                <span>Report path (optional)</span>
                <input
                  value={moduleForm.reportPath}
                  onChange={(e) => setModuleForm((f) => ({ ...f, reportPath: e.target.value }))}
                />
              </label>
            </div>
            <div className="su-actions">
              <button
                type="button"
                className="su-back-btn"
                onClick={() => goToStep(2)}
                disabled={busy}
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button className="su-primary-btn" onClick={handleCreateModule} disabled={busy}>
                {busy ? 'Creating…' : <>Create Module <ArrowRight size={14} /></>}
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h3><Globe2 size={16} /> Step 4 — Add an Environment</h3>
            <p className="su-hint">
              Where should tests run against? You can add more environments any time from the
              Environments tab.
            </p>
            <div className="su-form-grid">
              <label className="su-field">
                <span>Code</span>
                <input
                  placeholder="e.g. UAT"
                  value={envForm.code}
                  onChange={(e) => setEnvForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                />
              </label>
              <label className="su-field">
                <span>Name</span>
                <input
                  placeholder="e.g. UAT"
                  value={envForm.name}
                  onChange={(e) => setEnvForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label className="su-field su-field-wide">
                <span>Base URL (optional)</span>
                <input
                  placeholder="https://…"
                  value={envForm.baseUrl}
                  onChange={(e) => setEnvForm((f) => ({ ...f, baseUrl: e.target.value }))}
                />
              </label>
            </div>
            <div className="su-actions">
              <button
                type="button"
                className="su-back-btn"
                onClick={() => goToStep(3)}
                disabled={busy}
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button className="su-primary-btn" onClick={handleCreateEnvironment} disabled={busy}>
                {busy ? 'Creating…' : <>Create Environment <ArrowRight size={14} /></>}
              </button>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <h3><CheckCircle2 size={16} color="var(--success-text)" /> You're all set</h3>
            <p className="su-hint">
              Your framework is registered, your first module and environment are ready. From here
              you can:
            </p>
            <ul className="su-done-list">
              <li>Run your first execution from the Execution Center</li>
              <li>Add teammates from Team Management, with access based on their role</li>
              <li>Read the full setup &amp; usage manual from the Integration Guide</li>
            </ul>
            <div className="su-actions">
              <button
                type="button"
                className="su-back-btn"
                onClick={() => goToStep(4)}
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button className="su-primary-btn" onClick={onFinish}>
                Go to Dashboard <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// Shown to any non-Project-Admin project member while Automation isn't set up yet — they can't
// complete the wizard themselves (Module/Environment creation is Project-Admin-gated), so it
// would be a dead end for them.
export function AutomationSetupPending() {
  return (
    <section className="su-page">
      <div className="su-pending-card">
        <Rocket size={28} />
        <h3>Automation isn't set up for this workspace yet</h3>
        <p>
          Ask your Project Admin to complete the one-time Automation setup — pick a framework,
          download the starter kit, and add the first module &amp; environment. Once that's done,
          this page will show the usual dashboard for everyone.
        </p>
      </div>
    </section>
  );
}
