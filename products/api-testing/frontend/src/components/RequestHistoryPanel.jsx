import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, X, ChevronUp, ChevronDown, History as HistoryIcon, RefreshCw } from 'lucide-react';
import { apiClient } from '../api/client.js';
import { ModalOverlay } from './ModalOverlay.jsx';
import { Loader } from '../../../../../shared/ui/Loader.jsx';

const CLASS_STATUS_COLOR = (statusClass) =>
  statusClass === '2xx' || statusClass === '3xx' ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]';

export default function RequestHistoryPanel({ requestId }) {
  const [collapsed, setCollapsed] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const { data, isFetching, isLoading, refetch } = useQuery({
    queryKey: ['collection-request-history', requestId],
    queryFn: async () => (await apiClient.get('/v1/history', {
      params: { apiType: 'COLLECTION', apiId: requestId, size: 25 },
    })).data,
    enabled: !!requestId,
  });

  const { data: detail } = useQuery({
    queryKey: ['history-detail', detailId],
    queryFn: async () => (await apiClient.get(`/v1/history/${detailId}`)).data,
    enabled: !!detailId,
  });

  const records = data?.content ?? [];

  if (!requestId) {
    return (
      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs text-[var(--text-muted)] flex items-center gap-2">
        <HistoryIcon size={13} /> Save this request to start tracking its history here.
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-surface)] flex flex-col" style={{ maxHeight: collapsed ? 'auto' : 240 }}>
      <div className="flex items-center gap-2">
        <button onClick={() => setCollapsed(!collapsed)}
          className="flex-1 flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider hover:text-[var(--text-primary)]">
          <HistoryIcon size={13} />
          History for this API ({records.length})
          {collapsed ? <ChevronUp size={13} className="ml-auto" /> : <ChevronDown size={13} className="ml-auto" />}
        </button>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          title="Refresh history"
          className="mr-3 text-[var(--text-muted)] hover:text-[var(--text-secondary)] disabled:opacity-50">
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {!collapsed && (
        <div className="overflow-auto border-t border-[var(--border-soft)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--text-muted)] border-b border-[var(--border-soft)] sticky top-0 bg-[var(--bg-surface)]">
                <th className="text-left px-4 py-1.5 font-medium">Time</th>
                <th className="text-left px-4 py-1.5 font-medium">Method</th>
                <th className="text-left px-4 py-1.5 font-medium">Status</th>
                <th className="text-left px-4 py-1.5 font-medium">Duration</th>
                <th className="text-left px-4 py-1.5 font-medium">Size</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-4"><div className="flex justify-center"><Loader size={18} /></div></td></tr>
              ) : (<>
              {records.map((r) => (
                <tr key={r.id} onClick={() => setDetailId(r.id)}
                  className="border-b border-[var(--border-soft)] hover:bg-[var(--bg-hover)] cursor-pointer">
                  <td className="px-4 py-1.5 text-[var(--text-muted)]">{new Date(r.executedAt).toLocaleString()}</td>
                  <td className="px-4 py-1.5 font-semibold text-[var(--text-secondary)]">{r.requestMethod}</td>
                  <td className="px-4 py-1.5">
                    {r.responseStatusCode
                      ? <span className={`inline-flex items-center gap-1 ${CLASS_STATUS_COLOR(r.responseStatusClass)}`}>
                        {r.responseStatusClass === '2xx' || r.responseStatusClass === '3xx' ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                        {r.responseStatusCode}
                      </span>
                      : <span className="inline-flex items-center gap-1 text-[var(--danger-text)]"><XCircle size={11} /> {r.responseStatusClass}</span>}
                  </td>
                  <td className="px-4 py-1.5 text-[var(--text-secondary)] tabular-nums">{r.totalTimeMs} ms</td>
                  <td className="px-4 py-1.5 text-[var(--text-muted)] tabular-nums">{fmtSize(r.responseSizeBytes)}</td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-4 text-center text-[var(--text-muted)]">No runs yet</td></tr>
              )}
              </>)}
            </tbody>
          </table>
        </div>
      )}

      {detailId && (
        <ModalOverlay onClose={() => setDetailId(null)} align="end">
          <div className="w-[520px] h-full bg-[var(--bg-surface)] border-l border-[var(--border)] flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold">Run #{detailId}</h2>
              <button onClick={() => setDetailId(null)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"><X size={16} /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-5 flex flex-col gap-4">
              {detail ? (
                <>
                  <Section title="Request">
                    <Row k="Method / URL" v={`${detail.execution.requestMethod} ${detail.execution.requestUrl}`} mono />
                    <Row k="Headers (secrets masked)" v={prettyJson(detail.execution.requestHeaders)} mono pre />
                    {detail.execution.requestBody && <Row k="Body" v={detail.execution.requestBody} mono pre />}
                  </Section>
                  <Section title="Response">
                    <Row k="Status" v={`${detail.execution.responseStatusCode ?? '—'} (${detail.execution.responseStatusClass})`} />
                    {detail.execution.errorMessage && <Row k="Error" v={detail.execution.errorMessage} />}
                    {detail.responseBody && <Row k="Body" v={prettyJson(detail.responseBody)} mono pre maxH />}
                  </Section>
                  <Section title="Timing">
                    <div className="flex gap-4 text-xs">
                      <TimingCell label="TTFB" value={detail.execution.ttfbMs} />
                      <TimingCell label="Total" value={detail.execution.totalTimeMs} strong />
                    </div>
                  </Section>
                </>
              ) : <div className="py-6 flex justify-center"><Loader size={28} label="Loading…" /></div>}
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="border border-[var(--border)] rounded-lg p-3">
      <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">{title}</div>
      {children}
    </div>
  );
}

function Row({ k, v, mono, pre, maxH }) {
  return (
    <div className="mb-2">
      <div className="text-[10px] text-[var(--text-muted)] uppercase">{k}</div>
      {pre
        ? <pre className={`text-xs text-[var(--text-secondary)] bg-[var(--bg-surface-2)] rounded p-2 overflow-auto ${maxH ? 'max-h-64' : 'max-h-40'}`}>{v}</pre>
        : <div className={`text-xs text-[var(--text-secondary)] break-all ${mono ? 'font-mono' : ''}`}>{v}</div>}
    </div>
  );
}

function TimingCell({ label, value, strong }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-[var(--text-muted)] uppercase">{label}</span>
      <span className={`tabular-nums ${strong ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)]'}`}>
        {value == null ? '—' : `${value} ms`}
      </span>
    </div>
  );
}

function prettyJson(s) {
  if (!s) return s;
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function fmtSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
