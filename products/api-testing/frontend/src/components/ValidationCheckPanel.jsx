import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';
import { apiClient } from '../api/client.js';

/**
 * "Business Validation Check" — on-demand only, never runs as part of a schedule.
 * Strips every field flagged Required on this saved request, runs that one variant,
 * and shows which of those fields the backend actually complained about missing.
 */
export default function ValidationCheckPanel({ baseUrl }) {
  const qc = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const queryKey = ['validation-checks', baseUrl];

  const { data: history = [] } = useQuery({
    queryKey,
    queryFn: async () => (await apiClient.get(`${baseUrl}/validation-checks`)).data,
    enabled: !!baseUrl,
  });

  const runMut = useMutation({
    mutationFn: async () => (await apiClient.post(`${baseUrl}/validation-check`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  if (!baseUrl) return null;

  const latest = runMut.data ?? history[0];
  const older = history.slice(latest === history[0] ? 1 : 0);

  return (
    <div className="border border-[var(--border)] rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-surface-2)]">
        <ShieldCheck size={13} className="text-[var(--accent-text)]" />
        <span className="text-xs font-semibold text-[var(--text-secondary)]">Business Validation Check</span>
        <span className="text-[10px] text-[var(--text-muted)]">(manual only — never scheduled)</span>
        <button onClick={() => runMut.mutate()} disabled={runMut.isPending}
          className="ml-auto flex items-center gap-1.5 rounded border border-[var(--accent-border-soft)] text-[var(--accent-text)] hover:bg-[var(--accent-bg-soft)] disabled:opacity-40 px-2.5 py-1 text-[11px] font-semibold">
          {runMut.isPending ? 'Running…' : 'Run Validation Check'}
        </button>
      </div>

      {runMut.isError && (
        <div className="px-3 py-2 text-xs text-[var(--danger-text)] bg-[var(--danger-bg-soft)]">
          {runMut.error?.response?.data?.message ?? 'Check failed'}
        </div>
      )}

      {latest && (
        <div className="px-3 py-2 flex flex-col gap-2">
          <div className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
            {latest.enforcedCount === latest.totalRequired
              ? <ShieldCheck size={12} className="text-[var(--success-text)]" />
              : <ShieldAlert size={12} className="text-[var(--danger-text)]" />}
            <span>
              {latest.enforcedCount}/{latest.totalRequired} required fields enforced by backend
            </span>
            {latest.createdAt && (
              <span className="text-[var(--text-muted)]">· {new Date(latest.createdAt).toLocaleString()}</span>
            )}
          </div>
          <div className="border border-[var(--border)] rounded divide-y divide-[var(--border-soft)]">
            {(latest.fields ?? []).map((f, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                <span className="font-mono text-[var(--text-primary)] flex-1 truncate">{f.key}</span>
                <span className="text-[var(--text-muted)]">{f.source}</span>
                {f.enforced
                  ? <span className="text-[var(--success-text)] font-semibold">Enforced ✓</span>
                  : <span className="text-[var(--danger-text)] font-semibold">NOT enforced ✗</span>}
              </div>
            ))}
          </div>

          {older.length > 0 && (
            <button onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] self-start">
              {showHistory ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {showHistory ? 'Hide' : 'Show'} {older.length} earlier check{older.length > 1 ? 's' : ''}
            </button>
          )}
          {showHistory && (
            <div className="flex flex-col gap-1.5">
              {older.map((run) => (
                <div key={run.id} className="text-[11px] text-[var(--text-muted)] flex items-center gap-2 px-1">
                  <span>{new Date(run.createdAt).toLocaleString()}</span>
                  <span className={run.enforcedCount === run.totalRequired ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]'}>
                    {run.enforcedCount}/{run.totalRequired} enforced
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!latest && (
        <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
          No checks run yet. Mark a field "Req" on Headers/Params/form-data/payload above, then click Run.
        </div>
      )}
    </div>
  );
}
