import { useEffect, useRef, useState } from 'react';
import { X, Upload, AlertTriangle } from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useViewportBounds } from '../../../../../shared/ui/useViewportBounds.js';
import { lockParentScroll } from '../../../../../shared/ui/iframe-scroll-lock.js';

/**
 * Excel round-trip: export, edit in Excel or Sheets, upload the file back. Rows are matched on
 * Code, so reordering or filtering in Excel is safe. Nothing is written until the diff below is
 * confirmed — the same comparison runs for preview and for apply.
 */
export default function ImportDialog({ documentId, onClose, onApplied }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const bounds = useViewportBounds();

  useEffect(() => lockParentScroll(), []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async (apply) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const query = new URLSearchParams({ apply: String(apply) });
      if (documentId) query.set('documentId', documentId);
      const result = await apiClient.post(`/test-cases/import?${query}`, form);
      if (apply) onApplied();
      else setPreview(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const overlayStyle = bounds
    ? { position: 'fixed', left: 0, right: 0, top: bounds.top, height: bounds.height }
    : { position: 'fixed', inset: 0 };

  return (
    <div
      className="z-50 flex items-center justify-center bg-black/60 p-4"
      style={overlayStyle}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl max-h-full flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-card-hover)]">
        <header className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold">Import from Excel</h2>
          <button onClick={onClose} aria-label="Close"
            className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
            <X size={16} />
          </button>
        </header>

        <div className="p-5 space-y-4 overflow-auto">
          <div
            onClick={() => inputRef.current?.click()}
            className="rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--border-strong)] px-5 py-7 text-center cursor-pointer hover:border-[var(--accent)] hover:bg-[var(--bg-hover)]"
          >
            <input ref={inputRef} type="file" accept=".xlsx" className="hidden"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} />
            <Upload size={22} className="mx-auto text-[var(--accent-text)]" />
            <p className="mt-2 text-sm font-medium">{file ? file.name : 'Choose the edited .xlsx file'}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Export first, edit in Excel or Google Sheets, then upload it here.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-border-soft)] bg-[var(--danger-bg-soft)] px-3 py-2 text-sm text-[var(--danger-text)]">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <Pill tone="accent">{preview.changed.length} to update</Pill>
                <Pill>{preview.unchanged} unchanged</Pill>
                {preview.unmatchedCodes.length > 0 && (
                  <Pill tone="danger">{preview.unmatchedCodes.length} unmatched</Pill>
                )}
              </div>

              {preview.unmatchedCodes.length > 0 && (
                <p className="text-xs text-[var(--text-muted)]">
                  Not found and skipped: {preview.unmatchedCodes.join(', ')}
                </p>
              )}

              {preview.changed.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Nothing to apply — the spreadsheet matches what is already stored.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border-soft)] rounded-[var(--radius-sm)] border border-[var(--border)]">
                  {preview.changed.map((row) => (
                    <li key={row.code} className="px-3 py-2.5">
                      <p className="text-xs font-semibold">
                        {row.code} <span className="font-normal text-[var(--text-muted)]">{row.title}</span>
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {row.changes.map((change) => (
                          <li key={change.field} className="text-[11px] leading-relaxed">
                            <span className="text-[var(--text-muted)]">{change.field}: </span>
                            <span className="line-through text-[var(--danger-text)] break-all">
                              {truncate(change.oldValue)}
                            </span>
                            <span className="mx-1 text-[var(--text-muted)]">→</span>
                            <span className="text-[var(--success-text)] break-all">
                              {truncate(change.newValue)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
          <button onClick={onClose}
            className="px-4 py-2 rounded-[var(--radius-sm)] border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
            Cancel
          </button>
          {!preview ? (
            <button onClick={() => send(false)} disabled={!file || busy}
              className="px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50">
              {busy ? 'Checking…' : 'Preview changes'}
            </button>
          ) : (
            <button onClick={() => send(true)} disabled={busy || preview.changed.length === 0}
              className="px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50">
              {busy ? 'Applying…' : `Apply ${preview.changed.length} change${preview.changed.length === 1 ? '' : 's'}`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function Pill({ children, tone }) {
  const map = {
    accent: ['--accent-bg-soft', '--accent-text', '--accent-border-soft'],
    danger: ['--danger-bg-soft', '--danger-text', '--danger-border-soft'],
  };
  const [bg, text, border] = map[tone] || ['--bg-hover', '--text-muted', '--border'];
  return (
    <span className="px-2 py-0.5 rounded-full border font-semibold"
      style={{ background: `var(${bg})`, color: `var(${text})`, borderColor: `var(${border})` }}>
      {children}
    </span>
  );
}

function truncate(value) {
  if (!value) return '(empty)';
  return value.length > 80 ? `${value.slice(0, 80)}…` : value;
}
