import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Plus, Trash2, Save, Workflow, CheckCircle2, XCircle, Layers, Zap } from 'lucide-react';
import { apiClient } from '../api/client.js';
import KeyValueEditor from '../components/KeyValueEditor.jsx';
import FormDataEditor from '../components/FormDataEditor.jsx';
import ValidationCheckPanel from '../components/ValidationCheckPanel.jsx';
import AuthEditor, { EMPTY_AUTH } from '../components/AuthEditor.jsx';
import { flattenModules } from './BaseApis.jsx';
import ModuleApiTree from '../components/ModuleApiTree.jsx';
import ModuleTreeSelect from '../components/ModuleTreeSelect.jsx';
import { ThemedEditor } from '../components/ThemedEditor.jsx';
import { Button } from '../components/Button.jsx';
import { INPUT_CLASS as inputCls } from '../lib/statusColors.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
const BODY_TYPES = ['NONE', 'JSON', 'XML', 'TEXT', 'HTML', 'FORM_DATA', 'FORM_URLENCODED'];
const TABS = ['Request', 'Dynamic Data', 'Validation Rules', 'Groups'];
const OPERATORS = ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'REGEX', 'EXISTS', 'TYPE_IS', 'RANGE'];

const emptyForm = {
  name: '', method: 'GET', urlTemplate: '', moduleId: '',
  headersTemplate: [], queryParamsTemplate: [],
  bodyType: 'NONE', bodyTemplate: '', formDataTemplate: [], requiredPayloadFieldsTemplate: [], auth: { ...EMPTY_AUTH },
  dynamic: false, timeoutMs: 15000, followRedirects: true, verifySsl: true,
};

