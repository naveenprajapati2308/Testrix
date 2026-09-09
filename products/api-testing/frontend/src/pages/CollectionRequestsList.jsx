import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Download, ChevronDown, ChevronRight, ChevronLeft, CheckCircle2, XCircle,
  Trash2, Copy, Braces, X, Save, FolderPlus, Folder, Layers, Pencil, RefreshCw,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import KeyValueEditor from '../components/KeyValueEditor.jsx';
import { Button } from '../components/Button.jsx';
import { ModalOverlay } from '../components/ModalOverlay.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { INPUT_CLASS as inputCls, methodColor, CLASS_COLORS } from '../lib/statusColors.js';
import { downloadFrom } from '../lib/download.js';
import { Loader } from '../../../../../shared/ui/Loader.jsx';

const GRID_COLS = 'grid grid-cols-[1fr_90px_1.2fr_140px_160px_90px] gap-2 items-center';

function statusPillClass(cls) {
  if (cls === '2xx' || cls === '3xx') return CLASS_COLORS['2xx'];
  if (cls === '4xx' || cls === '5xx') return CLASS_COLORS['4xx'];
  if (cls === 'TIMEOUT') return CLASS_COLORS.TIMEOUT;
  return 'text-[var(--text-muted)]';
}

function flattenFolders(nodes, depth = 0) {
  const out = [];
  for (const n of nodes) {
    out.push({ ...n, depth });
    out.push(...flattenFolders(n.children ?? [], depth + 1));
  }
  return out;
}

