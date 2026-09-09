import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Plus, Trash2, Save, Database, X, FolderPlus } from 'lucide-react';
import { apiClient } from '../api/client.js';
import KeyValueEditor from '../components/KeyValueEditor.jsx';
import FormDataEditor from '../components/FormDataEditor.jsx';
import ValidationCheckPanel from '../components/ValidationCheckPanel.jsx';
import AuthEditor, { EMPTY_AUTH } from '../components/AuthEditor.jsx';
import JsonTree from '../components/JsonTree.jsx';
import { ThemedEditor } from '../components/ThemedEditor.jsx';
import ModuleApiTree from '../components/ModuleApiTree.jsx';
import { Button } from '../components/Button.jsx';
import { ModalOverlay } from '../components/ModalOverlay.jsx';
import { INPUT_CLASS as inputCls } from '../lib/statusColors.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const BODY_TYPES = ['NONE', 'JSON', 'XML', 'TEXT', 'FORM_DATA', 'FORM_URLENCODED'];
const OPERATORS = ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'REGEX', 'EXISTS', 'TYPE_IS', 'RANGE'];

const emptyForm = {
  name: '', method: 'GET', url: '', moduleId: '', headers: [],
  bodyType: 'NONE', body: '', formData: [], requiredPayloadFields: [], auth: { ...EMPTY_AUTH },
  timeoutMs: 15000, cacheStrategy: 'PER_CALL', cacheTtlSeconds: 3600,
};