export default function RegularApis() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [tab, setTab] = useState('Request');
  const [runResult, setRunResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [newRule, setNewRule] = useState({ jsonPath: '', operator: 'EQUALS', expectedValue: '' });
  const [bindingBase, setBindingBase] = useState('');
  const [baseTestResult, setBaseTestResult] = useState(null);
  const [baseTesting, setBaseTesting] = useState(false);
  const [bindingSourceType, setBindingSourceType] = useState('BASE');
  const [bindingRegular, setBindingRegular] = useState('');
  const [regularTestResult, setRegularTestResult] = useState(null);
  const [regularTesting, setRegularTesting] = useState(false);
  const [manualExtraction, setManualExtraction] = useState({ sourceJsonPath: '', variableName: '' });

  const { data: apis = [] } = useQuery({ queryKey: ['regular-apis'], queryFn: async () => (await apiClient.get('/v1/regular-apis')).data });
  const { data: modules = [] } = useQuery({ queryKey: ['modules'], queryFn: async () => (await apiClient.get('/v1/modules')).data });
  const { data: baseApis = [] } = useQuery({ queryKey: ['base-apis'], queryFn: async () => (await apiClient.get('/v1/base-apis')).data });
  const { data: bindings = [] } = useQuery({
    queryKey: ['regular-bindings', selectedId],
    queryFn: async () => (await apiClient.get(`/v1/regular-apis/${selectedId}/bindings`)).data,
    enabled: !!selectedId,
  });
  const { data: baseExtractions } = useQuery({
    queryKey: ['base-api-tree', bindingBase],
    queryFn: async () => (await apiClient.get(`/v1/base-apis/${bindingBase}/response-tree`)).data,
    enabled: !!bindingBase,
  });
  const { data: rules = [] } = useQuery({
    queryKey: ['rules', selectedId],
    queryFn: async () => (await apiClient.get('/v1/validation-rules', { params: { apiType: 'REGULAR', apiId: selectedId } })).data,
    enabled: !!selectedId,
  });
  const { data: allGroups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => (await apiClient.get('/v1/groups')).data,
  });
  const { data: apiGroupIds = [] } = useQuery({
    queryKey: ['groups-for-api', selectedId],
    queryFn: async () => (await apiClient.get(`/v1/groups/by-api/${selectedId}`)).data,
    enabled: !!selectedId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['regular-apis'] });
    qc.invalidateQueries({ queryKey: ['regular-bindings'] });
    qc.invalidateQueries({ queryKey: ['rules'] });
    qc.invalidateQueries({ queryKey: ['groups'] });
    qc.invalidateQueries({ queryKey: ['groups-for-api'] });
  };

  const toPayload = () => ({
    name: form.name, method: form.method, urlTemplate: form.urlTemplate,
    moduleId: form.moduleId ? Number(form.moduleId) : null,
    headersTemplate: JSON.stringify(form.headersTemplate),
    queryParamsTemplate: JSON.stringify(form.queryParamsTemplate),
    bodyType: form.bodyType, bodyTemplate: form.bodyTemplate || null,
    formDataTemplate: JSON.stringify(form.formDataTemplate || []),
    requiredPayloadFieldsTemplate: JSON.stringify(form.requiredPayloadFieldsTemplate || []),
    authType: form.auth.type, authConfig: JSON.stringify(form.auth),
    dynamic: form.dynamic, timeoutMs: Number(form.timeoutMs) || 15000,
    followRedirects: form.followRedirects, verifySsl: form.verifySsl,
  });

  const saveMut = useMutation({
    mutationFn: async () => selectedId
      ? (await apiClient.put(`/v1/regular-apis/${selectedId}`, toPayload())).data
      : (await apiClient.post('/v1/regular-apis', toPayload())).data,
    onSuccess: (saved) => { setSelectedId(saved.id); invalidate(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => apiClient.delete(`/v1/regular-apis/${id}`),
    onSuccess: () => { setSelectedId(null); setForm(emptyForm); invalidate(); },
  });

  const addBindingMut = useMutation({
    mutationFn: (extraction) => apiClient.post(`/v1/regular-apis/${selectedId}/bindings`,
      bindingSourceType === 'BASE'
        ? { baseApiId: Number(bindingBase), sourceJsonPath: extraction.sourceJsonPath, variableName: extraction.variableName }
        : { sourceRegularApiId: Number(bindingRegular), sourceJsonPath: extraction.sourceJsonPath, variableName: extraction.variableName }),
    onSuccess: () => { invalidate(); setManualExtraction({ sourceJsonPath: '', variableName: '' }); },
  });

  const deleteBindingMut = useMutation({
    mutationFn: (bindingId) => apiClient.delete(`/v1/regular-apis/${selectedId}/bindings/${bindingId}`),
    onSuccess: invalidate,
  });

  const addRuleMut = useMutation({
    mutationFn: () => apiClient.post('/v1/validation-rules', {
      apiType: 'REGULAR', apiId: selectedId,
      jsonPath: newRule.jsonPath, operator: newRule.operator,
      expectedValue: newRule.operator === 'EXISTS' ? null : newRule.expectedValue,
    }),
    onSuccess: () => { setNewRule({ jsonPath: '', operator: 'EQUALS', expectedValue: '' }); invalidate(); },
  });

  const deleteRuleMut = useMutation({
    mutationFn: (id) => apiClient.delete(`/v1/validation-rules/${id}`),
    onSuccess: invalidate,
  });

  const joinGroupMut = useMutation({
    mutationFn: (groupId) => apiClient.post(`/v1/groups/${groupId}/members`, { regularApiId: selectedId }),
    onSuccess: invalidate,
  });
  const leaveGroupMut = useMutation({
    mutationFn: (groupId) => apiClient.delete(`/v1/groups/${groupId}/members/${selectedId}`),
    onSuccess: invalidate,
  });

  // "Hit that base API" while wiring bindings: shows exactly which response
  // fields are usable for this regular API.
  const testBaseApi = async () => {
    if (!bindingBase) return;
    setBaseTesting(true);
    setBaseTestResult(null);
    try {
      const { data } = await apiClient.post(`/v1/base-apis/${bindingBase}/execute`);
      setBaseTestResult(data);
      qc.invalidateQueries({ queryKey: ['base-api-tree', bindingBase] });
    } catch (e) {
      setBaseTestResult({ success: false, errorMessage: e.response?.data?.message || e.message });
    } finally {
      setBaseTesting(false);
    }
  };

  // Same idea as testBaseApi, but for a Regular API source: actually runs it
  // (which resolves its own bindings first) so its real response is visible
  // to pick a JSONPath from.
  const testRegularApi = async () => {
    if (!bindingRegular) return;
    setRegularTesting(true);
    setRegularTestResult(null);
    try {
      const { data } = await apiClient.post(`/v1/regular-apis/${bindingRegular}/execute`);
      setRegularTestResult(data.response);
    } catch (e) {
      setRegularTestResult({ success: false, errorMessage: e.response?.data?.message || e.message });
    } finally {
      setRegularTesting(false);
    }
  };

  const select = (api) => {
    setSelectedId(api.id);
    setRunResult(null);
    setBaseTestResult(null);
    setTab('Request');
    setForm({
      name: api.name, method: api.method, urlTemplate: api.urlTemplate,
      moduleId: api.moduleId ?? '',
      headersTemplate: safeParse(api.headersTemplate, []),
      queryParamsTemplate: safeParse(api.queryParamsTemplate, []),
      bodyType: api.bodyType || 'NONE', bodyTemplate: api.bodyTemplate || '',
      formDataTemplate: safeParse(api.formDataTemplate, []),
      requiredPayloadFieldsTemplate: safeParse(api.requiredPayloadFieldsTemplate, []),
      auth: { ...EMPTY_AUTH, ...safeParse(api.authConfig, {}) },
      dynamic: api.dynamic, timeoutMs: api.timeoutMs,
      followRedirects: api.followRedirects, verifySsl: api.verifySsl,
    });
  };

  const run = async () => {
    if (!selectedId) return;
    setRunning(true);
    setRunResult(null);
    try {
      const { data } = await apiClient.post(`/v1/regular-apis/${selectedId}/execute`);
      setRunResult(data);
      qc.invalidateQueries({ queryKey: ['history'] });
    } catch (e) {
      setRunResult({ response: { success: false, errorMessage: e.response?.data?.message || e.message } });
    } finally {
      setRunning(false);
    }
  };

  const flatModules = flattenModules(modules);
  const resp = runResult?.response;

  return (
    <div className="h-screen flex overflow-hidden">
      {/* List */}
      <div className="w-60 shrink-0 border-r border-[var(--border)] flex flex-col">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)]">
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Regular APIs</span>
          <button onClick={() => { setSelectedId(null); setForm(emptyForm); setRunResult(null); }}
            className="text-[var(--accent-text)] hover:text-[var(--accent-hover)]" title="New API">
            <Plus size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <ModuleApiTree
            modules={modules}
            apis={apis}
            selectedId={selectedId}
            onSelect={select}
            emptyMessage="No regular APIs yet."
            renderItem={(a) => (
              <>
                <span className="font-semibold text-[var(--accent-text)] mr-1.5">{a.method}</span>{a.name}
                {a.dynamic && <span className="ml-1 text-[9px] px-1 rounded bg-[var(--indigo-text)]/20 text-[var(--indigo-text)]">DYN</span>}
                <div className="text-[var(--text-muted)] truncate">{a.urlTemplate}</div>
              </>
            )}
          />
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <Workflow size={16} className="text-[var(--accent-text)]" />
          <h1 className="text-base font-semibold">{selectedId ? 'Edit Regular API' : 'New Regular API'}</h1>
          <div className="ml-auto flex gap-2">
            {selectedId && (
              <>
                <Button onClick={run} disabled={running} className="!px-3 !py-1.5 !text-xs">
                  <Play size={12} /> {running ? 'Running…' : 'Run'}
                </Button>
                <button onClick={() => deleteMut.mutate(selectedId)}
                  className="flex items-center gap-1.5 rounded border border-[var(--danger-border-soft)] text-[var(--danger-text)] hover:bg-[var(--danger-bg-soft)] px-3 py-1.5 text-xs font-semibold">
                  <Trash2 size={12} /> Delete
                </button>
              </>
            )}
            <button onClick={() => saveMut.mutate()} disabled={!form.name || !form.urlTemplate || saveMut.isPending}
              className="flex items-center gap-1.5 rounded border border-[var(--accent-border-soft)] text-[var(--accent-text)] hover:bg-[var(--accent-bg-soft)] disabled:opacity-40 px-3 py-1.5 text-xs font-semibold">
              <Save size={12} /> {selectedId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
        {saveMut.isError && (
          <div className="text-xs text-[var(--danger-text)]">
            Save failed: {saveMut.error?.response?.data?.message ?? saveMut.error?.message ?? 'backend unreachable — is the platform running?'}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <input placeholder="Name (e.g. Get User Profile)" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          <select value={form.moduleId} onChange={(e) => setForm({ ...form, moduleId: e.target.value })} className={inputCls}>
            <option value="">No module</option>
            {flatModules.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>

        <div className="flex gap-2">
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={`${inputCls} w-28 font-semibold`}>
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <input placeholder="https://api.example.com/users/{{userId}}" value={form.urlTemplate}
            onChange={(e) => setForm({ ...form, urlTemplate: e.target.value })} className={`${inputCls} flex-1 font-mono`} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--border)]">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs border-b-2 -mb-px ${tab === t ? 'border-[var(--accent)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
              {t}
              {t === 'Dynamic Data' && form.dynamic && <span className="ml-1 text-[var(--indigo-text)]">•</span>}
              {t === 'Validation Rules' && rules.length > 0 && <span className="ml-1 text-[var(--success-text)]">({rules.length})</span>}
            </button>
          ))}
        </div>

        {tab === 'Request' && (
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1.5">Query Parameters (values may use {'{{vars}}'})</div>
              <KeyValueEditor items={form.queryParamsTemplate} onChange={(v) => setForm({ ...form, queryParamsTemplate: v })} keyPlaceholder="Parameter" showRequired />
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1.5">Headers (values may use {'{{vars}}'})</div>
              <KeyValueEditor items={form.headersTemplate} onChange={(v) => setForm({ ...form, headersTemplate: v })} keyPlaceholder="Header" showRequired />
            </div>
            <div>
              <div className="flex gap-1 mb-1.5">
                {BODY_TYPES.map((bt) => (
                  <button key={bt} onClick={() => setForm({ ...form, bodyType: bt })}
                    className={`px-2.5 py-1 rounded text-[11px] ${form.bodyType === bt ? 'bg-[var(--accent-bg-soft)] text-[var(--accent-text)] border border-[var(--accent-border-soft)]' : 'text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text-secondary)]'}`}>
                    {bt === 'FORM_URLENCODED' ? 'x-www-form-urlencoded' : bt === 'FORM_DATA' ? 'form-data' : bt}
                  </button>
                ))}
              </div>
              {form.bodyType === 'FORM_DATA' && (
                <FormDataEditor items={form.formDataTemplate} onChange={(formDataTemplate) => setForm({ ...form, formDataTemplate })} />
              )}
              {form.bodyType !== 'NONE' && form.bodyType !== 'FORM_DATA' && (
                <div className="h-32 border border-[var(--border)] rounded overflow-hidden">
                  <ThemedEditor height="100%"
                    language={form.bodyType === 'JSON' ? 'json' : 'plaintext'}
                    value={form.bodyTemplate} onChange={(v) => setForm({ ...form, bodyTemplate: v ?? '' })}
                    options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false }} />
                </div>
              )}
              {form.bodyType === 'JSON' && (
                <div className="mt-2">
                  <div className="text-xs text-[var(--text-muted)] mb-1.5">Required Payload Fields</div>
                  <KeyValueEditor items={form.requiredPayloadFieldsTemplate}
                    onChange={(requiredPayloadFieldsTemplate) => setForm({ ...form, requiredPayloadFieldsTemplate })}
                    keyPlaceholder="JSON field name" showRequired />
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1.5">Authorization</div>
              <AuthEditor auth={form.auth} onChange={(auth) => setForm({ ...form, auth })} />
            </div>
            <div className="flex gap-5 text-xs text-[var(--text-secondary)]">
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--accent)]" checked={form.followRedirects} onChange={(e) => setForm({ ...form, followRedirects: e.target.checked })} /> Follow redirects</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--accent)]" checked={form.verifySsl} onChange={(e) => setForm({ ...form, verifySsl: e.target.checked })} /> Verify SSL</label>
              <label className="flex items-center gap-2">Timeout <input type="number" min="100" value={form.timeoutMs} onChange={(e) => setForm({ ...form, timeoutMs: e.target.value })} className={`${inputCls} w-24 py-1`} /> ms</label>
            </div>
            {selectedId && <ValidationCheckPanel baseUrl={`/v1/regular-apis/${selectedId}`} />}
          </div>
        )}

        {tab === 'Dynamic Data' && (
          <div className="flex flex-col gap-3 max-w-2xl">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[var(--accent)]" checked={form.dynamic}
                onChange={(e) => setForm({ ...form, dynamic: e.target.checked })} />
              Use dynamic data from Base APIs
            </label>
            {form.dynamic && (
              <>
                <div className="text-xs text-[var(--text-muted)]">
                  Bound variables (insert them anywhere as <span className="font-mono text-[var(--success-text)]">{'{{name}}'}</span> — URL, headers, params, body, auth):
                </div>
                <div className="flex flex-wrap gap-2">
                  {bindings.map((b) => (
                    <span key={b.id} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--indigo-text)]/15 border border-[var(--indigo-text)]/40 text-[var(--indigo-text)] text-xs font-mono">
                      {'{{' + b.variableName + '}}'}
                      <button onClick={() => deleteBindingMut.mutate(b.id)} className="text-[var(--indigo-text)] hover:text-[var(--danger-text)]"><Trash2 size={11} /></button>
                    </span>
                  ))}
                  {bindings.length === 0 && <span className="text-xs text-[var(--text-muted)]">No variables bound yet.</span>}
                </div>
                {!selectedId && <div className="text-xs text-[var(--warning-text)]">Save the API first, then bind variables.</div>}
                {selectedId && (
                  <div className="border border-[var(--border)] rounded p-3 flex flex-col gap-2">
                    <div className="flex gap-1 text-xs">
                      <button onClick={() => setBindingSourceType('BASE')}
                        className={`px-2 py-1 rounded font-semibold ${bindingSourceType === 'BASE' ? 'bg-[var(--accent-bg-soft)] text-[var(--accent-text)]' : 'text-[var(--text-muted)]'}`}>
                        Base API
                      </button>
                      <button onClick={() => setBindingSourceType('REGULAR')}
                        className={`px-2 py-1 rounded font-semibold ${bindingSourceType === 'REGULAR' ? 'bg-[var(--accent-bg-soft)] text-[var(--accent-text)]' : 'text-[var(--text-muted)]'}`}>
                        Another Regular API
                      </button>
                    </div>

                    {bindingSourceType === 'BASE' && (
                      <>
                        <div className="text-xs text-[var(--text-muted)]">Add from a Base API:</div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <ModuleTreeSelect
                              modules={modules}
                              apis={baseApis}
                              selectedId={bindingBase ? Number(bindingBase) : null}
                              onSelect={(b) => { setBindingBase(String(b.id)); setBaseTestResult(null); }}
                              placeholder="Choose base API…"
                            />
                          </div>
                          {bindingBase && (
                            <button onClick={testBaseApi} disabled={baseTesting}
                              className="flex items-center gap-1.5 rounded border border-[var(--info-text)]/50 text-[var(--info-text)] hover:bg-[var(--info-text)]/10 disabled:opacity-40 px-3 py-1.5 text-xs font-semibold"
                              title="Execute this base API now to see which response fields are usable">
                              <Zap size={12} /> {baseTesting ? 'Hitting…' : 'Test Base API'}
                            </button>
                          )}
                        </div>
                        {baseTestResult && (
                          <div className={`rounded border p-2 text-xs flex flex-col gap-1 ${baseTestResult.success ? 'border-[var(--info-text)]/40 bg-[var(--info-text)]/5' : 'border-[var(--danger-border-soft)] bg-[var(--danger-bg-soft)]'}`}>
                            {baseTestResult.success
                              ? <span className="text-[var(--info-text)]">✓ {baseTestResult.statusCode} · {baseTestResult.durationMs} ms — response below shows the fields available for this API</span>
                              : <span className="text-[var(--danger-text)]">✗ {baseTestResult.errorMessage}</span>}
                            {baseTestResult.body && (
                              <pre className="max-h-40 overflow-auto text-[var(--text-secondary)] bg-[var(--bg-surface-2)] rounded p-2">{pretty(baseTestResult.body)}</pre>
                            )}
                          </div>
                        )}
                        {bindingBase && (baseExtractions?.extractions ?? []).length === 0 && (
                          <div className="text-xs text-[var(--warning-text)]">This base API has no extracted variables — run it on the Base APIs page and click + on a response field.</div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {(baseExtractions?.extractions ?? []).map((x) => (
                            <button key={x.id} onClick={() => addBindingMut.mutate(x)}
                              disabled={bindings.some((b) => b.variableName === x.variableName)}
                              className="px-2 py-1 rounded-full border border-[var(--accent-border-soft)] text-[var(--accent-text)] hover:bg-[var(--accent-bg-soft)] disabled:opacity-30 text-xs font-mono">
                              + {'{{' + x.variableName + '}}'}
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {bindingSourceType === 'REGULAR' && (
                      <>
                        <div className="text-xs text-[var(--text-muted)]">
                          Add from another Regular API's response (it will be executed first, resolving its own bindings, however deep that chain goes):
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <ModuleTreeSelect
                              modules={modules}
                              apis={apis.filter((a) => a.id !== selectedId)}
                              selectedId={bindingRegular ? Number(bindingRegular) : null}
                              onSelect={(a) => { setBindingRegular(String(a.id)); setRegularTestResult(null); }}
                              placeholder="Choose regular API…"
                              renderLabel={(a) => `${a.method} ${a.name}`}
                            />
                          </div>
                          {bindingRegular && (
                            <button onClick={testRegularApi} disabled={regularTesting}
                              className="flex items-center gap-1.5 rounded border border-[var(--info-text)]/50 text-[var(--info-text)] hover:bg-[var(--info-text)]/10 disabled:opacity-40 px-3 py-1.5 text-xs font-semibold"
                              title="Execute this regular API now (and its own dependencies) to see the response shape">
                              <Zap size={12} /> {regularTesting ? 'Hitting…' : 'Test Regular API'}
                            </button>
                          )}
                        </div>
                        {regularTestResult && (
                          <div className={`rounded border p-2 text-xs flex flex-col gap-1 ${regularTestResult.success ? 'border-[var(--info-text)]/40 bg-[var(--info-text)]/5' : 'border-[var(--danger-border-soft)] bg-[var(--danger-bg-soft)]'}`}>
                            {regularTestResult.success
                              ? <span className="text-[var(--info-text)]">✓ {regularTestResult.statusCode} · {regularTestResult.durationMs} ms — pick a JSONPath from the response below</span>
                              : <span className="text-[var(--danger-text)]">✗ {regularTestResult.errorMessage}</span>}
                            {regularTestResult.body && (
                              <pre className="max-h-40 overflow-auto text-[var(--text-secondary)] bg-[var(--bg-surface-2)] rounded p-2">{pretty(regularTestResult.body)}</pre>
                            )}
                          </div>
                        )}
                        {bindingRegular && (
                          <div className="flex gap-2 items-end">
                            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)] flex-1">
                              JSONPath
                              <input placeholder="$.data.username" value={manualExtraction.sourceJsonPath}
                                onChange={(e) => setManualExtraction({ ...manualExtraction, sourceJsonPath: e.target.value })}
                                className={`${inputCls} font-mono`} />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)] flex-1">
                              Variable name
                              <input placeholder="username" value={manualExtraction.variableName}
                                onChange={(e) => setManualExtraction({ ...manualExtraction, variableName: e.target.value })}
                                className={inputCls} />
                            </label>
                            <button onClick={() => addBindingMut.mutate(manualExtraction)}
                              disabled={!manualExtraction.sourceJsonPath || !manualExtraction.variableName
                                || bindings.some((b) => b.variableName === manualExtraction.variableName)}
                              className="px-3 py-1.5 rounded border border-[var(--accent-border-soft)] text-[var(--accent-text)] hover:bg-[var(--accent-bg-soft)] disabled:opacity-30 text-xs font-semibold">
                              + Add
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'Validation Rules' && (
          <div className="flex flex-col gap-3 max-w-3xl">
            {!selectedId && <div className="text-xs text-[var(--warning-text)]">Save the API first, then add rules.</div>}
            {selectedId && (
              <>
                <div className="flex gap-2 items-end">
                  <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)] flex-1">
                    JSONPath
                    <input placeholder="$.data.status" value={newRule.jsonPath}
                      onChange={(e) => setNewRule({ ...newRule, jsonPath: e.target.value })} className={`${inputCls} font-mono`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
                    Operator
                    <select value={newRule.operator} onChange={(e) => setNewRule({ ...newRule, operator: e.target.value })} className={inputCls}>
                      {OPERATORS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </label>
                  {newRule.operator !== 'EXISTS' && (
                    <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)] flex-1">
                      Expected {newRule.operator === 'RANGE' ? '(min,max)' : newRule.operator === 'TYPE_IS' ? '(string/number/boolean/array/object)' : ''}
                      <input value={newRule.expectedValue}
                        onChange={(e) => setNewRule({ ...newRule, expectedValue: e.target.value })} className={inputCls} />
                    </label>
                  )}
                  <button onClick={() => addRuleMut.mutate()} disabled={!newRule.jsonPath}
                    className="rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 px-3 py-2 text-xs font-semibold text-white">
                    Add Rule
                  </button>
                </div>
                <div className="border border-[var(--border)] rounded divide-y divide-[var(--border-soft)]">
                  {rules.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                      <span className="font-mono text-[var(--info-text)] flex-1 truncate">{r.jsonPath}</span>
                      <span className="text-[var(--text-secondary)]">{r.operator}</span>
                      <span className="font-mono text-[var(--text-secondary)]">{r.expectedValue ?? ''}</span>
                      <button onClick={() => deleteRuleMut.mutate(r.id)} className="text-[var(--text-muted)] hover:text-[var(--danger-text)]"><Trash2 size={13} /></button>
                    </div>
                  ))}
                  {rules.length === 0 && <div className="px-3 py-3 text-xs text-[var(--text-muted)]">No rules — every run counts as passed unless HTTP fails.</div>}
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'Groups' && (
          <div className="flex flex-col gap-3 max-w-2xl">
            {!selectedId && <div className="text-xs text-[var(--warning-text)]">Save the API first, then assign it to groups.</div>}
            {selectedId && (
              <>
                <div className="text-xs text-[var(--text-muted)]">
                  Scheduler execution groups this API belongs to (module-wise or time-wise). Groups run every member in order — Base APIs first, then the Regular API.
                </div>
                <div className="border border-[var(--border)] rounded divide-y divide-[var(--border-soft)]">
                  {allGroups.map(({ group: g, memberCount }) => {
                    const inGroup = apiGroupIds.includes(g.id);
                    return (
                      <label key={g.id} className="flex items-center gap-3 px-3 py-2 text-xs cursor-pointer hover:bg-[var(--bg-hover)]">
                        <input type="checkbox" className="accent-[var(--accent)]" checked={inGroup}
                          onChange={() => (inGroup ? leaveGroupMut : joinGroupMut).mutate(g.id)} />
                        <Layers size={12} className="text-[var(--accent-text)]" />
                        <span className="text-[var(--text-primary)]">{g.name}</span>
                        <span className="px-1.5 rounded-full text-[10px] bg-[var(--bg-surface-2)] text-[var(--text-secondary)]">
                          {g.groupType === 'MODULE' ? 'Module-wise' : `Time-wise · ${g.timeFrequency}`}
                        </span>
                        <span className="ml-auto text-[var(--text-muted)]">{memberCount} APIs</span>
                      </label>
                    );
                  })}
                  {allGroups.length === 0 && (
                    <div className="px-3 py-3 text-xs text-[var(--text-muted)]">
                      No groups exist yet — create one in the Scheduler tab (Groups view).
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Run result */}
        {resp && (
          <div className={`rounded border p-3 text-xs flex flex-col gap-2 ${resp.success ? 'border-[var(--success-border-soft)] bg-[var(--success-bg-soft)]' : 'border-[var(--danger-border-soft)] bg-[var(--danger-bg-soft)]'}`}>
            <div>
              {resp.success
                ? <span className="text-[var(--success-text)]">✓ {resp.statusCode} · {resp.durationMs} ms</span>
                : <span className="text-[var(--danger-text)]">✗ {resp.errorMessage}</span>}
              {runResult.validationPassed != null && (
                <span className={`ml-3 inline-flex items-center gap-1 ${runResult.validationPassed ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]'}`}>
                  {runResult.validationPassed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  Validation {runResult.validationPassed ? 'PASSED' : 'FAILED'}
                </span>
              )}
              {runResult.executionHistoryId && <span className="ml-3 text-[var(--text-muted)]">history #{runResult.executionHistoryId}</span>}
            </div>
            {resp.body && <pre className="max-h-48 overflow-auto text-[var(--text-secondary)] bg-[var(--bg-surface-2)] rounded p-2">{pretty(resp.body)}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}

function safeParse(s, fallback) {
  try {
    const v = JSON.parse(s);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function pretty(s) {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
