import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Save, ChevronLeft, Plus, Folder } from 'lucide-react';
import { Loader } from '../../../../../shared/ui/Loader.jsx';
import { apiClient } from '../api/client.js';
import axios from 'axios';
import KeyValueEditor from '../components/KeyValueEditor.jsx';
import FormDataEditor from '../components/FormDataEditor.jsx';
import ValidationCheckPanel from '../components/ValidationCheckPanel.jsx';
import ResponseViewer from '../components/ResponseViewer.jsx';
import RequestHistoryPanel from '../components/RequestHistoryPanel.jsx';
import { EMPTY_AUTH } from '../components/AuthEditor.jsx';
import AuthEditor from '../components/AuthEditor.jsx';
import { ThemedEditor } from '../components/ThemedEditor.jsx';
import { METHOD_COLORS } from '../lib/statusColors.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

const BUILDER_SUBTABS = ['Parameters', 'Body', 'Headers', 'Authorization'];
const BODY_TYPES = ['NONE', 'JSON', 'XML', 'TEXT', 'HTML', 'FORM_DATA', 'FORM_URLENCODED'];

function flattenFolders(nodes, depth = 0) {
  const out = [];
  for (const n of nodes) {
    out.push({ ...n, depth });
    out.push(...flattenFolders(n.children ?? [], depth + 1));
  }
  return out;
}

