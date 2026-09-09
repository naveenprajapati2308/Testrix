import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Plus, Upload, X, Trash2, FileUp, CheckCircle2, XCircle } from 'lucide-react';
import { apiClient } from '../api/client.js';
import { Panel } from '../components/Panel.jsx';
import { Button } from '../components/Button.jsx';
import { ModalOverlay } from '../components/ModalOverlay.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { INPUT_CLASS as inputCls } from '../lib/statusColors.js';
import { Loader } from '../../../../../shared/ui/Loader.jsx';

/** Sniffs whether a collection file is Postman or OpenAPI/Swagger, without asking the user. */
function detectFormat(text) {
  try {
    const parsed = JSON.parse(text);
    const schema = parsed?.info?.schema;
    if (typeof schema === 'string' && schema.toLowerCase().includes('postman')) return 'postman';
    if (parsed.openapi || parsed.swagger) return 'openapi';
    if (parsed.info && Array.isArray(parsed.item)) return 'postman';
    if (parsed.paths) return 'openapi';
  } catch {
    // Not JSON — OpenAPI/Swagger specs are commonly YAML.
    return 'openapi';
  }
  return null;
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Tester landing page: pick a collection (Postman-style entry point). This is
 * what "API Tester" in the sidebar and "API Test" on the Dashboard both open —
 * neither jumps straight into a request builder.
 */
export default function TesterCollections() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef(null);
  const [newName, setNewName] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState('file'); // 'file' | 'paste'
  const [pasteFormat, setPasteFormat] = useState('postman');
  const [pasteText, setPasteText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: collections = [], isLoading: collectionsLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: async () => (await apiClient.get('/v1/collections')).data,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['collections'] });

  const createMut = useMutation({
    mutationFn: () => apiClient.post('/v1/collections', { name: newName.trim() }),
    onSuccess: ({ data }) => { setNewName(''); invalidate(); navigate(`/tester/${data.id}`); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => apiClient.delete(`/v1/collections/${id}`),
    onSuccess: invalidate,
  });

  /** Imports one or more file contents, auto-detecting Postman vs OpenAPI per file. */
  const importFilesMut = useMutation({
    mutationFn: async (files) => {
      const results = [];
      for (const f of files) {
        const format = detectFormat(f.text) ?? 'postman';
        try {
          const { data } = format === 'openapi'
            ? await apiClient.post('/v1/collections/import/openapi', { specText: f.text })
            : await apiClient.post('/v1/collections/import/postman', { postmanJson: f.text });
          results.push({ filename: f.filename, format, success: true, data });
        } catch (err) {
          results.push({ filename: f.filename, format, success: false,
            error: err.response?.data?.message ?? err.message });
        }
      }
      return results;
    },
    onSuccess: (results) => { setImportResults(results); invalidate(); },
  });

  const pasteImportMut = useMutation({
    mutationFn: () => pasteFormat === 'postman'
      ? apiClient.post('/v1/collections/import/postman', { postmanJson: pasteText })
      : apiClient.post('/v1/collections/import/openapi', { specText: pasteText }),
    onSuccess: ({ data }) => {
      setImportResults([{ filename: '(pasted text)', format: pasteFormat, success: true, data }]);
      setPasteText('');
      invalidate();
    },
    onError: (err) => {
      setImportResults([{ filename: '(pasted text)', format: pasteFormat, success: false,
        error: err.response?.data?.message ?? err.message }]);
    },
  });

  const handleFiles = async (fileList) => {
    const files = await Promise.all(
      Array.from(fileList).map(async (file) => ({ filename: file.name, text: await readFile(file) }))
    );
    importFilesMut.mutate(files);
  };

  return (
    <div className="flex-1 overflow-auto p-6 flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold">API Tester</h1>
          <p className="text-xs text-[var(--text-muted)]">Choose a collection to see its requests, or start a new one</p>
        </div>
        <button onClick={() => { setImportOpen(true); setImportResults(null); setImportMode('file'); }}
          className="flex items-center gap-1.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] px-3 py-1.5 text-xs font-semibold">
          <Upload size={12} /> Import Collection
        </button>
      </div>

      <Panel className="flex items-center gap-3">
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && newName.trim() && createMut.mutate()}
          placeholder="New collection name" className={`${inputCls} flex-1`} />
        <Button onClick={() => createMut.mutate()} disabled={!newName.trim() || createMut.isPending}>
          <Plus size={14} /> Create Collection
        </Button>
      </Panel>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] divide-y divide-[var(--border-soft)]">
        {collectionsLoading ? (
          <div className="px-4 py-8 flex justify-center"><Loader size={24} label="Loading collections…" /></div>
        ) : (
          <>
            {collections.slice((page - 1) * pageSize, page * pageSize).map((c) => (
              <div key={c.id} onClick={() => navigate(`/tester/${c.id}`)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] cursor-pointer group">
                <FolderOpen size={16} className="text-[var(--accent-text)]" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--text-primary)]">{c.name}</div>
                  {c.description && <div className="text-xs text-[var(--text-muted)] truncate">{c.description}</div>}
                </div>
                <span className="text-xs text-[var(--text-muted)]">{c.requestCount} request{c.requestCount === 1 ? '' : 's'}</span>
                <button onClick={(e) => { e.stopPropagation(); deleteMut.mutate(c.id); }}
                  className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--danger-text)] transition-opacity">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {collections.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">No collections yet — create one above or import an existing one.</div>
            )}
          </>
        )}
      </div>
      <Pagination page={page} pageSize={pageSize} totalRecords={collections.length}
        onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />

      {importOpen && (
        <ModalOverlay onClose={() => setImportOpen(false)}>
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4 w-[620px] max-h-[80vh] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Import Collection</span>
              <button onClick={() => setImportOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"><X size={16} /></button>
            </div>

            {importResults ? (
              <div className="text-sm flex flex-col gap-2">
                {importResults.map((r, i) => (
                  <div key={i} className={`flex items-start gap-2 rounded p-2 text-xs ${r.success ? 'bg-[var(--success-bg-soft)]' : 'bg-[var(--danger-bg-soft)]'}`}>
                    {r.success ? <CheckCircle2 size={14} className="text-[var(--success-text)] shrink-0 mt-0.5" /> : <XCircle size={14} className="text-[var(--danger-text)] shrink-0 mt-0.5" />}
                    <div>
                      <div className="text-[var(--text-secondary)]">{r.filename} <span className="text-[var(--text-muted)]">({r.format})</span></div>
                      {r.success
                        ? <div className="text-[var(--success-text)]">Imported "{r.data.collection.name}" — {r.data.importedRequests} request(s)
                            {r.data.warnings?.length > 0 && <span className="text-[var(--warning-text)]"> · {r.data.warnings.length} warning(s)</span>}
                          </div>
                        : <div className="text-[var(--danger-text)]">{r.error}</div>}
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 mt-1">
                  {importResults.length === 1 && importResults[0].success && (
                    <Button onClick={() => navigate(`/tester/${importResults[0].data.collection.id}`)}>Open Collection</Button>
                  )}
                  <button onClick={() => setImportOpen(false)}
                    className="rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] px-4 py-2 text-sm font-semibold">Close</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex gap-1">
                  {[['file', 'Upload File(s)'], ['paste', 'Paste Text']].map(([v, label]) => (
                    <button key={v} onClick={() => setImportMode(v)}
                      className={`px-3 py-1.5 rounded text-xs ${importMode === v ? 'bg-[var(--accent-bg-soft)] text-[var(--accent-text)] border border-[var(--accent-border-soft)]' : 'text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text-secondary)]'}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {importMode === 'file' ? (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex-1 min-h-[220px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
                      dragOver ? 'border-[var(--accent)] bg-[var(--accent-bg-soft)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'
                    }`}>
                    <FileUp size={28} className="text-[var(--text-muted)]" />
                    <div className="text-sm text-[var(--text-secondary)]">Drop Postman or OpenAPI/Swagger file(s) here</div>
                    <div className="text-xs text-[var(--text-muted)]">or click to browse — .json, .yaml, .yml — multiple files supported</div>
                    <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml" multiple
                      className="hidden" onChange={(e) => e.target.files.length && handleFiles(e.target.files)} />
                  </div>
                ) : (
                  <>
                    <div className="flex gap-1">
                      {[['postman', 'Postman Collection'], ['openapi', 'OpenAPI / Swagger']].map(([v, label]) => (
                        <button key={v} onClick={() => setPasteFormat(v)}
                          className={`px-3 py-1.5 rounded text-xs ${pasteFormat === v ? 'bg-[var(--accent-bg-soft)] text-[var(--accent-text)] border border-[var(--accent-border-soft)]' : 'text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text-secondary)]'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)}
                      placeholder={pasteFormat === 'postman'
                        ? 'Paste the exported Postman collection JSON here ({"info": {...}, "item": [...]})'
                        : 'Paste an OpenAPI 3.x / Swagger 2.0 spec here (JSON or YAML)'}
                      className="flex-1 min-h-[220px] bg-[var(--bg-surface-2)] border border-[var(--border)] rounded p-3 text-xs font-mono outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]" />
                  </>
                )}

                {(importFilesMut.isError || pasteImportMut.isError) && (
                  <div className="text-xs text-[var(--danger-text)]">Import failed</div>
                )}
                {importMode === 'paste' && (
                  <Button onClick={() => pasteImportMut.mutate()} disabled={!pasteText.trim() || pasteImportMut.isPending}>
                    {pasteImportMut.isPending ? 'Importing…' : 'Import'}
                  </Button>
                )}
                {importFilesMut.isPending && <div className="text-xs text-[var(--text-secondary)]">Importing…</div>}
              </>
            )}
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
