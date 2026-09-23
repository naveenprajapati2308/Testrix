import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Upload, Trash2, Download, Table2, AlertTriangle } from 'lucide-react';
import { api, downloadFile } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';

const MAX_SIZE_MB = 20;
const IN_PROGRESS = ['UPLOADED', 'PROCESSING'];

export default function Documents() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setDocuments(await api.get('/documents'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Generation runs in the background, so anything still working is re-polled for progress.
  // The current list is read through a ref so the interval isn't torn down and recreated on
  // every tick's state update.
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const hasActive = documents.some((d) => IN_PROGRESS.includes(d.status));

  useEffect(() => {
    if (!hasActive) return undefined;
    const timer = setInterval(async () => {
      const active = documentsRef.current.filter((d) => IN_PROGRESS.includes(d.status));
      const updates = await Promise.all(
        active.map((d) => api.get(`/documents/${d.id}`).catch(() => null)),
      );
      setDocuments((prev) => prev.map((doc) => updates.find((u) => u && u.id === doc.id) || doc));
    }, 2000);
    return () => clearInterval(timer);
  }, [hasActive]);

  const selectFile = (selected) => {
    setError(null);
    if (!selected) return;
    const name = selected.name.toLowerCase();
    if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
      setError('Unsupported file type. Upload a PDF (.pdf) or Word (.docx) document.');
      return;
    }
    if (selected.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File exceeds the ${MAX_SIZE_MB} MB limit.`);
      return;
    }
    setFile(selected);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const created = await api.post('/documents', form);
      setDocuments((prev) => [created, ...prev]);
      setFile(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  // Embedded, the shell owns the route: driving its hash keeps the sidebar's highlighted item in
  // step with what is on screen, and the shell navigates this iframe back. The chosen document is
  // carried in sessionStorage because the shell's route has no place for a query parameter.
  const openTestCases = (documentId) => {
    try {
      sessionStorage.setItem('testgen:documentId', String(documentId));
    } catch {
      // Private mode or blocked storage — the Test Cases page just opens unfiltered.
    }
    if (window.self !== window.top) {
      window.top.location.hash = '#/testgen/test-cases';
    } else {
      navigate(`/test-cases?documentId=${documentId}`);
    }
  };

  const remove = async (doc) => {
    if (!window.confirm(`Delete "${doc.fileName}" and its generated test cases?`)) return;
    try {
      await api.delete(`/documents/${doc.id}`);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Test Case Generation</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Upload an SRS or requirements document and Testrix generates reviewable test cases from it.
        </p>
      </header>

      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)]">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); selectFile(e.dataTransfer.files?.[0]); }}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-[var(--radius-lg)] border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-[var(--accent)] bg-[var(--accent-bg-soft)]'
              : 'border-[var(--border-strong)] hover:border-[var(--accent)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={(e) => selectFile(e.target.files?.[0])}
          />
          <FileText size={28} className="mx-auto text-[var(--accent-text)]" />
          {file ? (
            <>
              <p className="mt-3 font-semibold text-sm">{file.name}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {(file.size / (1024 * 1024)).toFixed(2)} MB — ready to generate
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 font-semibold text-sm">
                Drop your document here, or <span className="text-[var(--accent-text)]">browse</span>
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                PDF (.pdf) and Word (.docx), up to {MAX_SIZE_MB} MB
              </p>
            </>
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-border-soft)] bg-[var(--danger-bg-soft)] px-3 py-2 text-sm text-[var(--danger-text)]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {file && !uploading && (
            <button
              onClick={() => setFile(null)}
              className="px-4 py-2 rounded-[var(--radius-sm)] border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            >
              Clear
            </button>
          )}
          <button
            onClick={upload}
            disabled={!file || uploading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload size={15} />
            {uploading ? 'Uploading…' : 'Generate Test Cases'}
          </button>
        </div>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] overflow-hidden">
        <h2 className="px-5 py-3 border-b border-[var(--border)] text-sm font-semibold">Documents</h2>

        {loading ? (
          <p className="px-5 py-8 text-sm text-[var(--text-muted)]">Loading…</p>
        ) : documents.length === 0 ? (
          <p className="px-5 py-10 text-sm text-[var(--text-muted)] text-center">
            No documents yet. Upload one above to generate your first test cases.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-soft)]">
            {documents.map((doc) => (
              <li key={doc.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-[var(--bg-hover)]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{doc.fileName}</span>
                    <StatusBadge status={doc.status} />
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {doc.status === 'COMPLETED'
                      ? `${doc.totalTestCases} test cases from ${doc.totalChunks} sections`
                      : doc.status === 'FAILED'
                        ? doc.errorMessage || 'Generation failed'
                        : 'Generating…'}
                  </p>
                  {IN_PROGRESS.includes(doc.status) && (
                    <Progress processed={doc.processedChunks} total={doc.totalChunks} />
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {doc.status === 'COMPLETED' && (
                    <IconButton label="Open test cases" onClick={() => openTestCases(doc.id)}>
                      <Table2 size={15} />
                    </IconButton>
                  )}
                  <IconButton
                    label="Download original"
                    onClick={() => downloadFile(`/documents/${doc.id}/file`, doc.fileName)}
                  >
                    <Download size={15} />
                  </IconButton>
                  <IconButton label="Delete" danger onClick={() => remove(doc)}>
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Real progress from the generation run, not a timed animation — total is 0 until the
 *  document has been chunked, so that first moment shows an indeterminate state instead of 0%. */
function Progress({ processed, total }) {
  const known = total > 0;
  const percent = known ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="mt-2 max-w-sm">
      <div className="h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
        <div
          className={`h-full bg-[var(--accent)] transition-[width] duration-500 ${known ? '' : 'animate-pulse'}`}
          style={{ width: known ? `${percent}%` : '30%' }}
        />
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mt-1">
        {known ? `${processed} of ${total} sections analysed` : 'Reading document…'}
      </p>
    </div>
  );
}

function IconButton({ children, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`p-2 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-surface-2)] ${
        danger ? 'hover:text-[var(--danger-text)]' : 'hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  );
}