export default function RequestWorkspace() {
  const { collectionId, requestId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = requestId === 'new';

  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [queryParams, setQueryParams] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [bodyType, setBodyType] = useState('NONE');
  const [body, setBody] = useState('');
  const [formData, setFormData] = useState([]);
  const [requiredPayloadFields, setRequiredPayloadFields] = useState([]);
  const [auth, setAuth] = useState({ ...EMPTY_AUTH });
  const [builderSubTab, setBuilderSubTab] = useState('Parameters');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [folderId, setFolderId] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const executeAbortRef = useRef(null);

  const { data: existing } = useQuery({
    queryKey: ['collection-request', collectionId, requestId],
    queryFn: async () => (await apiClient.get(`/v1/collections/${collectionId}/requests/${requestId}`)).data,
    enabled: !isNew,
  });

  const { data: folderTree = [] } = useQuery({
    queryKey: ['collection-folders', collectionId],
    queryFn: async () => (await apiClient.get(`/v1/collections/${collectionId}/folders`)).data,
  });
  const flatFolders = flattenFolders(folderTree);

  // Reset to a blank builder when navigating to "new" (e.g. from another
  // request's workspace) — otherwise the previous request's fields would
  // still be in state when this route's own effect below has nothing to load.
  useEffect(() => {
    if (isNew) {
      setMethod('GET'); setUrl(''); setQueryParams([]); setHeaders([]);
      setBodyType('NONE'); setBody(''); setFormData([]); setRequiredPayloadFields([]); setAuth({ ...EMPTY_AUTH });
      setRequestName(''); setFolderId(''); setResponse(null);
    }
  }, [requestId, isNew]);

  useEffect(() => {
    if (!existing) return;
    try {
      const cfg = JSON.parse(existing.configJson);
      setMethod(cfg.method ?? 'GET');
      setUrl(cfg.url ?? '');
      setQueryParams(cfg.queryParams ?? []);
      setHeaders(cfg.headers ?? []);
      setBodyType(cfg.bodyType ?? 'NONE');
      setBody(cfg.body ?? '');
      setFormData(cfg.formData ?? []);
      setRequiredPayloadFields(cfg.requiredPayloadFields ?? []);
      setAuth({ ...EMPTY_AUTH, ...(cfg.auth ?? {}) });
      setRequestName(existing.name);
      setFolderId(existing.folderId ?? '');
    } catch { /* corrupt config */ }
  }, [existing]);

  const buildConfig = () => ({
    method, url, queryParams, headers, bodyType, body, formData, requiredPayloadFields, auth,
    timeoutMs: 30000, followRedirects: true, verifySsl: true,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = { name: requestName.trim(), config: buildConfig(), folderId: folderId ? Number(folderId) : null };
      if (isNew) {
        return (await apiClient.post(`/v1/collections/${collectionId}/requests`, payload)).data;
      }
      return (await apiClient.put(`/v1/collections/${collectionId}/requests/${requestId}`, payload)).data;
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['collection-requests', collectionId] });
      setSaveMessage('Saved ✓');
      setTimeout(() => setSaveMessage(''), 2000);
      if (isNew) navigate(`/tester/${collectionId}/${saved.id}`, { replace: true });
    },
  });

  const run = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setIsExecuting(true);
    setResponse(null);

    const abortCtrl = new AbortController();
    executeAbortRef.current = abortCtrl;
    try {
      let activeRequestId = requestId;
      const name = requestName.trim() || existing?.name || `${method} ${url}`.slice(0, 80);
      const payload = { name, config: buildConfig(), folderId: folderId ? Number(folderId) : null };
      if (isNew) {

        const { data: created } = await apiClient.post(`/v1/collections/${collectionId}/requests`, payload);
        activeRequestId = created.id;
        setRequestName(name);
      } else {

        await apiClient.put(`/v1/collections/${collectionId}/requests/${requestId}`, payload);
      }

      const baseUrl = apiClient.defaults.baseURL;
      const token = JSON.parse(localStorage.getItem('automationPortalAuth') || 'null')?.accessToken;
      const { data } = await axios.post(
        `${baseUrl}/v1/collections/${collectionId}/requests/${activeRequestId}/execute`,
        undefined,
        {
          signal: abortCtrl.signal,
          timeout: 130000,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      setResponse(data);
      qc.invalidateQueries({ queryKey: ['collection-requests', collectionId] });
      qc.invalidateQueries({ queryKey: ['collection-request-history', Number(activeRequestId)] });
      qc.invalidateQueries({ queryKey: ['collection-request', collectionId, requestId] });
      if (isNew) navigate(`/tester/${collectionId}/${activeRequestId}`, { replace: true });
    } catch (err) {
      if (axios.isCancel(err)) return; // user navigated away — don't show error
      setResponse({ success: false, errorMessage: err.response?.data?.message || err.message, durationMs: 0 });
    } finally {
      setLoading(false);
      setIsExecuting(false);
      executeAbortRef.current = null;
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-surface)]">
        <Link to={`/tester/${collectionId}`} className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0">
          <ChevronLeft size={13} /> Back
        </Link>
        <input value={requestName} onChange={(e) => setRequestName(e.target.value)}
          placeholder="Request name"
          className="bg-[var(--bg-surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-xs outline-none placeholder:text-[var(--text-muted)] w-56 focus:border-[var(--accent)]" />
        <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
          <Folder size={12} />
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}
            className="bg-[var(--bg-surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-xs outline-none max-w-[140px]">
            <option value="">Root (no folder)</option>
            {flatFolders.map((f) => <option key={f.id} value={f.id}>{'—'.repeat(f.depth)} {f.name}</option>)}
          </select>
        </div>
        <button onClick={() => saveMut.mutate()} disabled={!requestName.trim() || saveMut.isPending || loading}
          className="flex items-center gap-1.5 rounded border border-[var(--accent-border-soft)] text-[var(--accent-text)] hover:bg-[var(--accent-bg-soft)] disabled:opacity-40 px-3 py-1.5 text-xs font-semibold">
          <Save size={12} /> {isNew ? 'Save' : 'Update'}
        </button>
        {saveMessage && <span className="text-xs text-[var(--success-text)]">{saveMessage}</span>}
        {saveMut.isError && (
          <span className="text-xs text-[var(--danger-text)]">{saveMut.error?.response?.data?.message ?? 'Save failed'}</span>
        )}
        <button onClick={() => navigate(`/tester/${collectionId}/new`)}
          className="flex items-center gap-1.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] px-3 py-1.5 text-xs font-semibold ml-auto">
          <Plus size={12} /> New Request
        </button>
      </div>

      {/* URL bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <div className="flex flex-1 items-stretch rounded-md border border-[var(--border)] bg-[var(--bg-surface-2)] overflow-hidden focus-within:border-[var(--accent)]">
          <select value={method} onChange={(e) => setMethod(e.target.value)}
            className={`bg-[var(--bg-surface-2)] px-3 py-2 text-sm font-semibold outline-none cursor-pointer ${METHOD_COLORS[method]}`}>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input value={url} onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="Enter request URL"
            className="flex-1 bg-transparent border-l border-[var(--border)] px-3 py-2 text-sm outline-none placeholder:text-[var(--text-muted)]" />
        </div>
        <button onClick={run} disabled={loading || saveMut.isPending}
          className="flex items-center gap-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white">
          {loading ? <><Loader size={14} /> Sending…</> : <><Send size={14} /> Send</>}
        </button>
      </div>

      <div className="flex flex-col">
        <div className="h-[130px] shrink-0 flex flex-col border-b border-[var(--border)] min-h-0">
          <div className="flex gap-1 px-4 pt-2 border-b border-[var(--border)]">
            {BUILDER_SUBTABS.map((t) => (
              <button key={t} onClick={() => setBuilderSubTab(t)}
                className={`px-3 py-2 text-xs border-b-2 -mb-px ${builderSubTab === t ? 'border-[var(--accent)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-4 min-h-0">
            {builderSubTab === 'Parameters' && <KeyValueEditor items={queryParams} onChange={setQueryParams} keyPlaceholder="Parameter" showRequired />}
            {builderSubTab === 'Headers' && <KeyValueEditor items={headers} onChange={setHeaders} keyPlaceholder="Header" showRequired />}
            {builderSubTab === 'Body' && (
              <div className="h-full flex flex-col gap-2">
                <div className="flex gap-1">
                  {BODY_TYPES.map((bt) => (
                    <button key={bt} onClick={() => setBodyType(bt)}
                      className={`px-2.5 py-1 rounded text-[11px] ${bodyType === bt ? 'bg-[var(--accent-bg-soft)] text-[var(--accent-text)] border border-[var(--accent-border-soft)]' : 'text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text-secondary)]'}`}>
                      {bt === 'FORM_URLENCODED' ? 'x-www-form-urlencoded' : bt === 'FORM_DATA' ? 'form-data' : bt}
                    </button>
                  ))}
                </div>
                {bodyType === 'FORM_DATA' && (
                  <div className="flex-1 min-h-0 overflow-auto">
                    <FormDataEditor items={formData} onChange={setFormData} />
                  </div>
                )}
                {bodyType !== 'NONE' && bodyType !== 'FORM_DATA' && (
                  <div className="flex-1 min-h-0 border border-[var(--border)] rounded-md overflow-hidden">
                    <ThemedEditor height="100%"
                      language={bodyType === 'JSON' ? 'json' : bodyType === 'XML' || bodyType === 'HTML' ? 'html' : 'plaintext'}
                      value={body} onChange={(v) => setBody(v ?? '')}
                      options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false }} />
                  </div>
                )}
                {bodyType === 'JSON' && (
                  <div className="shrink-0 pt-2">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">Required Payload Fields</div>
                    <KeyValueEditor items={requiredPayloadFields} onChange={setRequiredPayloadFields}
                      keyPlaceholder="JSON field name" showRequired />
                  </div>
                )}
              </div>
            )}
            {builderSubTab === 'Authorization' && <AuthEditor auth={auth} onChange={setAuth} />}
          </div>
        </div>

        {!isNew && (
          <div className="px-4 pt-3">
            <ValidationCheckPanel baseUrl={`/v1/collections/${collectionId}/requests/${requestId}`} />
          </div>
        )}

        <ResponseViewer response={response} loading={loading} />

        {/* History for this specific API — pinned at the bottom, collapsible.
            Unrelated to the sidebar's global History page. */}
        <RequestHistoryPanel requestId={isNew ? null : Number(requestId)} />
      </div>
    </div>
  );
}
