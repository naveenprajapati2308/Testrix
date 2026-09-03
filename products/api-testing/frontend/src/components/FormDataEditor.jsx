import { useRef, useState } from 'react';
import { Trash2, Plus, Upload, FileText, X } from 'lucide-react';
import { apiClient } from '../api/client.js';

/**
 * Same row model as KeyValueEditor, plus a Text/File toggle per row (matches
 * Postman's form-data body editor). File rows upload immediately on pick —
 * the row only ever holds {fileId, fileName}, never the raw File object, so
 * a saved request needs no re-selection to run manually, and can run
 * unattended (scheduled) since the bytes are already stored server-side.
 */
export default function FormDataEditor({ items, onChange }) {
  const [uploadingIdx, setUploadingIdx] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);
  const pendingIdxRef = useRef(null);

  const update = (idx, field, value) => {
    const next = items.map((it, i) => (i === idx ? { ...it, [field]: value } : it));
    onChange(next);
  };

  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, { key: '', value: '', enabled: true, type: 'TEXT', fileId: '', fileName: '', required: false }]);

  const allRequired = items.length > 0 && items.every((it) => it.required);
  const toggleAllRequired = (checked) => onChange(items.map((it) => ({ ...it, required: checked })));

  const setType = (idx, type) => {
    const next = items.map((it, i) => (i === idx ? { ...it, type, value: '', fileId: '', fileName: '' } : it));
    onChange(next);
  };

  const pickFile = (idx) => {
    pendingIdxRef.current = idx;
    fileInputRef.current?.click();
  };

  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    const idx = pendingIdxRef.current;
    e.target.value = '';
    if (!file || idx == null) return;

    setUploadError('');
    setUploadingIdx(idx);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await apiClient.post('/v1/form-data-files', form);
      update(idx, 'fileId', data.fileId);
      update(idx, 'fileName', data.fileName);
    } catch (err) {
      setUploadError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploadingIdx(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />
      <div className="flex flex-col divide-y divide-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden">
        {items.length > 0 && (
          <div className="flex items-center justify-end bg-[var(--bg-surface-1)] px-2 py-1">
            <label className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] cursor-pointer" title="Mark all rows as required / not required">
              <input
                type="checkbox"
                checked={allRequired}
                onChange={(e) => toggleAllRequired(e.target.checked)}
                className="accent-[var(--warning-text)]"
              />
              All Req
            </label>
          </div>
        )}
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center bg-[var(--bg-surface-2)]">
            <input
              type="checkbox"
              checked={item.enabled}
              onChange={(e) => update(idx, 'enabled', e.target.checked)}
              className="mx-3 accent-[var(--accent)]"
            />
            <input
              value={item.key}
              onChange={(e) => update(idx, 'key', e.target.value)}
              placeholder="Key"
              className="flex-1 bg-transparent px-2 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none border-l border-[var(--border)]"
            />
            <div className="flex border-l border-[var(--border)]">
              <button
                onClick={() => setType(idx, 'TEXT')}
                className={`px-2 py-2 text-[11px] ${item.type !== 'FILE' ? 'text-[var(--accent-text)] bg-[var(--accent-bg-soft)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                Text
              </button>
              <button
                onClick={() => setType(idx, 'FILE')}
                className={`px-2 py-2 text-[11px] ${item.type === 'FILE' ? 'text-[var(--accent-text)] bg-[var(--accent-bg-soft)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                File
              </button>
            </div>
            {item.type === 'FILE' ? (
              <div className="flex-1 flex items-center gap-2 px-2 py-1.5 border-l border-[var(--border)]">
                <button
                  onClick={() => pickFile(idx)}
                  disabled={uploadingIdx === idx}
                  className="flex items-center gap-1.5 rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-50">
                  <Upload size={12} /> {uploadingIdx === idx ? 'Uploading…' : 'Choose file'}
                </button>
                {item.fileName && (
                  <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)] truncate">
                    <FileText size={12} /> {item.fileName}
                    {!item.fileId && <span className="text-[var(--danger-text)]"> (reattach)</span>}
                  </span>
                )}
              </div>
            ) : (
              <input
                value={item.value}
                onChange={(e) => update(idx, 'value', e.target.value)}
                placeholder="Value"
                className="flex-1 bg-transparent px-2 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none border-l border-[var(--border)]"
              />
            )}
            <label className="flex items-center gap-1 px-2 border-l border-[var(--border)] text-[10px] text-[var(--text-muted)] cursor-pointer" title="Required by business logic — used by Validation Check">
              <input
                type="checkbox"
                checked={!!item.required}
                onChange={(e) => update(idx, 'required', e.target.checked)}
                className="accent-[var(--warning-text)]"
              />
              Req
            </label>
            <button onClick={() => remove(idx)} className="px-3 text-[var(--text-muted)] hover:text-[var(--danger-text)]" title="Remove">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          onClick={add}
          className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--accent-text)] hover:bg-[var(--bg-hover)]"
        >
          <Plus size={14} /> Add new
        </button>
      </div>
      {uploadError && (
        <span className="flex items-center gap-1 text-xs text-[var(--danger-text)]">
          <X size={12} /> {uploadError}
        </span>
      )}
    </div>
  );
}
