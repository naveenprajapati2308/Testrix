import { Globe2, Pencil, Plus, Save, ToggleLeft, ToggleRight, Trash2, Workflow, TriangleAlert, KeyRound, RotateCw, Ban, Copy, Check, Cpu, FolderTree, FileDown, Download } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, auth } from '../../api.js';
import { Field } from '../shared/Field.jsx';
import { Panel, DataTable, Modal, ConfirmDialog } from '../shared/index.jsx';
import { Loader } from '../../../../../shared/ui/Loader.jsx';

export const MODULE_LABELS = {
  API_TESTING: 'API Testing',
  AUTOMATION_SELENIUM: 'Automation (Selenium)',
  AUTOMATION_PLAYWRIGHT: 'Automation (Playwright)',
  PERFORMANCE_TESTING: 'Performance Testing'
};

const ENGINE_TYPE_LABELS = { SELENIUM: 'Selenium', PLAYWRIGHT: 'Playwright' };
const HEALTH_COLORS = {
  HEALTHY: 'var(--success, #22c55e)',
  STALE: '#eab308',
  NEVER_CONNECTED: 'var(--text-muted)',
  DISABLED: 'var(--danger, #ef4444)'
};

// ── Project Admin's own Workspace Settings page — profile fields, which Testrix products this
// workspace has access to, and this workspace's own Environments. Individual Automation test-
// suite Modules (LAND/ARCHITECT/etc.) stay Super-Admin-authored — real deployed test code, not
// something a form creates — so they're deliberately not managed here. ─────────────────────────
export function WorkspaceSettings({ setNotice }) {
  const project = auth.get()?.project;
  const [settings, setSettings] = useState(null);
  const [environments, setEnvironments] = useState([]);
  const [profileForm, setProfileForm] = useState(null);
  const [showCreateEnv, setShowCreateEnv] = useState(false);
  const [editEnv, setEditEnv] = useState(null);
  const [removeEnv, setRemoveEnv] = useState(null);
  const [testEngines, setTestEngines] = useState([]);
  const [showRegisterEngine, setShowRegisterEngine] = useState(false);
  const [issuedCredential, setIssuedCredential] = useState(null);
  const [disableEngine, setDisableEngine] = useState(null);
  const [revokeEngineTarget, setRevokeEngineTarget] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    return Promise.allSettled([
      api.workspaceSettings(project.id).then((s) => { setSettings(s); setProfileForm(s); }).catch((e) => setNotice(e.message)),
      api.environments().then(setEnvironments).catch((e) => setNotice(e.message)),
      api.testEngines().then(setTestEngines).catch((e) => setNotice(e.message))
    ]).finally(() => setLoading(false));
  };
  useEffect(() => { if (project) load(); }, []);

  const rotateEngineCredential = async (engine) => {
    try {
      const cred = await api.rotateTestEngineCredential(engine.id);
      setIssuedCredential({ engine, ...cred });
      load();
    } catch (err) {
      setNotice(err.message);
    }
  };

  const downloadStarterKit = async (engine) => {
    try {
      await api.downloadEngineStarterKit(engine.id);
      setNotice(`Starter kit downloaded — paste "${engine.name}"'s active key into it (it isn't pre-filled; Testrix can't re-show a key after it's first issued).`);
    } catch (err) {
      setNotice(err.message);
    }
  };

  const confirmRevokeEngine = async () => {
    if (!revokeEngineTarget) return;
    try {
      await api.revokeTestEngineCredential(revokeEngineTarget.id);
      setNotice(`Credential revoked for "${revokeEngineTarget.name}" — it can no longer send events until rotated.`);
      setRevokeEngineTarget(null);
      load();
    } catch (err) {
      setNotice(err.message);
      setRevokeEngineTarget(null);
    }
  };

  const confirmDisableEngine = async () => {
    if (!disableEngine) return;
    try {
      await api.disableTestEngine(disableEngine.id);
      setNotice(`Test Engine "${disableEngine.name}" disabled.`);
      setDisableEngine(null);
      load();
    } catch (err) {
      setNotice(err.message);
      setDisableEngine(null);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      const updated = await api.updateWorkspaceProfile(project.id, {
        description: profileForm.description, backendTech: profileForm.backendTech,
        frontendTech: profileForm.frontendTech, databaseTech: profileForm.databaseTech, cicdTool: profileForm.cicdTool
      });
      setSettings(updated);
      setNotice('Workspace profile updated.');
    } catch (err) {
      setNotice(err.message);
    }
  };

  const toggleModule = async (moduleType, enabled) => {
    if (!enabled && !settings.modules.some((m) => m.moduleType !== moduleType && m.enabled)) {
      setNotice('At least one product must stay enabled for this workspace.');
      return;
    }
    try {
      const updated = await api.toggleWorkspaceModule(project.id, moduleType, enabled);
      setSettings(updated);
      setNotice(`${MODULE_LABELS[moduleType]} ${enabled ? 'enabled' : 'disabled'} for this workspace.`);
    } catch (err) {
      setNotice(err.message);
    }
  };

  const confirmRemoveEnv = async () => {
    if (!removeEnv) return;
    try {
      await api.deleteEnvironment(removeEnv.id);
      setNotice(`Environment "${removeEnv.name}" deleted.`);
      setRemoveEnv(null);
      load();
    } catch (err) {
      setNotice(err.message);
      setRemoveEnv(null);
    }
  };

  const envColumns = useMemo(() => [
    { key: 'code', label: 'Code', render: (v) => <strong>{v}</strong> },
    { key: 'name', label: 'Name' },
    { key: 'baseUrl', label: 'Base URL', render: (v) => v || '—' },
    { key: 'active', label: 'Status', render: (v) => <span className={`status ${v ? 'active' : 'disabled'}`}>{v ? 'Active' : 'Inactive'}</span> },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, e) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="action-btn edit-btn" onClick={() => setEditEnv(e)} title="Edit"><Pencil size={13} /> Edit</button>
          <button className="action-btn delete-btn" onClick={() => setRemoveEnv(e)} title="Delete"><Trash2 size={13} /> Delete</button>
        </div>
      )
    }
  ], []);

  if (!project) {
    return <section className="page-grid" style={{ gridTemplateColumns: '1fr' }}><Panel title="Workspace Settings"><p>No workspace context found.</p></Panel></section>;
  }
  if (!settings || !profileForm) {
    return <section className="page-grid" style={{ gridTemplateColumns: '1fr' }}><Panel title="Workspace Settings"><p>Loading…</p></Panel></section>;
  }

  const hasAutomation = settings.modules.some(
    (m) => (m.moduleType === 'AUTOMATION_SELENIUM' || m.moduleType === 'AUTOMATION_PLAYWRIGHT') && m.enabled
  );
  const callbackUrl = `${window.location.origin}/automation/api/events/execution`;

  return (
    <section className="page-grid" style={{ gridTemplateColumns: '1fr' }}>
      <Panel title={`Workspace Settings — ${settings.name}`}>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: -4 }}>
          {settings.projectCode} · {settings.workspaceCode}
        </p>
        <form onSubmit={saveProfile} className="auth-form" style={{ maxWidth: 560 }}>
          <Field label="Description" value={profileForm.description ?? ''} onChange={(v) => setProfileForm((c) => ({ ...c, description: v }))} />
          <Field label="Backend Technology" value={profileForm.backendTech ?? ''} onChange={(v) => setProfileForm((c) => ({ ...c, backendTech: v }))} />
          <Field label="Frontend Technology" value={profileForm.frontendTech ?? ''} onChange={(v) => setProfileForm((c) => ({ ...c, frontendTech: v }))} />
          <Field label="Database Technology" value={profileForm.databaseTech ?? ''} onChange={(v) => setProfileForm((c) => ({ ...c, databaseTech: v }))} />
          <Field label="CI/CD Tool" value={profileForm.cicdTool ?? ''} onChange={(v) => setProfileForm((c) => ({ ...c, cicdTool: v }))} />
          <div className="modal-form-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="primary-action modal-submit-btn" type="submit"><Save size={15} /> Save Profile</button>
          </div>
        </form>
      </Panel>

      <Panel title="Enabled Products">
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: -4 }}>
          Control which Testrix products this workspace's team can access.
        </p>
        <div className="ws-module-checks">
          {settings.modules.map((m) => (
            <label key={m.moduleType} className="check-row" style={{ cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); toggleModule(m.moduleType, !m.enabled); }}>
              {m.enabled ? <ToggleRight size={20} color="var(--accent, #3b82f6)" /> : <ToggleLeft size={20} color="var(--text-muted)" />}
              {MODULE_LABELS[m.moduleType] || m.moduleType}
            </label>
          ))}
        </div>
      </Panel>

      {hasAutomation && (
        <Panel title="Framework Connection">
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: -4 }}>
            API Testing and Performance Testing work the moment you create data inside those products — collections,
            environments, load plans all live in Testrix already. Automation is different: the thing that actually
            runs is <strong>your own Selenium/TestNG or Playwright test code</strong>, an external codebase, so it
            needs an explicit, isolated connection — register a Test Engine below to get your own credential.
          </p>

          <div style={{ display: 'grid', gap: 16, marginTop: 14 }}>
            <div>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 6px' }}>
                <Workflow size={15} /> How the connection works
              </h4>
              <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                Execution Center → Portal Backend queues the run → Execution Manager dispatches it → Framework Runner
                shells out to your test process (<code>mvn test</code> for Selenium/TestNG, <code>npx playwright
                test</code> for Playwright) → your framework pushes live lifecycle events
                (started/passed/failed/skipped/screenshot/…) back to Testrix as it runs, so the dashboard updates in
                real time instead of waiting for the whole suite to finish.
              </p>
            </div>

            <div>
              <h4 style={{ margin: '0 0 6px' }}>What your framework needs to implement</h4>
              <ul style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 13, margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Read the execution ID, callback URL, and API key handed to it at process start (system properties for Maven, environment variables for Playwright).</li>
                <li>POST each lifecycle event to the callback endpoint below with header <code>X-API-Key</code>, fire-and-forget — a Testrix outage must never fail or block your test run.</li>
                <li>Read environment-specific values (base URLs, credentials, etc.) from the config Testrix passes in for the Environment the run was launched against, rather than hardcoding them.</li>
              </ul>
            </div>

            <div>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 6px' }}>
                <KeyRound size={15} /> Your Test Engines
              </h4>
              <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }}>
                Callback endpoint: <code>{callbackUrl}</code>
              </p>
              <div className="um-toolbar">
                <button className="primary-action um-create-btn" onClick={() => setShowRegisterEngine(true)}>
                  <Plus size={15} /> Register Test Engine
                </button>
                <span className="um-count">{testEngines.length} engine{testEngines.length !== 1 ? 's' : ''}</span>
              </div>

              {loading ? (
                <Loader size={24} label="Loading test engines…" />
              ) : testEngines.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 10 }}>
                  No Test Engine registered yet — runs for this workspace still use the platform's legacy shared
                  connection. Register one to get an isolated, per-workspace credential.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                  {testEngines.map((eng) => (
                    <div key={eng.id} style={{
                      border: '1px solid var(--border-color, #1c2b40)', borderRadius: 8, padding: '10px 14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <Cpu size={18} style={{ flexShrink: 0, color: 'var(--accent, #7c3aed)' }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <strong>{eng.name}</strong>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{eng.businessId}</span>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                              color: HEALTH_COLORS[eng.health] || 'var(--text-muted)'
                            }}>
                              ● {eng.health.replace('_', ' ')}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            {ENGINE_TYPE_LABELS[eng.engineType] || eng.engineType} · {eng.deploymentType}
                            {eng.activeKeyPrefix ? <> · key <code>{eng.activeKeyPrefix}…</code></> : <> · no active key</>}
                          </div>
                          {(eng.frameworkPath || eng.reportPath) && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                              {eng.frameworkPath && <span><FolderTree size={11} style={{ verticalAlign: -1 }} /> {eng.frameworkPath}</span>}
                              {eng.reportPath && <span><FileDown size={11} style={{ verticalAlign: -1 }} /> {eng.reportPath}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="action-btn" onClick={() => downloadStarterKit(eng)} title="Download starter kit">
                          <FileDown size={13} /> Starter Kit
                        </button>
                        <button className="action-btn" onClick={() => rotateEngineCredential(eng)} title="Rotate credential">
                          <RotateCw size={13} /> Rotate
                        </button>
                        <button className="action-btn" onClick={() => setRevokeEngineTarget(eng)} title="Revoke credential">
                          <KeyRound size={13} /> Revoke
                        </button>
                        {eng.status !== 'DISABLED' && (
                          <button className="action-btn delete-btn" onClick={() => setDisableEngine(eng)} title="Disable engine">
                            <Ban size={13} /> Disable
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Panel>
      )}

      <Panel title="Environments">
        <div className="um-toolbar">
          <button className="primary-action um-create-btn" onClick={() => setShowCreateEnv(true)}>
            <Plus size={15} /> Add Environment
          </button>
          <span className="um-count">{environments.length} environment{environments.length !== 1 ? 's' : ''}</span>
        </div>
        <DataTable columns={envColumns} data={environments} loading={loading} searchPlaceholder="Filter environments..." exportFilename="workspace_environments.csv" />
      </Panel>

      {showCreateEnv && (
        <Modal title="Add Environment" onClose={() => setShowCreateEnv(false)} closeOnBackdrop={false}>
          <EnvironmentForm setNotice={setNotice} onSaved={() => { setShowCreateEnv(false); load(); }} onCancel={() => setShowCreateEnv(false)} />
        </Modal>
      )}
      {editEnv && (
        <Modal title={`Edit — ${editEnv.name}`} onClose={() => setEditEnv(null)} closeOnBackdrop={false}>
          <EnvironmentForm environment={editEnv} setNotice={setNotice} onSaved={() => { setEditEnv(null); load(); }} onCancel={() => setEditEnv(null)} />
        </Modal>
      )}
      {removeEnv && (
        <ConfirmDialog onClose={() => setRemoveEnv(null)}>
          <div className="confirm-icon"><Trash2 size={30} /></div>
          <h3>Delete Environment?</h3>
          <p>Delete <strong>{removeEnv.name}</strong> from this workspace?</p>
          <div className="confirm-actions">
            <button className="secondary-action" onClick={() => setRemoveEnv(null)}>Cancel</button>
            <button className="danger-action" onClick={confirmRemoveEnv}>Delete</button>
          </div>
        </ConfirmDialog>
      )}

      {showRegisterEngine && (
        <Modal title="Register Test Engine" onClose={() => setShowRegisterEngine(false)} closeOnBackdrop={false}>
          <RegisterEngineForm
            setNotice={setNotice}
            onRegistered={(result) => { setShowRegisterEngine(false); setIssuedCredential(result); load(); }}
            onCancel={() => setShowRegisterEngine(false)}
          />
        </Modal>
      )}
      {issuedCredential && (
        <Modal title="Test Engine Credential" onClose={() => setIssuedCredential(null)} closeOnBackdrop={false}>
          <CredentialRevealModal issued={issuedCredential} onClose={() => setIssuedCredential(null)} setNotice={setNotice} />
        </Modal>
      )}
      {revokeEngineTarget && (
        <ConfirmDialog onClose={() => setRevokeEngineTarget(null)}>
          <div className="confirm-icon"><KeyRound size={30} /></div>
          <h3>Revoke Credential?</h3>
          <p><strong>{revokeEngineTarget.name}</strong> will be unable to send execution events until you rotate a new key for it.</p>
          <div className="confirm-actions">
            <button className="secondary-action" onClick={() => setRevokeEngineTarget(null)}>Cancel</button>
            <button className="danger-action" onClick={confirmRevokeEngine}>Revoke</button>
          </div>
        </ConfirmDialog>
      )}
      {disableEngine && (
        <ConfirmDialog onClose={() => setDisableEngine(null)}>
          <div className="confirm-icon"><Ban size={30} /></div>
          <h3>Disable Test Engine?</h3>
          <p>Executions dispatched to modules linked to <strong>{disableEngine.name}</strong> will be rejected before they start until it's re-enabled by rotating a new credential.</p>
          <div className="confirm-actions">
            <button className="secondary-action" onClick={() => setDisableEngine(null)}>Cancel</button>
            <button className="danger-action" onClick={confirmDisableEngine}>Disable</button>
          </div>
        </ConfirmDialog>
      )}
    </section>
  );
}

function EnvironmentForm({ environment, setNotice, onSaved, onCancel }) {
  const [form, setForm] = useState({
    code: environment?.code ?? '', name: environment?.name ?? '',
    baseUrl: environment?.baseUrl ?? '', active: environment?.active ?? true
  });
  const [errors, setErrors] = useState({});
  const update = (f, v) => { setForm((c) => ({ ...c, [f]: v })); if (errors[f]) setErrors((e) => ({ ...e, [f]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.code.trim()) errs.code = 'Code is required';
    if (!form.name.trim()) errs.name = 'Name is required';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      if (environment) {
        await api.updateEnvironment(environment.id, form);
        setNotice('Environment updated.');
      } else {
        await api.createEnvironment(form);
        setNotice('Environment created.');
      }
      onSaved();
    } catch (err) {
      setNotice(err.message);
    }
  };

  return (
    <form onSubmit={submit} className="auth-form" noValidate>
      <Field label="Code" required value={form.code} onChange={(v) => update('code', v)} error={errors.code} />
      <Field label="Name" required value={form.name} onChange={(v) => update('name', v)} error={errors.name} />
      <Field label="Base URL" value={form.baseUrl} onChange={(v) => update('baseUrl', v)} />
      <label className="check-row">
        <input type="checkbox" checked={form.active} onChange={(e) => update('active', e.target.checked)} />
        Active
      </label>
      <div className="modal-form-actions">
        <button type="button" className="secondary-action" onClick={onCancel}>Cancel</button>
        <button className="primary-action modal-submit-btn" type="submit"><Globe2 size={15} /> {environment ? 'Save Changes' : 'Add Environment'}</button>
      </div>
    </form>
  );
}

function RegisterEngineForm({ setNotice, onRegistered, onCancel }) {
  const [form, setForm] = useState({ engineType: 'SELENIUM', name: '', description: '', deploymentType: 'LOCAL', endpoint: '', frameworkPath: '', reportPath: '' });
  const [errors, setErrors] = useState({});
  const update = (f, v) => { setForm((c) => ({ ...c, [f]: v })); if (errors[f]) setErrors((e) => ({ ...e, [f]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      const result = await api.registerTestEngine(form);
      onRegistered(result.credential ? { engine: result.engine, ...result.credential } : result);
    } catch (err) {
      setNotice(err.message);
    }
  };

  return (
    <form onSubmit={submit} className="auth-form" noValidate>
      <div className="form-field">
        <label className="form-row">
          <span>Engine Type</span>
          <div className="field-input-wrap">
            <select value={form.engineType} onChange={(e) => update('engineType', e.target.value)}>
              <option value="SELENIUM">Selenium</option>
              <option value="PLAYWRIGHT">Playwright</option>
            </select>
          </div>
        </label>
      </div>
      <Field label="Name" required value={form.name} onChange={(v) => update('name', v)} error={errors.name} />
      <Field label="Description" value={form.description} onChange={(v) => update('description', v)} />
      <div className="form-field">
        <label className="form-row">
          <span>Deployment Type</span>
          <div className="field-input-wrap">
            <select value={form.deploymentType} onChange={(e) => update('deploymentType', e.target.value)}>
              <option value="LOCAL">Local</option>
              <option value="DOCKER">Docker</option>
              <option value="VM">VM</option>
              <option value="KUBERNETES">Kubernetes</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </label>
      </div>
      <Field label="Endpoint (optional)" value={form.endpoint} onChange={(v) => update('endpoint', v)} />
      <Field label="Framework Path (optional)" value={form.frameworkPath} onChange={(v) => update('frameworkPath', v)} />
      <Field label="Report Path (optional)" value={form.reportPath} onChange={(v) => update('reportPath', v)} />
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -8 }}>
        Framework Path is where your checkout lives locally (e.g. C:\projects\my-selenium-suite); Report Path is where
        your framework writes its own local report (e.g. test-output/). Both are baked into your downloadable Starter
        Kit's config file — Testrix itself never reads either path.
      </p>
      <div className="modal-form-actions">
        <button type="button" className="secondary-action" onClick={onCancel}>Cancel</button>
        <button className="primary-action modal-submit-btn" type="submit"><Cpu size={15} /> Register</button>
      </div>
    </form>
  );
}

function CredentialRevealModal({ issued, onClose, setNotice }) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.plaintextKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. non-HTTPS context) — the key is still selectable/copyable by hand.
    }
  };

  const downloadWithKey = async () => {
    if (!issued.engine) return;
    setDownloading(true);
    try {
      await api.downloadEngineStarterKit(issued.engine.id, issued.plaintextKey);
    } catch (err) {
      setNotice?.(err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{
        display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px',
        background: 'var(--warning-bg, rgba(234,179,8,0.1))', border: '1px solid var(--warning-border, rgba(234,179,8,0.35))',
        borderRadius: 8, fontSize: 13
      }}>
        <TriangleAlert size={16} style={{ flexShrink: 0, marginTop: 1, color: '#eab308' }} />
        <span>This key is shown only once. Copy it now into your framework's config (e.g. <code>config-v2.properties</code>'s <code>portal.api.key</code>, or the Playwright repo's <code>.env</code> as <code>PORTAL_API_KEY</code>) — Testrix does not store it in plaintext and cannot show it again.</span>
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>API Key</div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          background: 'var(--input-bg, #101d31)', border: '1px solid var(--border-color, #1c2b40)', borderRadius: 8
        }}>
          <code style={{ flex: 1, wordBreak: 'break-all', fontSize: 13, color: '#e2e8f0' }}>{issued.plaintextKey}</code>
          <button type="button" className="action-btn" onClick={copy} title="Copy">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      {issued.engine && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          For engine <strong>{issued.engine.name}</strong> ({issued.engine.businessId})
        </p>
      )}
      {issued.engine && (
        <button type="button" className="action-btn edit-btn" onClick={downloadWithKey} disabled={downloading} style={{ justifySelf: 'start' }}>
          <Download size={13} /> {downloading ? 'Building…' : 'Download Starter Kit — this key pre-filled'}
        </button>
      )}
      <div className="modal-form-actions">
        <button type="button" className="primary-action modal-submit-btn" onClick={onClose}>Done — I've copied it</button>
      </div>
    </div>
  );
}