export default function BaseApis() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [runResult, setRunResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [extractPrompt, setExtractPrompt] = useState(null); // {path, name}
  const [addToCollection, setAddToCollection] = useState('');
  const [addedMessage, setAddedMessage] = useState('');
  const [newRule, setNewRule] = useState({ jsonPath: '', operator: 'EQUALS', expectedValue: '' });

  const { data: apis = [], isLoading: apisLoading } = useQuery({
    queryKey: ['base-apis'],
    queryFn: async () => (await apiClient.get('/v1/base-apis')).data,
  });
  const { data: collections = [] } = useQuery({
    queryKey: ['collections'],
    queryFn: async () => (await apiClient.get('/v1/collections')).data,
  });
  const { data: modules = [], isLoading: modulesLoading } = useQuery({
    queryKey: ['modules'],
    queryFn: async () => (await apiClient.get('/v1/modules')).data,
  });
  const { data: tree } = useQuery({
    queryKey: ['base-api-tree', selectedId],
    queryFn: async () => (await apiClient.get(`/v1/base-apis/${selectedId}/response-tree`)).data,
    enabled: !!selectedId,
  });
  const { data: rules = [] } = useQuery({
    queryKey: ['rules', 'BASE', selectedId],
    queryFn: async () => (await apiClient.get('/v1/validation-rules', { params: { apiType: 'BASE', apiId: selectedId } })).data,
    enabled: !!selectedId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['base-apis'] });
    qc.invalidateQueries({ queryKey: ['base-api-tree'] });
  };

  const toPayload = () => ({
    name: form.name, method: form.method, url: form.url,
    moduleId: form.moduleId ? Number(form.moduleId) : null,
    headers: JSON.stringify(form.headers),
    bodyType: form.bodyType, body: form.body || null,
    formData: JSON.stringify(form.formData || []),
    requiredPayloadFields: JSON.stringify(form.requiredPayloadFields || []),
    authType: form.auth.type,
    authConfig: JSON.stringify(form.auth),
    timeoutMs: Number(form.timeoutMs) || 15000,
    cacheStrategy: form.cacheStrategy,
    cacheTtlSeconds: form.cacheStrategy === 'CACHED_TTL' ? Number(form.cacheTtlSeconds) || 3600 : null,
  });

  const saveMut = useMutation({
    mutationFn: async () => selectedId
      ? (await apiClient.put(`/v1/base-apis/${selectedId}`, toPayload())).data
      : (await apiClient.post('/v1/base-apis', toPayload())).data,
    onSuccess: (saved) => { setSelectedId(saved.id); invalidate(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => apiClient.delete(`/v1/base-apis/${id}`),
    onSuccess: () => { setSelectedId(null); setForm(emptyForm); invalidate(); },
  });

  const extractMut = useMutation({
    mutationFn: ({ path, name }) => apiClient.post(`/v1/base-apis/${selectedId}/bindings`,
      { sourceJsonPath: path, variableName: name }),
    onSuccess: () => { setExtractPrompt(null); invalidate(); },
  });

  const deleteExtractionMut = useMutation({
    mutationFn: (bindingId) => apiClient.delete(`/v1/base-apis/${selectedId}/bindings/${bindingId}`),
    onSuccess: invalidate,
  });

  const addRuleMut = useMutation({
    mutationFn: () => apiClient.post('/v1/validation-rules', {
      apiType: 'BASE', apiId: selectedId,
      jsonPath: newRule.jsonPath, operator: newRule.operator,
      expectedValue: newRule.operator === 'EXISTS' ? null : newRule.expectedValue,
    }),
    onSuccess: () => {
      setNewRule({ jsonPath: '', operator: 'EQUALS', expectedValue: '' });
      qc.invalidateQueries({ queryKey: ['rules', 'BASE', selectedId] });
    },
  });

  const deleteRuleMut = useMutation({
    mutationFn: (id) => apiClient.delete(`/v1/validation-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules', 'BASE', selectedId] }),
  });

  const addToCollectionMut = useMutation({
    mutationFn: (collectionId) => apiClient.post(`/v1/base-apis/${selectedId}/add-to-collection/${collectionId}`),
    onSuccess: (_, collectionId) => {
      const c = collections.find((c) => c.id === Number(collectionId));
      setAddedMessage(`Added to "${c?.name ?? 'collection'}" ✓`);
      setAddToCollection('');
      setTimeout(() => setAddedMessage(''), 2500);
      qc.invalidateQueries({ queryKey: ['collection-requests'] });
    },
  });

  const select = (api) => {
    setSelectedId(api.id);
    setRunResult(null);
    setForm({
      name: api.name, method: api.method, url: api.url,
      moduleId: api.moduleId ?? '',
      headers: safeParse(api.headers, []),
      bodyType: api.bodyType || 'NONE', body: api.body || '',
      formData: safeParse(api.formData, []),
      requiredPayloadFields: safeParse(api.requiredPayloadFields, []),
      auth: { ...EMPTY_AUTH, ...safeParse(api.authConfig, {}) },
      timeoutMs: api.timeoutMs, cacheStrategy: api.cacheStrategy,
      cacheTtlSeconds: api.cacheTtlSeconds ?? 3600,
    });
  };

  const run = async () => {
    if (!selectedId) return;
    setRunning(true);
    try {
      const { data } = await apiClient.post(`/v1/base-apis/${selectedId}/execute`);
      setRunResult(data);
      invalidate();
    } catch (e) {
      setRunResult({ success: false, errorMessage: e.response?.data?.message || e.message });
    } finally {
      setRunning(false);
    }
  };

  const flatModules = flattenModules(modules);

  return (
    <div className="h-screen flex overflow-hidden">
      {/* List */}
      <div className="w-60 shrink-0 border-r border-[var(--border)] flex flex-col">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)]">
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Base APIs</span>
          <button onClick={() => { setSelectedId(null); setForm(emptyForm); setRunResult(null); }}
            className="text-[var(--accent-text)] hover:text-[var(--accent-hover)]" title="New base API">
            <Plus size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <ModuleApiTree
            modules={modules}
            apis={apis}
            selectedId={selectedId}
            onSelect={select}
            loading={apisLoading || modulesLoading}
            emptyMessage="No base APIs yet — create a token/lookup supplier API."
            renderItem={(a) => (
              <>
                <span className="font-semibold text-[var(--accent-text)] mr-1.5">{a.method}</span>{a.name}
                <div className="text-[var(--text-muted)] truncate">{a.url}</div>
              </>
            )}
          />
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-[var(--accent-text)]" />
          <h1 className="text-base font-semibold">{selectedId ? 'Edit Base API' : 'New Base API'}</h1>
          <div className="ml-auto flex gap-2 items-center">
            {selectedId && (
              <>
                {addedMessage && <span className="text-xs text-[var(--success-text)]">{addedMessage}</span>}
                <div className="flex items-center gap-1" title="Copy this base API into a tester collection">
                  <FolderPlus size={13} className="text-[var(--text-muted)]" />
                  <select value={addToCollection}
                    onChange={(e) => { setAddToCollection(e.target.value); if (e.target.value) addToCollectionMut.mutate(e.target.value); }}
                    className="bg-[var(--bg-surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]">
                    <option value="">Add to collection…</option>
                    {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <Button onClick={run} disabled={running} className="!px-3 !py-1.5 !text-xs">
                  <Play size={12} /> {running ? 'Running…' : 'Run'}
                </Button>
                <button onClick={() => deleteMut.mutate(selectedId)}
                  className="flex items-center gap-1.5 rounded border border-[var(--danger-border-soft)] text-[var(--danger-text)] hover:bg-[var(--danger-bg-soft)] px-3 py-1.5 text-xs font-semibold">
                  <Trash2 size={12} /> Delete
                </button>
              </>
            )}
            <button onClick={() => saveMut.mutate()} disabled={!form.name || !form.url || saveMut.isPending}
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
          <input placeholder="Name (e.g. Fetch Auth Token)" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          <select value={form.moduleId} onChange={(e) => setForm({ ...form, moduleId: e.target.value })} className={inputCls}>
            <option value="">-Select Module-</option>
            {flatModules.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>

        <div className="flex gap-2">
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={`${inputCls} w-28 font-semibold`}>
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <input placeholder="https://auth.example.com/token" value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })} className={`${inputCls} flex-1`} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            Cache strategy
            <select value={form.cacheStrategy} onChange={(e) => setForm({ ...form, cacheStrategy: e.target.value })} className={inputCls}>
              <option value="PER_CALL">Per call (always fresh)</option>
              <option value="CACHED_TTL">Cached with TTL (tokens)</option>
              <option value="SCHEDULED_REFRESH">Scheduled refresh (read cache)</option>
            </select>
          </label>
          {form.cacheStrategy === 'CACHED_TTL' && (
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              TTL seconds
              <input type="number" min="1" value={form.cacheTtlSeconds}
                onChange={(e) => setForm({ ...form, cacheTtlSeconds: e.target.value })} className={inputCls} />
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            Timeout ms
            <input type="number" min="100" value={form.timeoutMs}
              onChange={(e) => setForm({ ...form, timeoutMs: e.target.value })} className={inputCls} />
          </label>
        </div>

        <div>
          <div className="text-xs text-[var(--text-muted)] mb-1.5">Headers</div>
          <KeyValueEditor items={form.headers} onChange={(headers) => setForm({ ...form, headers })} keyPlaceholder="Header" showRequired />
        </div>

        <div>
          <div className="flex gap-1 mb-1.5">
            {BODY_TYPES.map((bt) => (
              <button key={bt} onClick={() => setForm({ ...form, bodyType: bt })}
                className={`px-2.5 py-1 rounded text-[11px] ${form.bodyType === bt ? 'bg-[var(--accent-bg-soft)] text-[var(--accent-text)] border border-[var(--accent-border-soft)]' : 'text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text-secondary)]'}`}>
                {bt}
              </button>
            ))}
          </div>
          {form.bodyType === 'FORM_DATA' && (
            <FormDataEditor items={form.formData} onChange={(formData) => setForm({ ...form, formData })} />
          )}
          {form.bodyType !== 'NONE' && form.bodyType !== 'FORM_DATA' && (
            <div className="h-32 border border-[var(--border)] rounded overflow-hidden">
              <ThemedEditor height="100%"
                language={form.bodyType === 'JSON' ? 'json' : 'plaintext'}
                value={form.body} onChange={(v) => setForm({ ...form, body: v ?? '' })}
                options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false }} />
            </div>
          )}
          {form.bodyType === 'JSON' && (
            <div className="mt-2">
              <div className="text-xs text-[var(--text-muted)] mb-1.5">Required Payload Fields</div>
              <KeyValueEditor items={form.requiredPayloadFields}
                onChange={(requiredPayloadFields) => setForm({ ...form, requiredPayloadFields })}
                keyPlaceholder="JSON field name" showRequired />
            </div>
          )}
        </div>

        <div>
          <div className="text-xs text-[var(--text-muted)] mb-1.5">Authorization</div>
          <AuthEditor auth={form.auth} onChange={(auth) => setForm({ ...form, auth })} />
        </div>

        {selectedId && <ValidationCheckPanel baseUrl={`/v1/base-apis/${selectedId}`} />}

        {selectedId && (
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-1.5">
              Validation Rules {rules.length > 0 && <span className="text-[var(--success-text)]">({rules.length})</span>}
            </div>
            <div className="flex flex-col gap-2 max-w-3xl">
              <div className="flex gap-2 items-end">
                <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)] flex-1">
                  JSONPath
                  <input placeholder="$.status" value={newRule.jsonPath}
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
            </div>
          </div>
        )}

        {runResult && (
          <div className={`rounded border p-3 text-xs ${runResult.success ? 'border-[var(--success-border-soft)] bg-[var(--success-bg-soft)]' : 'border-[var(--danger-border-soft)] bg-[var(--danger-bg-soft)]'}`}>
            {runResult.success
              ? <span className="text-[var(--success-text)]">✓ {runResult.statusCode} {runResult.statusText} · {runResult.durationMs} ms — snapshot refreshed, pick fields on the right</span>
              : <span className="text-[var(--danger-text)]">✗ {runResult.errorMessage}</span>}
          </div>
        )}
      </div>

      {/* Response tree + extractions */}
      {selectedId && (
        <div className="w-96 shrink-0 border-l border-[var(--border)] flex flex-col min-h-0">
          <div className="px-3 py-2.5 border-b border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Response Fields → Variables
          </div>
          <div className="p-3 border-b border-[var(--border)]">
            <div className="text-[11px] text-[var(--text-muted)] mb-1.5">Extracted variables (usable as {'{{name}}'} in Regular APIs)</div>
            {(tree?.extractions ?? []).map((x) => (
              <div key={x.id} className="flex items-center gap-2 text-xs py-1">
                <span className="text-[var(--success-text)] font-mono">{'{{' + x.variableName + '}}'}</span>
                <span className="text-[var(--text-muted)] font-mono truncate flex-1">{x.sourceJsonPath}</span>
                <button onClick={() => deleteExtractionMut.mutate(x.id)} className="text-[var(--text-muted)] hover:text-[var(--danger-text)]"><Trash2 size={12} /></button>
              </div>
            ))}
            {(tree?.extractions ?? []).length === 0 && <div className="text-xs text-[var(--text-muted)]">None yet — click + on a field below.</div>}
          </div>
          <div className="flex-1 overflow-auto min-h-0">
            {tree?.snapshot
              ? <JsonTree json={tree.snapshot} onExtract={(path, name) => setExtractPrompt({ path, name })} />
              : <div className="p-3 text-xs text-[var(--text-muted)]">Run the API once to load its response here.</div>}
          </div>
        </div>
      )}

      {/* Extract-variable prompt */}
      {extractPrompt && (
        <ModalOverlay onClose={() => setExtractPrompt(null)}>
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4 w-96">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold">Extract as variable</span>
              <button onClick={() => setExtractPrompt(null)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"><X size={16} /></button>
            </div>
            <div className="text-xs text-[var(--text-muted)] font-mono mb-2">{extractPrompt.path}</div>
            <input autoFocus value={extractPrompt.name}
              onChange={(e) => setExtractPrompt({ ...extractPrompt, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && extractMut.mutate(extractPrompt)}
              className={`${inputCls} w-full mb-3`} placeholder="variableName" />
            <Button className="w-full" onClick={() => extractMut.mutate(extractPrompt)} disabled={!extractPrompt.name}>
              Create {'{{' + (extractPrompt.name || '…') + '}}'}
            </Button>
          </div>
        </ModalOverlay>
      )}
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

export function flattenModules(nodes, prefix = '') {
  const out = [];
  for (const n of nodes) {
    out.push({ id: n.id, label: prefix + n.name });
    out.push(...flattenModules(n.children ?? [], prefix + n.name + ' / '));
  }
  return out;
}
