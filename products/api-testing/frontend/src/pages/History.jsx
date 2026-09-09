import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, X, Layers, Loader2, AlertTriangle, ChevronRight } from 'lucide-react';
import { apiClient } from '../api/client.js';
import { flattenModules } from './BaseApis.jsx';
import { STATUS_BADGE, CLASS_COLORS, methodColor } from '../lib/statusColors.js';
import { Loader } from '../../../../../shared/ui/Loader.jsx';
import { Pagination } from '../components/Pagination.jsx';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

const inputCls = 'bg-[var(--bg-surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]';

export default function History() {
  const [view, setView] = useState('executions'); // executions | groupRuns
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState({ apiType: '', status: '', moduleId: '', method: '', from: '', to: '', groupExecutionId: '' });
  const [detailId, setDetailId] = useState(null);
  const [groupRunPage, setGroupRunPage] = useState(0);
  const [groupRunPageSize, setGroupRunPageSize] = useState(10);

  const { data, isLoading: historyLoading } = useQuery({
    queryKey: ['history', page, pageSize, filters],
    queryFn: async () => (await apiClient.get('/v1/history', {
      params: {
        page, size: pageSize,
        apiType: filters.apiType || undefined,
        status: filters.status || undefined,
        moduleId: filters.moduleId || undefined,
        method: filters.method || undefined,
        groupExecutionId: filters.groupExecutionId || undefined,
        from: filters.from ? new Date(filters.from).toISOString() : undefined,
        to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : undefined,
      },
    })).data,
    refetchInterval: 10000,
  });

  const { data: modules = [] } = useQuery({
    queryKey: ['modules'],
    queryFn: async () => (await apiClient.get('/v1/modules')).data,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => (await apiClient.get('/v1/groups')).data,
  });

  const { data: groupRuns, isLoading: groupRunsLoading } = useQuery({
    queryKey: ['group-runs', groupRunPage, groupRunPageSize],
    queryFn: async () => (await apiClient.get('/v1/groups/executions', { params: { page: groupRunPage, size: groupRunPageSize } })).data,
    enabled: view === 'groupRuns',
    refetchInterval: 10000,
  });

  const { data: detail } = useQuery({
    queryKey: ['history-detail', detailId],
    queryFn: async () => (await apiClient.get(`/v1/history/${detailId}`)).data,
    enabled: !!detailId,
  });

  const records = data?.content ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalRecords = data?.totalElements ?? 0;
  const flatModules = flattenModules(modules);
  const groupName = (id) => groups.find((g) => g.group.id === id)?.group.name ?? `#${id}`;
  const setFilter = (patch) => { setFilters({ ...filters, ...patch }); setPage(0); };

  // Clicking a group run drills into its executions in the main table.
  const openGroupRun = (runId) => {
    setFilters({ apiType: '', status: '', moduleId: '', method: '', from: '', to: '', groupExecutionId: String(runId) });
    setPage(0);
    setView('executions');
  };

  return (
    <div className="flex-1 overflow-auto p-6 flex flex-col gap-4">
      <div className="flex items-end gap-4 flex-wrap">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Execution History</h1>
          <p className="text-xs text-[var(--text-muted)]">The testing record: request sent, response received, timing, validation</p>
        </div>
        <div className="flex rounded-md border border-[var(--border)] overflow-hidden text-xs">
          <button onClick={() => setView('executions')}
            className={`px-3 py-1.5 ${view === 'executions' ? 'bg-[var(--accent-bg-soft)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
            Executions
          </button>
          <button onClick={() => setView('groupRuns')}
            className={`px-3 py-1.5 flex items-center gap-1.5 ${view === 'groupRuns' ? 'bg-[var(--accent-bg-soft)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
            <Layers size={12} /> Group Runs
          </button>
        </div>
        {view === 'executions' && (<>
        <select value={filters.apiType} onChange={(e) => setFilter({ apiType: e.target.value })} className={inputCls}>
          <option value="">All types</option>
          <option value="BASE">Base APIs</option>
          <option value="REGULAR">Regular APIs</option>
        </select>
        <select value={filters.method} onChange={(e) => setFilter({ method: e.target.value })} className={inputCls}>
          <option value="">All methods</option>
          {METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })} className={inputCls}>
          <option value="">All statuses</option>
          {['2xx', '3xx', '4xx', '5xx', 'ERROR', 'TIMEOUT'].map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={filters.moduleId} onChange={(e) => setFilter({ moduleId: e.target.value })} className={inputCls}>
          <option value="">All modules</option>
          {flatModules.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          From <input type="date" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} className={inputCls} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          To <input type="date" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} className={inputCls} />
        </label>
        </>)}
      </div>

      {filters.groupExecutionId && view === 'executions' && (
        <div className="flex items-center gap-2 text-xs text-[var(--accent-text)]">
          <Layers size={12} /> Showing executions of group run #{filters.groupExecutionId}
          <button onClick={() => setFilter({ groupExecutionId: '' })} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"><X size={13} /></button>
        </div>
      )}

      {view === 'groupRuns' && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
                <th className="text-left px-4 py-2.5 font-medium">Run</th>
                <th className="text-left px-4 py-2.5 font-medium">Group</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 font-medium">Health</th>
                <th className="text-left px-4 py-2.5 font-medium">Passed / Failed</th>
                <th className="text-left px-4 py-2.5 font-medium">Trigger</th>
                <th className="text-left px-4 py-2.5 font-medium">Started</th>
                <th className="text-left px-4 py-2.5 font-medium">Finished</th>
              </tr>
            </thead>
            <tbody>
              {groupRunsLoading ? (
                <tr><td colSpan={8} className="px-4 py-8"><div className="flex justify-center"><Loader size={22} /></div></td></tr>
              ) : (<>
              {(groupRuns?.content ?? []).map((r) => (
                <tr key={r.id} onClick={() => openGroupRun(r.id)}
                  className="border-b border-[var(--border-soft)] hover:bg-[var(--bg-hover)] cursor-pointer">
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">#{r.id}</td>
                  <td className="px-4 py-2.5 text-[var(--text-primary)] flex items-center gap-1.5"><Layers size={11} className="text-[var(--accent-text)]" /> {groupName(r.groupId)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 ${STATUS_BADGE[r.status] ?? 'bg-[var(--bg-surface-2)] text-[var(--text-muted)]'}`}>
                      {r.status === 'RUNNING' && <Loader2 size={10} className="animate-spin" />}{r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold text-[var(--text-secondary)]">{r.healthPercent != null ? `${r.healthPercent}%` : '—'}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    <span className="text-[var(--success-text)]">{r.passedApis}</span>
                    <span className="text-[var(--text-muted)]"> / </span>
                    <span className="text-[var(--danger-text)]">{r.failedApis}</span>
                    <span className="text-[var(--text-muted)]"> of {r.totalApis}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">{r.triggeredBy}</td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">{new Date(r.startedAt).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">{r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
              {(groupRuns?.content ?? []).length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-[var(--text-muted)]">No group runs yet — execute a group from the Scheduler tab</td></tr>
              )}
              </>)}
            </tbody>
          </table>
          <div className="px-4">
            <Pagination page={groupRunPage + 1} pageSize={groupRunPageSize} totalRecords={groupRuns?.totalElements ?? 0}
              onPageChange={(p) => setGroupRunPage(p - 1)}
              onPageSizeChange={(n) => { setGroupRunPageSize(n); setGroupRunPage(0); }} />
          </div>
        </div>
      )}

      {view === 'executions' && (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
              <th className="text-left px-4 py-2.5 font-medium">API</th>
              <th className="text-left px-4 py-2.5 font-medium">Type</th>
              <th className="text-left px-4 py-2.5 font-medium">Method</th>
              <th className="text-left px-4 py-2.5 font-medium">URL</th>
              <th className="text-left px-4 py-2.5 font-medium">Status</th>
              <th className="text-left px-4 py-2.5 font-medium">Valid.</th>
              <th className="text-left px-4 py-2.5 font-medium">Time</th>
              <th className="text-left px-4 py-2.5 font-medium">Trigger</th>
              <th className="text-left px-4 py-2.5 font-medium">Executed At</th>
            </tr>
          </thead>
          <tbody>
            {historyLoading ? (
              <tr><td colSpan={9} className="px-4 py-8"><div className="flex justify-center"><Loader size={22} /></div></td></tr>
            ) : (<>
            {records.map((r) => (
              <Fragment key={r.id}>
              <tr onClick={() => setDetailId(detailId === r.id ? null : r.id)}
                className={`border-b border-[var(--border-soft)] hover:bg-[var(--bg-hover)] cursor-pointer ${detailId === r.id ? 'bg-[var(--bg-hover)]' : ''}`}>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                  <span className="flex items-center gap-1.5">
                    <ChevronRight size={12} className={`shrink-0 text-[var(--text-muted)] transition-transform ${detailId === r.id ? 'rotate-90' : ''}`} />
                    {r.apiName ?? <span className="text-[var(--text-muted)]">ad-hoc</span>}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[var(--text-muted)]">{r.apiType}</td>
                <td className={`px-4 py-2.5 font-semibold ${methodColor(r.requestMethod)}`}>{r.requestMethod}</td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)] max-w-xs truncate" title={r.requestUrl}>{r.requestUrl}</td>
                <td className={`px-4 py-2.5 font-semibold ${CLASS_COLORS[r.responseStatusClass] ?? 'text-[var(--text-secondary)]'}`}>
                  {r.responseStatusCode ?? r.responseStatusClass}
                </td>
                <td className="px-4 py-2.5">
                  {r.validationPassed == null ? <span className="text-[var(--text-muted)]">—</span>
                    : r.validationPassed
                      ? <CheckCircle2 size={13} className="text-[var(--success-text)]" />
                      : <XCircle size={13} className="text-[var(--danger-text)]" />}
                </td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums">{r.totalTimeMs} ms</td>
                <td className="px-4 py-2.5">
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    r.triggeredBy === 'SCHEDULE' ? 'bg-[var(--info-text)]/15 text-[var(--info-text)]'
                      : r.triggeredBy === 'CHAIN_DEPENDENCY' ? 'bg-[var(--indigo-text)]/15 text-[var(--indigo-text)]'
                        : 'bg-[var(--bg-surface-2)] text-[var(--text-muted)]'
                  }`}>{r.triggeredBy === 'CHAIN_DEPENDENCY' ? 'CHAIN' : r.triggeredBy}</span>
                </td>
                <td className="px-4 py-2.5 text-[var(--text-muted)]">{new Date(r.executedAt).toLocaleString()}</td>
              </tr>
              {detailId === r.id && (
                <tr className="border-b border-[var(--border-soft)]">
                  <td colSpan={9} className="p-0"><ExecutionExpand detail={detail} /></td>
                </tr>
              )}
              </Fragment>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-[var(--text-muted)]">No executions match</td></tr>
            )}
            </>)}
          </tbody>
        </table>
      </div>
      )}

      {view === 'executions' && (
        <Pagination page={page + 1} pageSize={pageSize} totalRecords={totalRecords}
          onPageChange={(p) => setPage(p - 1)}
          onPageSizeChange={(n) => { setPageSize(n); setPage(0); }} />
      )}

    </div>
  );
}