export default function CollectionRequestsList() {
  const { collectionId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [draftVariables, setDraftVariables] = useState([]);
  const [saveMessage, setSaveMessage] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [newFolderParent, setNewFolderParent] = useState(undefined); // undefined = modal closed
  const [newFolderName, setNewFolderName] = useState('');
  const [envMenuOpen, setEnvMenuOpen] = useState(false);
  const [envManageOpen, setEnvManageOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState(null); // {id?, name, variables}
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => { setPage(0); }, [collectionId]);

  const { data: collections = [] } = useQuery({
    queryKey: ['collections'],
    queryFn: async () => (await apiClient.get('/v1/collections')).data,
  });
  const collection = collections.find((c) => String(c.id) === collectionId);

  const { data: requests = [], isFetching: requestsFetching, isLoading: requestsLoading, refetch: refetchRequests } = useQuery({
    queryKey: ['collection-requests', collectionId],
    queryFn: async () => (await apiClient.get(`/v1/collections/${collectionId}/requests`)).data,
  });

  const { data: folderTree = [], isLoading: foldersLoading } = useQuery({
    queryKey: ['collection-folders', collectionId],
    queryFn: async () => (await apiClient.get(`/v1/collections/${collectionId}/folders`)).data,
  });

  const { data: variables = [] } = useQuery({
    queryKey: ['collection-variables', collectionId],
    queryFn: async () => (await apiClient.get(`/v1/collections/${collectionId}/variables`)).data,
  });

  const { data: environments = [] } = useQuery({
    queryKey: ['collection-environments', collectionId],
    queryFn: async () => (await apiClient.get(`/v1/collections/${collectionId}/environments`)).data,
  });

  const invalidateRequests = () => qc.invalidateQueries({ queryKey: ['collection-requests', collectionId] });
  const invalidateFolders = () => qc.invalidateQueries({ queryKey: ['collection-folders', collectionId] });
  const invalidateEnvs = () => {
    qc.invalidateQueries({ queryKey: ['collection-environments', collectionId] });
    qc.invalidateQueries({ queryKey: ['collections'] });
  };

  const deleteMut = useMutation({
    mutationFn: (requestId) => apiClient.delete(`/v1/collections/${collectionId}/requests/${requestId}`),
    onSuccess: invalidateRequests,
  });

  const duplicateMut = useMutation({
    mutationFn: async (r) => {
      const { data: full } = await apiClient.get(`/v1/collections/${collectionId}/requests/${r.id}`);
      const config = JSON.parse(full.configJson);
      return apiClient.post(`/v1/collections/${collectionId}/requests`, { name: `${r.name} (copy)`, config, folderId: r.folderId });
    },
    onSuccess: invalidateRequests,
  });

  const moveMut = useMutation({
    mutationFn: ({ requestId, folderId }) => apiClient.patch(`/v1/collections/${collectionId}/requests/${requestId}/move`, { folderId }),
    onSuccess: invalidateRequests,
  });

  const createFolderMut = useMutation({
    mutationFn: () => apiClient.post(`/v1/collections/${collectionId}/folders`, {
      name: newFolderName.trim(), parentFolderId: newFolderParent ?? null,
    }),
    onSuccess: () => { setNewFolderParent(undefined); setNewFolderName(''); invalidateFolders(); },
  });

  const deleteFolderMut = useMutation({
    mutationFn: (folderId) => apiClient.delete(`/v1/collections/${collectionId}/folders/${folderId}`),
    onSuccess: () => { invalidateFolders(); invalidateRequests(); },
  });

  const saveVariablesMut = useMutation({
    mutationFn: () => apiClient.put(`/v1/collections/${collectionId}/variables`, { variables: draftVariables }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collection-variables', collectionId] });
      setSaveMessage('Saved ✓');
      setTimeout(() => setSaveMessage(''), 1500);
    },
  });

  const activateEnvMut = useMutation({
    mutationFn: (environmentId) => apiClient.patch(`/v1/collections/${collectionId}/environments/active`, { environmentId }),
    onSuccess: () => { invalidateEnvs(); setEnvMenuOpen(false); },
  });

  const saveEnvMut = useMutation({
    mutationFn: () => editingEnv.id
      ? apiClient.put(`/v1/collections/${collectionId}/environments/${editingEnv.id}`, { name: editingEnv.name, variables: editingEnv.variables })
      : apiClient.post(`/v1/collections/${collectionId}/environments`, { name: editingEnv.name, variables: editingEnv.variables }),
    onSuccess: () => { setEditingEnv(null); invalidateEnvs(); },
  });

  const deleteEnvMut = useMutation({
    mutationFn: (envId) => apiClient.delete(`/v1/collections/${collectionId}/environments/${envId}`),
    onSuccess: invalidateEnvs,
  });

  const openVariables = () => { setDraftVariables(variables.length ? variables : []); setVariablesOpen(true); };
  const toggleFolder = (id) => setCollapsed((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const flatFolders = flattenFolders(folderTree);
  const requestsByFolder = new Map();
  for (const r of requests) {
    const key = r.folderId ?? 'root';
    if (!requestsByFolder.has(key)) requestsByFolder.set(key, []);
    requestsByFolder.get(key).push(r);
  }
  const foldersByParent = new Map();
  for (const f of flatFolders) {
    const key = f.parentFolderId ?? 'root';
    if (!foldersByParent.has(key)) foldersByParent.set(key, []);
    foldersByParent.get(key).push(f);
  }
  const activeEnv = environments.find((e) => e.id === collection?.activeEnvironmentId);

  const RequestRow = ({ r, depth }) => (
    <div className={`${GRID_COLS} px-4 py-2.5 border-b border-[var(--border-soft)] hover:bg-[var(--bg-hover)] cursor-pointer text-xs`}
      style={{ paddingLeft: 16 + depth * 20 }}
      onClick={() => navigate(`/tester/${collectionId}/${r.id}`)}>
      <span className="text-[var(--text-primary)] truncate">{r.name}</span>
      <span className={`font-semibold ${methodColor(r.method)}`}>{r.method}</span>
      <span className="text-[var(--text-secondary)] truncate" title={r.url}>{r.url}</span>
      <span className={`font-semibold ${statusPillClass(r.lastStatusClass)}`}>
        {r.lastStatusCode
          ? <span className="inline-flex items-center gap-1">
              {r.lastStatusClass === '2xx' || r.lastStatusClass === '3xx' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {r.lastStatusCode}
            </span>
          : r.lastStatusClass
            ? <span className="inline-flex items-center gap-1"><XCircle size={12} /> {r.lastStatusClass}</span>
            : <span className="text-[var(--text-muted)]">never run</span>}
      </span>
      <span className="text-[var(--text-muted)]">{r.lastExecutedAt ? new Date(r.lastExecutedAt).toLocaleString() : '—'}</span>
      <span className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
        <select value={r.folderId ?? ''} onChange={(e) => moveMut.mutate({ requestId: r.id, folderId: e.target.value ? Number(e.target.value) : null })}
          className="bg-[var(--bg-surface-2)] border border-[var(--border)] rounded text-[10px] px-1 py-0.5 outline-none max-w-[70px]" title="Move to folder">
          <option value="">Root</option>
          {flatFolders.map((f) => <option key={f.id} value={f.id}>{'—'.repeat(f.depth)} {f.name}</option>)}
        </select>
        <button onClick={() => duplicateMut.mutate(r)} title="Duplicate" className="text-[var(--text-muted)] hover:text-[var(--accent-text)]"><Copy size={13} /></button>
        <button onClick={() => deleteMut.mutate(r.id)} title="Delete" className="text-[var(--text-muted)] hover:text-[var(--danger-text)]"><Trash2 size={13} /></button>
      </span>
    </div>
  );

  const FolderSection = ({ folder }) => {
    const isCollapsed = collapsed.has(folder.id);
    const childFolders = foldersByParent.get(folder.id) ?? [];
    const childRequests = requestsByFolder.get(folder.id) ?? [];
    return (
      <>
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-soft)] bg-[var(--bg-hover)] text-xs"
          style={{ paddingLeft: 16 + folder.depth * 20 }}>
          <button onClick={() => toggleFolder(folder.id)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
          <Folder size={13} className="text-[var(--warning-text)]" />
          <span className="text-[var(--text-primary)] font-medium">{folder.name}</span>
          <span className="text-[var(--text-muted)]">({childRequests.length})</span>
          <button onClick={() => { setNewFolderParent(folder.id); setNewFolderName(''); }}
            className="ml-2 text-[var(--text-muted)] hover:text-[var(--accent-text)]" title="New sub-folder"><FolderPlus size={13} /></button>
          <button onClick={() => navigate(`/tester/${collectionId}/new`)}
            className="text-[var(--text-muted)] hover:text-[var(--accent-text)]" title="New request here"><Plus size={13} /></button>
          <button onClick={() => deleteFolderMut.mutate(folder.id)}
            className="ml-auto text-[var(--text-muted)] hover:text-[var(--danger-text)]" title="Delete folder"><Trash2 size={13} /></button>
        </div>
        {!isCollapsed && (
          <>
            {childFolders.map((f) => <FolderSection key={f.id} folder={f} />)}
            {childRequests.map((r) => <RequestRow key={r.id} r={r} depth={folder.depth + 1} />)}
          </>
        )}
      </>
    );
  };

  const rootFolders = foldersByParent.get('root') ?? [];
  const rootRequests = requestsByFolder.get('root') ?? [];
  const pagedRootRequests = rootRequests.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div className="flex-1 overflow-auto p-6 flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <Link to="/tester" className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-1">
            <ChevronLeft size={12} /> All collections
          </Link>
          <h1 className="text-lg font-semibold">{collection?.name ?? 'Collection'}</h1>
          <p className="text-xs text-[var(--text-muted)]">Recently executed first · click a request to open its workspace</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <button onClick={() => setEnvMenuOpen(!envMenuOpen)}
              className="flex items-center gap-1.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] px-3 py-1.5 text-xs font-semibold">
              <Layers size={12} /> {activeEnv ? activeEnv.name : 'No Environment'} <ChevronDown size={12} />
            </button>
            {envMenuOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-[var(--bg-surface)] border border-[var(--border)] rounded shadow-lg z-40 text-xs">
                <button onClick={() => activateEnvMut.mutate(null)}
                  className={`block w-full text-left px-3 py-2 hover:bg-[var(--bg-hover)] ${!activeEnv ? 'text-[var(--accent-text)]' : ''}`}>No Environment</button>
                {environments.map((e) => (
                  <button key={e.id} onClick={() => activateEnvMut.mutate(e.id)}
                    className={`block w-full text-left px-3 py-2 hover:bg-[var(--bg-hover)] ${activeEnv?.id === e.id ? 'text-[var(--accent-text)]' : ''}`}>{e.name}</button>
                ))}
                <div className="border-t border-[var(--border)]">
                  <button onClick={() => { setEnvManageOpen(true); setEnvMenuOpen(false); }}
                    className="block w-full text-left px-3 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]">Manage Environments…</button>
                </div>
              </div>
            )}
          </div>
          <button onClick={openVariables}
            className="flex items-center gap-1.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] px-3 py-1.5 text-xs font-semibold">
            <Braces size={12} /> Variables {variables.length > 0 && <span className="text-[var(--success-text)]">({variables.length})</span>}
          </button>
          <div className="relative">
            <button onClick={() => setExportMenuOpen(!exportMenuOpen)}
              className="flex items-center gap-1.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] px-3 py-1.5 text-xs font-semibold">
              <Download size={12} /> Export <ChevronDown size={12} />
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-[var(--bg-surface)] border border-[var(--border)] rounded shadow-lg z-40 text-xs">
                <button onClick={() => { downloadFrom(`/v1/collections/${collectionId}/export/postman`, 'collection.postman_collection.json'); setExportMenuOpen(false); }}
                  className="block w-full text-left px-3 py-2 hover:bg-[var(--bg-hover)]">Postman Collection</button>
                <button onClick={() => { downloadFrom(`/v1/collections/${collectionId}/export/json`, 'collection.json'); setExportMenuOpen(false); }}
                  className="block w-full text-left px-3 py-2 hover:bg-[var(--bg-hover)]">Native JSON</button>
              </div>
            )}
          </div>
          <button onClick={() => { setNewFolderParent(null); setNewFolderName(''); }}
            className="flex items-center gap-1.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] px-3 py-1.5 text-xs font-semibold">
            <FolderPlus size={12} /> New Folder
          </button>
          <button
            onClick={() => refetchRequests()}
            disabled={requestsFetching}
            title="Refresh request list"
            className="flex items-center gap-1.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
            <RefreshCw size={12} className={requestsFetching ? 'animate-spin' : ''} /> Refresh
          </button>
          <Button onClick={() => navigate(`/tester/${collectionId}/new`)}>
            <Plus size={14} /> New Request
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
        <div className={`${GRID_COLS} px-4 py-2.5 border-b border-[var(--border)] text-[var(--text-muted)] text-xs font-medium`}>
          <span>API Name</span><span>Method</span><span>Path</span><span>Response Status</span><span>Last Run</span><span></span>
        </div>
        {(requestsLoading || foldersLoading) ? (
          <div className="px-4 py-8 flex justify-center"><Loader size={24} label="Loading requests…" /></div>
        ) : (
          <>
            {rootFolders.map((f) => <FolderSection key={f.id} folder={f} />)}
            {pagedRootRequests.map((r) => <RequestRow key={r.id} r={r} depth={0} />)}
            {rootFolders.length === 0 && rootRequests.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">No requests yet — click "New Request" to build one</div>
            )}
          </>
        )}
      </div>

      <Pagination page={page + 1} pageSize={pageSize} totalRecords={rootRequests.length}
        onPageChange={(p) => setPage(p - 1)}
        onPageSizeChange={(n) => { setPageSize(n); setPage(0); }} />

      {/* New folder modal */}
      {newFolderParent !== undefined && (
        <ModalOverlay onClose={() => setNewFolderParent(undefined)}>
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4 w-96">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold">{newFolderParent ? 'New Sub-folder' : 'New Folder'}</span>
              <button onClick={() => setNewFolderParent(undefined)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"><X size={16} /></button>
            </div>
            <input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && newFolderName.trim() && createFolderMut.mutate()}
              placeholder="Folder name" className={`${inputCls} w-full mb-3`} />
            <Button className="w-full" onClick={() => createFolderMut.mutate()} disabled={!newFolderName.trim() || createFolderMut.isPending}>Create</Button>
          </div>
        </ModalOverlay>
      )}

      {/* Variables modal */}
      {variablesOpen && (
        <ModalOverlay onClose={() => setVariablesOpen(false)}>
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4 w-[560px] max-h-[80vh] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold">Collection Variables</span>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Always-on base values (e.g. from a Postman import). Use as <span className="font-mono text-[var(--success-text)]">{'{{key}}'}</span> anywhere in this collection's requests. An active environment overrides these.</p>
              </div>
              <button onClick={() => setVariablesOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"><X size={16} /></button>
            </div>
            <div className="overflow-auto">
              <KeyValueEditor items={draftVariables} onChange={setDraftVariables} keyPlaceholder="baseUrl" valuePlaceholder="https://api.example.com" />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => saveVariablesMut.mutate()} disabled={saveVariablesMut.isPending}>
                <Save size={13} /> Save Variables
              </Button>
              {saveMessage && <span className="text-xs text-[var(--success-text)]">{saveMessage}</span>}
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Environments management modal */}
      {envManageOpen && (
        <ModalOverlay onClose={() => { setEnvManageOpen(false); setEditingEnv(null); }}>
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4 w-[640px] max-h-[80vh] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Environments</span>
              <button onClick={() => { setEnvManageOpen(false); setEditingEnv(null); }} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"><X size={16} /></button>
            </div>

            {editingEnv ? (
              <div className="flex flex-col gap-3">
                <input value={editingEnv.name} onChange={(e) => setEditingEnv({ ...editingEnv, name: e.target.value })}
                  placeholder="Environment name (e.g. Dev, QA, Prod)" className={inputCls} />
                <div className="overflow-auto max-h-72">
                  <KeyValueEditor items={editingEnv.variables} onChange={(variables) => setEditingEnv({ ...editingEnv, variables })}
                    keyPlaceholder="baseUrl" valuePlaceholder="https://dev.example.com" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveEnvMut.mutate()} disabled={!editingEnv.name.trim() || saveEnvMut.isPending}>Save</Button>
                  <button onClick={() => setEditingEnv(null)} className="rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] px-4 py-2 text-sm font-semibold">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <Button className="w-fit" onClick={() => setEditingEnv({ name: '', variables: [] })}>
                  <Plus size={14} /> New Environment
                </Button>
                <div className="flex flex-col divide-y divide-[var(--border-soft)] border border-[var(--border)] rounded">
                  {environments.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                      <Layers size={13} className="text-[var(--accent-text)]" />
                      <span className="text-[var(--text-primary)]">{e.name}</span>
                      {activeEnv?.id === e.id && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--success-bg-soft)] text-[var(--success-text)]">ACTIVE</span>}
                      <span className="text-[var(--text-muted)]">{(JSON.parse(e.variables || '[]')).length} var(s)</span>
                      <div className="ml-auto flex gap-2">
                        <button onClick={() => setEditingEnv({ id: e.id, name: e.name, variables: JSON.parse(e.variables || '[]') })}
                          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"><Pencil size={13} /></button>
                        <button onClick={() => deleteEnvMut.mutate(e.id)} className="text-[var(--text-muted)] hover:text-[var(--danger-text)]"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                  {environments.length === 0 && <div className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">No environments yet</div>}
                </div>
              </>
            )}
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
