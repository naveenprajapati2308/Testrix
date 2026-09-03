import { Trash2, Plus } from 'lucide-react';

export default function KeyValueEditor({ items, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value', showRequired = false }) {
  const update = (idx, field, value) => {
    const next = items.map((it, i) => (i === idx ? { ...it, [field]: value } : it));
    onChange(next);
  };

  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, showRequired ? { key: '', value: '', enabled: true, required: false } : { key: '', value: '', enabled: true }]);

  const allRequired = showRequired && items.length > 0 && items.every((it) => it.required);
  const toggleAllRequired = (checked) => onChange(items.map((it) => ({ ...it, required: checked })));

  return (
    <div className="flex flex-col divide-y divide-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden">
      {showRequired && items.length > 0 && (
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
            title="Enabled — included when this request runs"
          />
          <input
            value={item.key}
            onChange={(e) => update(idx, 'key', e.target.value)}
            placeholder={keyPlaceholder}
            className="flex-1 bg-transparent px-2 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none border-l border-[var(--border)]"
          />
          <input
            value={item.value}
            onChange={(e) => update(idx, 'value', e.target.value)}
            placeholder={valuePlaceholder}
            className="flex-1 bg-transparent px-2 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none border-l border-[var(--border)]"
          />
          {showRequired && (
            <label className="flex items-center gap-1 px-2 border-l border-[var(--border)] text-[10px] text-[var(--text-muted)] cursor-pointer" title="Required by business logic — used by Validation Check">
              <input
                type="checkbox"
                checked={!!item.required}
                onChange={(e) => update(idx, 'required', e.target.checked)}
                className="accent-[var(--warning-text)]"
              />
              Req
            </label>
          )}
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
  );
}