/** Inline expansion for an execution row — same expand-in-place pattern as the Scheduler tab. */
function ExecutionExpand({ detail }) {
  if (!detail) return <div className="py-6 flex justify-center bg-[var(--bg-inset)]"><Loader size={28} label="Loading…" /></div>;
  return (
    <div className="bg-[var(--bg-inset)] p-4 flex flex-col gap-3">
      <Section title="Request">
        <Row k="Method / URL" v={`${detail.execution.requestMethod} ${detail.execution.requestUrl}`} mono />
        <Row k="Headers (secrets masked)" v={prettyJson(detail.execution.requestHeaders)} mono pre />
        {detail.execution.requestBody && <Row k="Body" v={detail.execution.requestBody} mono pre />}
        {detail.execution.injectedVariables && (
          <Row k="Injected Variables (from Base APIs, masked)" v={prettyJson(detail.execution.injectedVariables)} mono pre />
        )}
      </Section>
      <Section title="Response">
        <Row k="Status" v={`${detail.execution.responseStatusCode ?? '—'} ${detail.execution.responseStatusMessage ?? ''} (${detail.execution.responseStatusClass})`} />
        {detail.execution.responseContentType && <Row k="Content Type" v={detail.execution.responseContentType} mono />}
        {detail.execution.errorMessage && <Row k="Error" v={detail.execution.errorMessage} />}
        {detail.execution.responseCookies && detail.execution.responseCookies !== '[]' && (
          <Row k="Cookies" v={prettyJson(detail.execution.responseCookies)} mono pre />
        )}
        {detail.responseBody && <Row k="Body" v={prettyJson(detail.responseBody)} mono pre maxH />}
        {detail.execution.responseBodyObjectKey && (
          <Row k="Storage" v={`Offloaded (${fmtSize(detail.execution.responseSizeBytes)}) → ${detail.execution.responseBodyObjectKey}`} />
        )}
      </Section>
      <Section title="Timing">
        <div className="flex gap-4 text-xs">
          <TimingCell label="TTFB" value={detail.execution.ttfbMs} />
          <TimingCell label="Total" value={detail.execution.totalTimeMs} strong />
        </div>
        {detail.execution.startedAt && (
          <div className="mt-2 text-[11px] text-[var(--text-muted)]">
            {new Date(detail.execution.startedAt).toLocaleString()} → {detail.execution.finishedAt ? new Date(detail.execution.finishedAt).toLocaleString() : '—'}
          </div>
        )}
      </Section>
      {(detail.execution.correlationId || detail.execution.groupExecutionId || detail.execution.scheduleId) && (
        <Section title="Trace">
          {detail.execution.correlationId && <Row k="Correlation ID" v={detail.execution.correlationId} mono />}
          {detail.execution.groupExecutionId && <Row k="Group Run" v={`#${detail.execution.groupExecutionId}`} />}
          {detail.execution.scheduleId && <Row k="Schedule" v={`#${detail.execution.scheduleId}`} />}
        </Section>
      )}
      <Section title={`Validation (${(detail.validationResults ?? []).length} rules)`}>
        {(detail.validationResults ?? []).length === 0 && <div className="text-xs text-[var(--text-muted)]">No rules evaluated.</div>}
        {(detail.validationResults ?? []).map((v) => (
          <div key={v.id} className={`flex items-center gap-2 text-xs py-1.5 px-2 rounded mb-1 ${v.passed ? 'bg-[var(--success-bg-soft)]' : 'bg-[var(--danger-bg-soft)]'}`}>
            {v.passed ? <CheckCircle2 size={13} className="text-[var(--success-text)] shrink-0" /> : <XCircle size={13} className="text-[var(--danger-text)] shrink-0" />}
            <span className="font-mono text-[var(--info-text)]">{v.jsonPath}</span>
            <span className="text-[var(--text-muted)]">{v.operator}</span>
            {v.expectedValue != null && <span className="text-[var(--text-secondary)]">expected <b className="text-[var(--text-primary)]">{v.expectedValue}</b></span>}
            <span className="text-[var(--text-secondary)] ml-auto">actual <b className={v.passed ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]'}>{v.actualValue ?? 'null'}</b></span>
          </div>
        ))}
      </Section>
      <Section title={`Required Payload Fields (${(detail.requiredFieldResults ?? []).length})`}>
        {(detail.requiredFieldResults ?? []).length === 0 && <div className="text-xs text-[var(--text-muted)]">No fields marked Required.</div>}
        {(detail.requiredFieldResults ?? []).map((f, idx) => (
          <div key={idx} className={`flex items-center gap-2 text-xs py-1.5 px-2 rounded mb-1 ${f.enforced ? 'bg-[var(--success-bg-soft)]' : 'bg-[var(--danger-bg-soft)]'}`}>
            {f.enforced ? <CheckCircle2 size={13} className="text-[var(--success-text)] shrink-0" /> : <XCircle size={13} className="text-[var(--danger-text)] shrink-0" />}
            <span className="font-mono text-[var(--info-text)]">{f.key}</span>
            <span className="text-[var(--text-muted)]">{f.source}</span>
            <span className={`ml-auto ${f.enforced ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]'}`}>
              {f.enforced ? 'enforced by backend' : 'NOT enforced by backend'}
            </span>
          </div>
        ))}
      </Section>
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
