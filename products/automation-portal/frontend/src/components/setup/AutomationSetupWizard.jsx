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
  GitBranch,
  Laptop,
  Copy,
  Check,
  Lock,
  AlertCircle,
  AlertTriangle,
  Activity,
  X,
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null); // { message, tone: 'success' | 'error' | 'warning' }

  const showToast = (message, tone = 'success') => {
    setToast({ message, tone });
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
      setStep(2);
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
        const msg = 'Enter the folder name you extracted the framework into.';
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
      setStep(3);
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
      setStep(4);
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
      setStep(5);
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
        {STEP_LABELS.map((label, i) => (
          <li key={label} className={i + 1 === step ? 'su-step-active' : i + 1 < step ? 'su-step-done' : ''}>
            <span className="su-step-num">{i + 1 < step ? <CheckCircle2 size={14} /> : i + 1}</span>
            {label}
          </li>
        ))}
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
            <h3><GitBranch size={16} /> Step 2 — Connect your test framework</h3>
            <p className="su-hint">
              Choose how Testrix reaches your tests. Select the mode that matches where your framework files are located:
            </p>

            <div className="su-mode-tabs">
              <button
                type="button"
                className={`su-mode-tab ${sourceType === 'GIT_REMOTE' ? 'su-mode-tab-active' : ''}`}
                onClick={() => setSourceType('GIT_REMOTE')}
              >
                <div className="su-mode-tab-title">
                  <GitBranch size={14} color="#3b82f6" /> Git Remote
                  <span className="su-badge-rec">Recommended</span>
                </div>
                <div className="su-mode-tab-desc">Auto-clone from GitHub, GitLab, or Bitbucket per execution.</div>
              </button>

              <button
                type="button"
                className={`su-mode-tab ${sourceType === 'LOCAL_AGENT' ? 'su-mode-tab-active' : ''}`}
                onClick={() => setSourceType('LOCAL_AGENT')}
              >
                <div className="su-mode-tab-title">
                  <Laptop size={14} color="#10b981" /> Local Agent
                </div>
                <div className="su-mode-tab-desc">Directly runs from ANY drive/folder on your PC (F:\, C:\, Desktop).</div>
              </button>

              <button
                type="button"
                className={`su-mode-tab ${sourceType === 'LOCAL_DEV' ? 'su-mode-tab-active' : ''}`}
                onClick={() => setSourceType('LOCAL_DEV')}
              >
                <div className="su-mode-tab-title">
                  <FolderTree size={14} color="#f59e0b" /> Local Dev Folder
                </div>
                <div className="su-mode-tab-desc">Shared mount folder directly on the Testrix Docker host server.</div>
              </button>
            </div>

            {sourceType === 'GIT_REMOTE' && (
              <div className="su-mode-summary-card">
                <div className="su-mode-summary-title">
                  <GitBranch size={14} color="#3b82f6" />
                  <span>How Git Remote Works:</span>
                </div>
                <p>
                  No local files or folder paths needed! On every execution run, Testrix clones an isolated, clean copy of your repository and executes tests inside Docker.
                </p>
              </div>
            )}

            {sourceType === 'LOCAL_AGENT' && (
              <div className="su-agent-guide-card">
                <h4><Laptop size={15} color="#10b981" /> How Local Agent Works (Any Folder / Drive):</h4>
                <ol className="su-agent-steps">
                  <li><strong>Your files stay where they are:</strong> Keep your framework on any drive or folder (e.g. <code>F:\my-automation-tests</code>, <code>C:\projects</code>, Desktop).</li>
                  <li><strong>No Docker copying:</strong> You do NOT need to copy or move files to Docker directories.</li>
                  <li><strong>Run the CLI Agent:</strong> Open a terminal inside your framework folder (e.g. <code>cd F:\my-automation-tests</code>) and run the command shown below.</li>
                  <li><strong>Automatic execution:</strong> Whenever you click Run in Testrix, the agent picks up the job, executes it on your machine, and streams reports back to the UI!</li>
                </ol>
              </div>
            )}

            {sourceType === 'LOCAL_DEV' && (
              <div className="su-tip-box">
                <FolderTree size={14} color="#f59e0b" />
                <span>
                  <strong>Server Shared Directory Mount:</strong> This mode runs tests from the server's shared mount directory. If your framework is already in another drive (e.g. <code>F:\</code>, <code>C:\</code>, Desktop) and you don't want to move files, select <strong>Local Agent</strong> above!
                </span>
              </div>
            )}

            {sourceType === 'GIT_REMOTE' && (
              <div className="su-form-grid">
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
                        GitHub discontinued regular account passwords for Git operations in August 2021. For private repos, generate a <strong>Personal Access Token (classic)</strong> with <code>repo</code> scope:
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

                <div className="su-field-wide su-snippet-container">
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>
                    Just downloaded the starter kit? Push it to your Git repository:
                  </span>
                  <div className="su-snippet-box">
                    <span>git init &amp;&amp; git add . &amp;&amp; git commit -m "Initial commit" &amp;&amp; git push</span>
                    <button type="button" className="su-copy-btn" onClick={copyGitSnippet}>
                      {copiedGit ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy commands</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {sourceType === 'LOCAL_AGENT' && (
              <div className="su-form-grid">
                <label className="su-field su-field-wide">
                  <span>Local Agent Identifier</span>
                  <input
                    placeholder="e.g. dev-laptop-agent-1"
                    value={localAgentId}
                    onChange={(e) => setLocalAgentId(e.target.value)}
                  />
                </label>
                <div className="su-field-wide su-snippet-container">
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>
                    Quickstart Command for Local Agent:
                  </span>
                  <div className="su-snippet-box">
                    <span>npx @testrix/agent start --id="{localAgentId || 'my-agent'}" --dir="./my-framework"</span>
                    <button
                      type="button"
                      className="su-copy-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(`npx @testrix/agent start --id="${localAgentId || 'my-agent'}" --dir="./my-framework"`);
                        showToast('Agent quickstart command copied!', 'success');
                      }}
                    >
                      <Copy size={12} /> Copy
                    </button>
                  </div>
                </div>
                <p className="su-hint su-field-wide">
                  The Testrix Local Agent runs on your development machine, polls for assigned test executions, and securely streams results back.
                </p>
              </div>
            )}

            {sourceType === 'LOCAL_DEV' && (
              <>
                <div className="su-path-explanation">
                  <div className="su-path-row">
                    <span className="su-path-label">Host Directory (on your Windows PC):</span>
                    <code className="su-path-box">
                      D:\testrix-project-frameworks\<b>{subfolder.trim() || 'your-folder-name'}</b>
                    </code>
                  </div>
                  <div className="su-path-row-sub">
                    Mounted into Testrix Docker container at: <code>{rootPath || '/app/project-frameworks'}/{subfolder.trim() || 'your-folder-name'}</code>
                  </div>
                </div>

                <label className="su-field" style={{ marginTop: 6 }}>
                  <span>Folder name (subfolder under D:\testrix-project-frameworks)</span>
                  <input
                    placeholder="e.g. testrix-selenium-starter or your-folder"
                    value={subfolder}
                    onChange={(e) => setSubfolder(e.target.value)}
                  />
                </label>
                <div className="su-test-bar" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="su-test-btn"
                    onClick={handleVerifyFolder}
                    disabled={verifyingFolder || !subfolder.trim()}
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
              </>
            )}

            <div className="su-actions">
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
