import React, { useState, useEffect } from 'react';
import { api } from '../../api.js';
import { Plus, Trash2, Save, Eye, EyeOff, Settings2, Globe2 } from 'lucide-react';
import { notify, confirmDialog } from '../../../../../shared/ui/NotificationProvider.jsx';

// Same masked key/value editor pattern already used by the automation-portal's
// EnvironmentView.jsx "Framework Config" editor — reused here rather than reinvented.
const parseConfig = (json) => {
  try {
    const obj = JSON.parse(json || '{}');
    return Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
  } catch {
    return [];
  }
};
const toConfigJson = (rows) => {
  const obj = {};
  rows.forEach(({ key, value }) => { if (key.trim()) obj[key.trim()] = value; });
  return JSON.stringify(obj);
};
const isSecretKey = (key) => /pass|secret|token|captcha|key/i.test(key);

function KeyValueEditor({ label, hint, rows, setRows }) {
  const [showSecrets, setShowSecrets] = useState(false);
  const updateRow = (idx, field, value) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  return (
    <div className="form-field" style={{ marginTop: 10 }}>
      <label className="form-row"><span>{label}</span></label>
      {hint && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{hint}</span>}
      {rows.length > 0 && (
        <div style={{ margin: '6px 0' }}>
          <button type="button" className="action-btn" onClick={() => setShowSecrets((v) => !v)}>
            {showSecrets ? <EyeOff size={12} /> : <Eye size={12} />} {showSecrets ? 'Hide values' : 'Show values'}
          </button>
        </div>
      )}
      {rows.map((row, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input type="text" placeholder="key" value={row.key} onChange={(e) => updateRow(idx, 'key', e.target.value)}
            style={{ flex: 1, height: 32, border: '1px solid #cfdae6', borderRadius: 6, padding: '0 8px' }} />
          <input type={!showSecrets && isSecretKey(row.key) ? 'password' : 'text'} placeholder="value" value={row.value}
            onChange={(e) => updateRow(idx, 'value', e.target.value)}
            style={{ flex: 1, height: 32, border: '1px solid #cfdae6', borderRadius: 6, padding: '0 8px' }} />
          <button type="button" className="action-btn delete-btn" onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}>
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button type="button" className="action-btn" onClick={() => setRows((prev) => [...prev, { key: '', value: '' }])}>
        <Plus size={12} /> Add entry
      </button>
    </div>
  );
}

function MappingOverrideForm({ mapping, environment, frameworkBrowsers, onSaved, setNotice }) {
  const [baseUrl, setBaseUrl] = useState(mapping.baseUrl || '');
  const [timeoutMinutes, setTimeoutMinutes] = useState(mapping.timeoutMinutes ?? '');
  const [browsers, setBrowsers] = useState(
    mapping.browsers ? mapping.browsers.split(',').map((b) => b.trim()).filter(Boolean) : []
  );
  const [configRows, setConfigRows] = useState(parseConfig(mapping.configJson));
  const [paramRows, setParamRows] = useState(parseConfig(mapping.executionParamsJson));
  const [saving, setSaving] = useState(false);

  const toggleBrowser = (b) => setBrowsers((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]);

  const save = async () => {
    setSaving(true);
    try {
      await api.adminUpdateModuleEnvironment(mapping.id, {
        ...mapping,
        baseUrl: baseUrl.trim() || null,
        timeoutMinutes: timeoutMinutes === '' ? null : Number(timeoutMinutes),
        browsers: browsers.length > 0 ? browsers.join(',') : null,
        configJson: toConfigJson(configRows),
        executionParamsJson: toConfigJson(paramRows)
      });
      setNotice(`Configuration saved for ${environment.name}.`);
      onSaved();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginTop: 8 }}>
      <div className="form-field">
        <label className="form-row"><span>Base URL override</span></label>
        <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={`Inherit environment default (${environment.baseUrl || 'not set'})`}
          style={{ width: '100%', height: 34, border: '1px solid #cfdae6', borderRadius: 6, padding: '0 8px' }} />
      </div>

      <div className="form-field" style={{ marginTop: 10 }}>
        <label className="form-row"><span>Timeout (minutes)</span></label>
        <input type="number" min="1" value={timeoutMinutes} onChange={(e) => setTimeoutMinutes(e.target.value)}
          placeholder="Default: 120"
          style={{ width: 160, height: 34, border: '1px solid #cfdae6', borderRadius: 6, padding: '0 8px' }} />
      </div>

      {frameworkBrowsers.length > 0 && (
        <div className="form-field" style={{ marginTop: 10 }}>
          <label className="form-row"><span>Allowed Browsers</span></label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '6px 0' }}>
            {frameworkBrowsers.map((b) => (
              <label key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={browsers.includes(b)} onChange={() => toggleBrowser(b)} />
                {b}
              </label>
            ))}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Leave all unchecked to allow every browser the framework supports.</span>
        </div>
      )}

      <KeyValueEditor label="Configuration (Base URL / credentials / API keys, …)"
        hint="Overlaid on top of the environment's own config for this module only."
        rows={configRows} setRows={setConfigRows} />

      <KeyValueEditor label="Execution Parameters"
        hint="Extra run parameters specific to this module + environment."
        rows={paramRows} setRows={setParamRows} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" className="primary-action" onClick={save} disabled={saving}>
          <Save size={14} style={{ marginRight: 4 }} /> {saving ? 'Saving…' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}

export function ModuleEnvironmentMappingPanel({ mod, setNotice }) {
  const [environments, setEnvironments] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [frameworkBrowsers, setFrameworkBrowsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedEnvId, setExpandedEnvId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [envs, maps, frameworks] = await Promise.all([
        api.environments(),
        api.adminListModuleEnvironments(mod.id),
        api.frameworks()
      ]);
      setEnvironments(envs || []);
      setMappings(maps || []);
      setFrameworkBrowsers(frameworks?.find((f) => f.code === mod.runnerType)?.browsers || []);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [mod.id]);

  const mappingFor = (envId) => mappings.find((m) => m.environmentId === envId);

  const enableEnv = async (env) => {
    try {
      await api.adminCreateModuleEnvironment({ moduleId: mod.id, environmentId: env.id, enabled: true });
      await load();
    } catch (e) { setNotice(e.message); }
  };

  const toggleEnabled = async (mapping) => {
    try {
      await api.adminUpdateModuleEnvironment(mapping.id, { ...mapping, enabled: !mapping.enabled });
      notify.success(`Mapping ${!mapping.enabled ? 'enabled' : 'disabled'} for ${mod.name}.`);
      await load();
    } catch (e) {
      notify.error(e.message || 'Failed to update mapping.');
    }
  };

  const removeMapping = async (mapping, env) => {
    const ok = await confirmDialog({
      title: 'Remove Environment Mapping?',
      message: `Are you sure you want to remove the ${env.name} mapping for ${mod.name}? Any saved overrides will be lost.`,
      confirmText: 'Remove Mapping',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
    try {
      await api.adminDeleteModuleEnvironment(mapping.id);
      if (expandedEnvId === env.id) setExpandedEnvId(null);
      notify.success(`Mapping for ${env.name} removed successfully.`);
      await load();
    } catch (e) {
      notify.error(e.message || 'Failed to remove mapping.');
    }
  };

  if (loading) {
    return <p style={{ padding: 12 }}>Loading environments…</p>;
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
        <Globe2 size={13} style={{ verticalAlign: -2 }} /> Choose which environments <strong>{mod.name}</strong> ({mod.runnerType}) may run
        in, and optionally override its Base URL / browsers / timeout / config for a specific environment. Environments left
        disabled here will never appear in the Execution Center for this module.
      </p>

      {environments.length === 0 && <p>No environments exist yet — create one first.</p>}

      {environments.map((env) => {
        const mapping = mappingFor(env.id);
        return (
          <div key={env.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <strong>{env.name}</strong>{' '}
                <span className="status" style={{ marginLeft: 6 }}>{env.code}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {mapping ? (
                  <>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                      <input type="checkbox" checked={mapping.enabled} onChange={() => toggleEnabled(mapping)} />
                      Enabled
                    </label>
                    <button type="button" className="action-btn edit-btn"
                      onClick={() => setExpandedEnvId(expandedEnvId === env.id ? null : env.id)}>
                      <Settings2 size={12} /> Configure
                    </button>
                    <button type="button" className="action-btn delete-btn" onClick={() => removeMapping(mapping, env)}>
                      <Trash2 size={12} />
                    </button>
                  </>
                ) : (
                  <button type="button" className="action-btn" onClick={() => enableEnv(env)}>
                    <Plus size={12} /> Enable for this module
                  </button>
                )}
              </div>
            </div>
            {mapping && expandedEnvId === env.id && (
              <MappingOverrideForm mapping={mapping} environment={env} frameworkBrowsers={frameworkBrowsers}
                onSaved={load} setNotice={setNotice} />
            )}
          </div>
        );
      })}
    </div>
  );
}
