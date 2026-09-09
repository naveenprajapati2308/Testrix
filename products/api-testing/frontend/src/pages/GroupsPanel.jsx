import { Fragment, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Trash2, Play, Plus, CheckCircle2, XCircle, X, Layers, Clock,
  ChevronRight, Loader2, CalendarClock, AlertTriangle, Pencil,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { flattenModules } from './BaseApis.jsx';
import { WEEK_DAYS } from './Scheduler.jsx';
import { INPUT_CLASS as inputCls, STATUS_BADGE, healthColor, CLASS_BADGE } from '../lib/statusColors.js';
import { ModalOverlay } from '../components/ModalOverlay.jsx';
import { Loader } from '../../../../../shared/ui/Loader.jsx';
import { Pagination } from '../components/Pagination.jsx';

/** Labeled row-action button: clear hit area, colored hover fill, press feedback. */
export function ActionBtn({ icon: Icon, label, onClick, disabled, tone = 'default', active }) {
  const tones = {
    default: 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-strong)]',
    run: 'border-[var(--success-border-soft)] text-[var(--success-text)] hover:text-white hover:bg-[var(--success-text)] hover:border-[var(--success-text)]',
    edit: 'border-[var(--info-text)]/40 text-[var(--info-text)] hover:text-white hover:bg-[var(--info-text)] hover:border-[var(--info-text)]',
    warn: 'border-[var(--warning-border-soft)] text-[var(--warning-text)] hover:text-white hover:bg-[var(--warning-text)] hover:border-[var(--warning-text)]',
    danger: 'border-[var(--danger-border-soft)] text-[var(--danger-text)] hover:text-white hover:bg-[var(--danger-text)] hover:border-[var(--danger-text)]',
  };
  return (
    <button onClick={onClick} disabled={disabled} title={label}
      className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-[11px] font-semibold
        transition-all duration-150 active:scale-95 disabled:opacity-30 disabled:pointer-events-none
        ${tones[tone] ?? tones.default} ${active ? 'ring-1 ring-[var(--info-text)] bg-[var(--info-text)]/15' : ''}`}>
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}

/**
 * Group management inside the Scheduler tab: latest groups with health,
 * drill-down into per-API status (incl. connected Base APIs and the actual
 * failure reason), run-now, membership and group scheduling.
 */
export default function GroupsPanel() {
  const qc = useQueryClient();
  const emptyGroupForm = { name: '', description: '', groupType: 'MODULE', moduleId: '', timeFrequency: 'NOW' };
  const [form, setForm] = useState(emptyGroupForm);
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [execDetailId, setExecDetailId] = useState(null);
  const [schedTime, setSchedTime] = useState('10:00');
  const [schedDay, setSchedDay] = useState('MON');
  const [groupsPage, setGroupsPage] = useState(1);
  const [groupsPageSize, setGroupsPageSize] = useState(10);

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => (await apiClient.get('/v1/groups')).data,
    refetchInterval: 8000,
  });
  const { data: modules = [] } = useQuery({
    queryKey: ['modules'],
    queryFn: async () => (await apiClient.get('/v1/modules')).data,
  });
  const { data: regularApis = [] } = useQuery({
    queryKey: ['regular-apis'],
    queryFn: async () => (await apiClient.get('/v1/regular-apis')).data,
  });
  const { data: detail } = useQuery({
    queryKey: ['group-detail', selectedId],
    queryFn: async () => (await apiClient.get(`/v1/groups/${selectedId}`)).data,
    enabled: !!selectedId,
    refetchInterval: 8000,
  });
  const { data: executions } = useQuery({
    queryKey: ['group-executions', selectedId],
    queryFn: async () => (await apiClient.get('/v1/groups/executions', { params: { groupId: selectedId, size: 10 } })).data,
    enabled: !!selectedId,
    refetchInterval: 5000,
  });
  const { data: execDetail } = useQuery({
    queryKey: ['group-exec-detail', execDetailId],
    queryFn: async () => (await apiClient.get(`/v1/groups/executions/${execDetailId}`)).data,
    enabled: !!execDetailId,
    refetchInterval: 4000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['groups'] });
    qc.invalidateQueries({ queryKey: ['group-detail'] });
    qc.invalidateQueries({ queryKey: ['group-executions'] });
  };

  const createMut = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name, description: form.description || null, groupType: form.groupType,
        moduleId: form.groupType === 'MODULE' && form.moduleId ? Number(form.moduleId) : null,
        timeFrequency: form.groupType === 'TIME' ? form.timeFrequency : null,
      };
      return editingId
        ? apiClient.put(`/v1/groups/${editingId}`, payload)
        : apiClient.post('/v1/groups', payload);
    },
    onSuccess: () => { setForm(emptyGroupForm); setEditingId(null); invalidate(); },
  });

  const startEdit = (g) => {
    setForm({
      name: g.name, description: g.description ?? '', groupType: g.groupType,
      moduleId: g.moduleId != null ? String(g.moduleId) : '',
      timeFrequency: g.timeFrequency ?? 'NOW',
    });
    setEditingId(g.id);
  };
  const deleteMut = useMutation({
    mutationFn: (id) => apiClient.delete(`/v1/groups/${id}`),
    onSuccess: () => { setSelectedId(null); invalidate(); },
  });
  const runMut = useMutation({
    mutationFn: (id) => apiClient.post(`/v1/groups/${id}/execute`),
    onSuccess: invalidate,
  });
  const addMemberMut = useMutation({
    mutationFn: (regularApiId) => apiClient.post(`/v1/groups/${selectedId}/members`, { regularApiId }),
    onSuccess: invalidate,
  });
  const removeMemberMut = useMutation({
    mutationFn: (regularApiId) => apiClient.delete(`/v1/groups/${selectedId}/members/${regularApiId}`),
    onSuccess: invalidate,
  });
  const scheduleGroupMut = useMutation({
    mutationFn: (group) => apiClient.post('/v1/schedules', {
      name: `${group.name} (group)`, targetType: 'GROUP', groupId: group.id,
      frequencyType: group.timeFrequency === 'WEEKLY' ? 'WEEKLY' : 'DAILY',
      // Anchored time — "10:00" fires daily at 10:00, "MON 10:00" weekly on Monday 10:00
      frequencyValue: group.timeFrequency === 'WEEKLY' ? `${schedDay} ${schedTime}` : schedTime,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  });

  const flatModules = flattenModules(modules);
  const moduleName = (id) => flatModules.find((m) => m.id === id)?.label ?? '—';
  const pagedGroups = groups.slice((groupsPage - 1) * groupsPageSize, groupsPage * groupsPageSize);
  const memberIds = useMemo(() => new Set((detail?.members ?? []).map((m) => m.regularApiId)), [detail]);
  const selectedGroup = groups.find((g) => g.group.id === selectedId)?.group;

  const canCreate = form.name.trim()
    && (form.groupType !== 'MODULE' || true); // module optional even for MODULE groups

  return (
    <div className="flex flex-col gap-5">
      {/* Create group */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
          Group name
          <input className={inputCls} placeholder="e.g. Smoke Suite" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
          Type
          <select className={inputCls} value={form.groupType}
            onChange={(e) => setForm({ ...form, groupType: e.target.value })}>
            <option value="MODULE">Module-wise</option>
            <option value="TIME">Time-wise</option>
          </select>
        </label>
        {form.groupType === 'MODULE' && (
          <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            Module
            <select className={inputCls} value={form.moduleId}
              onChange={(e) => setForm({ ...form, moduleId: e.target.value })}>
              <option value="">-Select Module-</option>
              {flatModules.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        )}
        {form.groupType === 'TIME' && (
          <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            Cadence
            <select className={inputCls} value={form.timeFrequency}
              onChange={(e) => setForm({ ...form, timeFrequency: e.target.value })}>
              <option value="NOW">Execute now (on demand)</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)] flex-1 min-w-[160px]">
          Description
          <input className={inputCls} placeholder="Optional" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <button disabled={!canCreate || createMut.isPending} onClick={() => createMut.mutate()}
          className="flex items-center gap-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 px-4 py-2 text-sm font-semibold text-white">
          {editingId ? <><Pencil size={14} /> Update Group</> : <><Plus size={14} /> Create Group</>}
        </button>
        {editingId && (
          <button onClick={() => { setForm(emptyGroupForm); setEditingId(null); }}
            className="rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-2 text-sm">
            Cancel
          </button>
        )}
        {createMut.isError && (
          <span className="text-xs text-[var(--danger-text)]">{createMut.error?.response?.data?.message ?? 'Failed to save group'}</span>
        )}
      </div>

      {/* Latest groups with health */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="px-4 py-2 border-b border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Execution Groups <span className="text-[var(--text-muted)] normal-case">({groups.length})</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
              <th className="text-left px-4 py-2 font-medium">Group</th>
              <th className="text-left px-4 py-2 font-medium">Type</th>
              <th className="text-left px-4 py-2 font-medium">APIs</th>
              <th className="text-left px-4 py-2 font-medium">Health</th>
              <th className="text-left px-4 py-2 font-medium">Last Run</th>
              <th className="text-left px-4 py-2 font-medium">Result</th>
              <th className="text-center px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groupsLoading && (
              <tr><td colSpan={7} className="px-4 py-8"><div className="flex justify-center"><Loader size={22} /></div></td></tr>
            )}
            {!groupsLoading && pagedGroups.map(({ group: g, memberCount, lastExecution: le }) => (
              <Fragment key={g.id}>
              <tr onClick={() => setSelectedId(selectedId === g.id ? null : g.id)}
                className={`border-b border-[var(--border-soft)] hover:bg-[var(--bg-hover)] cursor-pointer ${selectedId === g.id ? 'bg-[var(--accent-bg-soft)]' : ''}`}>
                <td className="px-4 py-2.5">
                  <span className="text-[var(--text-primary)] font-medium flex items-center gap-1.5">
                    <ChevronRight size={12} className={`shrink-0 text-[var(--text-muted)] transition-transform ${selectedId === g.id ? 'rotate-90' : ''}`} />
                    <Layers size={12} className="text-[var(--accent-text)]" /> {g.name}
                    <span className="text-[var(--text-muted)] font-normal">#{g.id}</span>
                  </span>
                  {g.description && <div className="text-[var(--text-muted)] pl-[18px]">{g.description}</div>}
                </td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                  {g.groupType === 'MODULE'
                    ? <span>Module · {moduleName(g.moduleId)}</span>
                    : <span className="inline-flex items-center gap-1"><Clock size={11} /> {g.timeFrequency}</span>}
                </td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums">{memberCount}</td>
                <td className={`px-4 py-2.5 font-semibold tabular-nums ${healthColor(le?.healthPercent)}`}>
                  {le?.healthPercent != null ? `${le.healthPercent}%` : '—'}
                </td>
                <td className="px-4 py-2.5 text-[var(--text-muted)]">{le ? new Date(le.startedAt).toLocaleString() : 'never'}</td>
                <td className="px-4 py-2.5">
                  {le
                    ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[le.status] ?? 'bg-[var(--bg-surface-2)] text-[var(--text-muted)]'}`}>
                      {le.status === 'RUNNING' ? 'RUNNING…' : `${le.status} ${le.passedApis}/${le.totalApis}`}
                    </span>
                    : <span className="text-[var(--text-muted)]">—</span>}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                    <ActionBtn icon={Play} label="Run" tone="run"
                      onClick={() => runMut.mutate(g.id)} disabled={memberCount === 0 || runMut.isPending} />
                    <ActionBtn icon={Pencil} label="Edit" tone="edit" active={editingId === g.id}
                      onClick={() => startEdit(g)} />
                    <ActionBtn icon={Trash2} label="Delete" tone="danger"
                      onClick={() => deleteMut.mutate(g.id)} />
                  </div>
                </td>
              </tr>
              {selectedId === g.id && (
                <tr className="border-b border-[var(--border-soft)]">
                  <td colSpan={7} className="p-0">
                    <GroupExpand detail={detail} executions={executions} memberIds={memberIds}
                      regularApis={regularApis} runMut={runMut} addMemberMut={addMemberMut} removeMemberMut={removeMemberMut}
                      schedTime={schedTime} setSchedTime={setSchedTime} schedDay={schedDay} setSchedDay={setSchedDay}
                      scheduleGroupMut={scheduleGroupMut} onSelectExecution={setExecDetailId} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {!groupsLoading && groups.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-[var(--text-muted)]">No groups yet — create one above, then add Regular APIs to it</td></tr>
            )}
          </tbody>
        </table>
        <Pagination page={groupsPage} pageSize={groupsPageSize} totalRecords={groups.length}
          onPageChange={setGroupsPage} onPageSizeChange={(n) => { setGroupsPageSize(n); setGroupsPage(1); }} />
      </div>

      {/* Group-run drill-down drawer */}
      {execDetailId && (
        <ModalOverlay onClose={() => setExecDetailId(null)} align="end">
          <div className="w-[620px] h-full bg-[var(--bg-surface)] border-l border-[var(--border)] flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold">
                Group Run #{execDetailId} {execDetail ? `· ${execDetail.groupName}` : ''}
              </h2>
              <button onClick={() => setExecDetailId(null)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"><X size={16} /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-5 flex flex-col gap-3">
              {execDetail ? (
                <>
                  <div className="flex flex-wrap gap-4 text-xs">
                    <Meta k="Status" v={execDetail.execution.status} />
                    <Meta k="Health" v={execDetail.execution.healthPercent != null ? `${execDetail.execution.healthPercent}%` : '—'} />
                    <Meta k="Passed / Failed" v={`${execDetail.execution.passedApis} / ${execDetail.execution.failedApis}`} />
                    <Meta k="Trigger" v={execDetail.execution.triggeredBy} />
                    <Meta k="Started" v={new Date(execDetail.execution.startedAt).toLocaleString()} />
                    <Meta k="Correlation" v={execDetail.execution.correlationId} mono />
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {(execDetail.executions ?? []).length} API call(s) in this run — click any row to see its full request/response data.
                  </div>
                  <div className="border border-[var(--border)] rounded divide-y divide-[var(--border-soft)]">
                    {(execDetail.executions ?? []).map((h) => <ExecRow key={h.id} h={h} />)}
                    {(execDetail.executions ?? []).length === 0 && (
                      <div className="px-3 py-3 text-xs text-[var(--text-muted)]">
                        {execDetail.execution.status === 'RUNNING' ? 'Still running…' : 'No execution records.'}
                      </div>
                    )}
                  </div>
                </>
              ) : <div className="py-6 flex justify-center"><Loader size={28} label="Loading…" /></div>}
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

/**
 * Inline expansion content for a group row — same "expand in place, no
 * navigation" pattern as the Schedules tab's row drill-down. Shows the
 * group's member APIs (add/remove right here), its Run/Schedule actions,
 * and recent execution history.
 */
function GroupExpand({ detail, executions, memberIds, regularApis, runMut, addMemberMut, removeMemberMut,
  schedTime, setSchedTime, schedDay, setSchedDay, scheduleGroupMut, onSelectExecution }) {
  if (!detail) return <div className="px-4 py-3 bg-[var(--bg-inset)]"><Loader size={16} label="Loading group…" /></div>;

  return (
    <div className="bg-[var(--bg-inset)] p-4 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-xs text-[var(--text-muted)]">
          {detail.lastExecution?.healthPercent != null ? `${detail.lastExecution.healthPercent}% healthy` : 'Never executed'}
        </span>
        <div className="ml-auto flex gap-2">
          {detail.group.groupType === 'TIME' && detail.group.timeFrequency !== 'NOW' && (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {detail.group.timeFrequency === 'WEEKLY' && (
                <select className={`${inputCls} py-1.5 text-xs`} value={schedDay} title="Day of week"
                  onChange={(e) => setSchedDay(e.target.value)}>
                  {WEEK_DAYS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              )}
              <input type="time" className={`${inputCls} py-1.5 text-xs w-28`} value={schedTime} title="Run at"
                onChange={(e) => setSchedTime(e.target.value)} />
              <button onClick={() => scheduleGroupMut.mutate(detail.group)} disabled={scheduleGroupMut.isPending}
                className="flex items-center gap-1.5 rounded border border-[var(--accent-border-soft)] text-[var(--accent-text)] hover:bg-[var(--accent-bg-soft)] px-3 py-1.5 text-xs font-semibold">
                <CalendarClock size={12} /> Schedule {detail.group.timeFrequency.toLowerCase()}
              </button>
            </div>
          )}
          <button onClick={(e) => { e.stopPropagation(); runMut.mutate(detail.group.id); }}
            disabled={detail.members.length === 0 || runMut.isPending}
            className="flex items-center gap-1.5 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 px-3 py-1.5 text-xs font-semibold text-white">
            <Play size={12} /> Run Group
          </button>
        </div>
      </div>
      {scheduleGroupMut.isSuccess && <div className="text-xs text-[var(--success-text)]">Schedule created — see the Schedules view.</div>}
      {scheduleGroupMut.isError && <div className="text-xs text-[var(--danger-text)]">{scheduleGroupMut.error?.response?.data?.message ?? 'Failed to schedule'}</div>}

      {/* Members: per-API status + base API status + failure reason */}
      <div className="border border-[var(--border)] rounded" onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-2 border-b border-[var(--border)] text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          APIs in this group ({detail.members.length})
        </div>
        {detail.members.map((m) => (
          <MemberRow key={m.regularApiId} m={m} onRemove={() => removeMemberMut.mutate(m.regularApiId)} />
        ))}
        {detail.members.length === 0 && <div className="px-3 py-3 text-xs text-[var(--text-muted)]">No APIs in this group yet.</div>}
        <div className="px-3 py-2 flex items-center gap-2">
          <select className={`${inputCls} py-1.5 flex-1`} value=""
            onChange={(e) => e.target.value && addMemberMut.mutate(Number(e.target.value))}>
            <option value="">+ Add Regular API…</option>
            {regularApis.filter((r) => !memberIds.has(r.id))
              .map((r) => <option key={r.id} value={r.id}>{r.name} ({r.method})</option>)}
          </select>
        </div>
      </div>

      {/* Recent group executions — the "Execution Count" for this group */}
      <div className="border border-[var(--border)] rounded" onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-2 border-b border-[var(--border)] text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Recent Group Runs ({executions?.content?.length ?? 0})
        </div>
        {(executions?.content ?? []).map((e) => (
          <button key={e.id} onClick={() => onSelectExecution(e.id)}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs border-b border-[var(--border-soft)] hover:bg-[var(--bg-hover)] text-left">
            {e.status === 'RUNNING'
              ? <Loader2 size={12} className="text-[var(--info-text)] animate-spin" />
              : e.status === 'SUCCESS'
                ? <CheckCircle2 size={12} className="text-[var(--success-text)]" />
                : <XCircle size={12} className="text-[var(--danger-text)]" />}
            <span className="text-[var(--text-secondary)]">Run #{e.id}</span>
            <span className={`px-1.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[e.status] ?? ''}`}>{e.status}</span>
            <span className="text-[var(--text-muted)]">{e.passedApis}/{e.totalApis} passed</span>
            <span className={`tabular-nums ${healthColor(e.healthPercent)}`}>{e.healthPercent != null ? `${e.healthPercent}%` : ''}</span>
            <span className="text-[var(--text-muted)]">{e.triggeredBy}</span>
            <span className="ml-auto text-[var(--text-muted)]">{new Date(e.startedAt).toLocaleString()}</span>
            <ChevronRight size={12} className="text-[var(--text-muted)]" />
          </button>
        ))}
        {(executions?.content ?? []).length === 0 && <div className="px-3 py-3 text-xs text-[var(--text-muted)]">Never executed.</div>}
      </div>
    </div>
  );
}

/**
 * One API call inside a group run. Click to expand: fetches the full history
 * record (request, response body, validation results) on first open.
 */
export function ExecRow({ h }) {
  const [open, setOpen] = useState(false);
  const passed = h.errorMessage == null
    && h.responseStatusCode != null && h.responseStatusCode < 400
    && h.validationPassed !== false;

  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className={`w-full px-3 py-2 text-xs flex flex-col gap-0.5 text-left hover:bg-[var(--bg-hover)] ${open ? 'bg-[var(--bg-hover)]' : ''}`}>
        <div className="flex items-center gap-2">
          <ChevronRight size={12} className={`text-[var(--text-muted)] transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className={`px-1.5 rounded text-[10px] font-semibold ${h.apiType === 'BASE' ? 'bg-[var(--indigo-text)]/15 text-[var(--indigo-text)]' : 'bg-[var(--success-bg-soft)] text-[var(--success-text)]'}`}>
            {h.apiType}
          </span>
          <span className="text-[var(--text-primary)]">{h.apiName ?? '(ad-hoc)'}</span>
          <span className="font-semibold text-[var(--text-secondary)]">{h.requestMethod}</span>
          <StatusPill statusClass={h.responseStatusClass} statusCode={h.responseStatusCode} />
          {passed
            ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--success-text)]"><CheckCircle2 size={11} /> PASS</span>
            : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--danger-text)]"><XCircle size={11} /> FAIL</span>}
          <span className="ml-auto text-[var(--text-muted)] tabular-nums">{h.totalTimeMs} ms</span>
        </div>
        {h.errorMessage && (
          <div className="flex items-start gap-1.5 text-[11px] text-[var(--danger-text)] pl-5">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {h.errorMessage}
          </div>
        )}
      </button>

      {open && <HistoryDetailPanel historyId={h.id} totalTimeMs={h.totalTimeMs} />}
    </div>
  );
}

/**
 * Full request/response data for one execution record (same data the History
 * page shows): URL, status, timings, masked variables, validation, body.
 */
export function HistoryDetailPanel({ historyId, totalTimeMs }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['history-detail', historyId],
    queryFn: async () => (await apiClient.get(`/v1/history/${historyId}`)).data,
    enabled: !!historyId,
  });
  const exec = detail?.execution;

  return (
    <div className="px-4 pb-3 pt-1 flex flex-col gap-2 bg-[var(--bg-inset)]">
      {isLoading && <Loader size={16} label="Loading data…" />}
      {exec && (
        <>
          <div className="flex flex-wrap gap-4 text-xs">
            <Meta k="URL" v={exec.requestUrl} mono />
            <Meta k="Status" v={`${exec.responseStatusCode ?? '—'} ${exec.responseStatusMessage ?? ''}`} />
            <Meta k="TTFB / Total" v={`${exec.ttfbMs ?? '—'} / ${totalTimeMs ?? exec.totalTimeMs ?? '—'} ms`} />
            <Meta k="Executed" v={exec.startedAt ? new Date(exec.startedAt).toLocaleString() : '—'} />
            {exec.injectedVariables && <Meta k="Variables (masked)" v={exec.injectedVariables} mono />}
          </div>
          {exec.errorMessage && (
            <div className="flex items-start gap-1.5 text-[11px] text-[var(--danger-text)]">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {exec.errorMessage}
            </div>
          )}
          {(detail.validationResults ?? []).length > 0 && (
            <div className="border border-[var(--border)] rounded divide-y divide-[var(--border-soft)]">
              {detail.validationResults.map((v) => (
                <div key={v.id} className="px-2.5 py-1.5 text-[11px] flex items-center gap-2">
                  {v.passed ? <CheckCircle2 size={11} className="text-[var(--success-text)]" /> : <XCircle size={11} className="text-[var(--danger-text)]" />}
                  <span className="font-mono text-[var(--text-secondary)]">{v.jsonPath}</span>
                  <span className="text-[var(--text-muted)]">{v.operator}</span>
                  {v.expectedValue != null && <span className="text-[var(--text-secondary)]">expected <span className="text-[var(--text-primary)]">{v.expectedValue}</span></span>}
                  <span className="text-[var(--text-secondary)]">actual <span className={v.passed ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]'}>{v.actualValue ?? 'null'}</span></span>
                </div>
              ))}
            </div>
          )}
          {(detail.requiredFieldResults ?? []).length > 0 && (
            <div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">Required payload fields</div>
              <div className="border border-[var(--border)] rounded divide-y divide-[var(--border-soft)]">
                {detail.requiredFieldResults.map((f, idx) => (
                  <div key={idx} className="px-2.5 py-1.5 text-[11px] flex items-center gap-2">
                    {f.enforced ? <CheckCircle2 size={11} className="text-[var(--success-text)]" /> : <XCircle size={11} className="text-[var(--danger-text)]" />}
                    <span className="font-mono text-[var(--text-secondary)]">{f.key}</span>
                    <span className="text-[var(--text-muted)]">{f.source}</span>
                    <span className={f.enforced ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]'}>
                      {f.enforced ? 'enforced by backend' : 'NOT enforced by backend'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">Response body</div>
            <pre className="text-[11px] text-[var(--text-secondary)] bg-[var(--bg-surface-2)] border border-[var(--border)] rounded p-2.5 max-h-64 overflow-auto whitespace-pre-wrap break-all">
              {prettyJson(detail.responseBody) ?? '(empty body)'}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One API in the group member list. Click to expand its latest run's full
 * data — resolves the newest history record for this API, then shows it.
 */
export function MemberRow({ m, onRemove }) {
  const [open, setOpen] = useState(false);
  const { data: latest, isLoading } = useQuery({
    queryKey: ['latest-history', m.regularApiId],
    queryFn: async () => (await apiClient.get('/v1/history', {
      params: { apiType: 'REGULAR', apiId: m.regularApiId, size: 1 },
    })).data,
    enabled: open,
  });
  const latestId = latest?.content?.[0]?.id;

  return (
    <div className="border-b border-[var(--border-soft)]">
      <button onClick={() => setOpen(!open)}
        className={`w-full px-3 py-2.5 flex flex-col gap-1 text-left hover:bg-[var(--bg-hover)] ${open ? 'bg-[var(--bg-hover)]' : ''}`}>
        <div className="flex items-center gap-2 text-xs">
          <ChevronRight size={12} className={`text-[var(--text-muted)] transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className="font-semibold text-[var(--accent-text)]">{m.method}</span>
          <span className="text-[var(--text-primary)]">{m.name}</span>
          {m.dynamic && <span className="text-[9px] px-1 rounded bg-[var(--indigo-text)]/20 text-[var(--indigo-text)]">DYN</span>}
          <StatusPill statusClass={m.lastStatusClass} statusCode={m.lastStatusCode} />
          <span className="text-[var(--text-muted)] ml-auto">{m.lastExecutedAt ? new Date(m.lastExecutedAt).toLocaleString() : 'never ran'}</span>
          <span onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-[var(--text-muted)] hover:text-[var(--danger-text)] cursor-pointer" title="Remove from group"><Trash2 size={13} /></span>
        </div>
        <div className="text-[var(--text-muted)] text-[11px] truncate pl-5">{m.url}</div>
        {m.lastErrorMessage && (
          <div className="flex items-start gap-1.5 text-[11px] text-[var(--danger-text)] pl-5">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {m.lastErrorMessage}
          </div>
        )}
        {((m.baseApis ?? []).length > 0 || (m.regularDependencies ?? []).length > 0) && (
          <div className="flex flex-wrap gap-2 mt-1 pl-5">
            {(m.baseApis ?? []).map((b) => (
              <span key={`base-${b.baseApiId}`} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[var(--border)] text-[10px] text-[var(--text-secondary)]"
                title={b.lastErrorMessage ?? ''}>
                Base: {b.name}
                <StatusPill statusClass={b.lastStatusClass} statusCode={b.lastStatusCode} small />
                {b.lastErrorMessage && <AlertTriangle size={10} className="text-[var(--danger-text)]" />}
              </span>
            ))}
            {(m.regularDependencies ?? []).map((r) => (
              <span key={`regular-${r.regularApiId}`} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[var(--indigo-text)]/40 text-[10px] text-[var(--indigo-text)]"
                title={r.lastErrorMessage ?? ''}>
                Regular: {r.name}
                <StatusPill statusClass={r.lastStatusClass} statusCode={r.lastStatusCode} small />
                {r.lastErrorMessage && <AlertTriangle size={10} className="text-[var(--danger-text)]" />}
              </span>
            ))}
          </div>
        )}
      </button>
      {open && (isLoading
        ? <div className="px-4 pb-3"><Loader size={16} label="Loading last run…" /></div>
        : latestId
          ? <HistoryDetailPanel historyId={latestId} />
          : <div className="px-4 pb-3 text-xs text-[var(--text-muted)]">This API has never run yet — no data to show.</div>)}
    </div>
  );
}

function prettyJson(s) {
  if (!s) return null;
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function StatusPill({ statusClass, statusCode, small }) {
  const color = CLASS_BADGE[statusClass] ?? 'bg-[var(--bg-surface-2)] text-[var(--text-muted)]';
  return (
    <span className={`${small ? 'px-1' : 'px-1.5 py-0.5'} rounded-full text-[10px] font-semibold ${color}`}>
      {statusCode ?? statusClass ?? 'never'}
    </span>
  );
}

export function Meta({ k, v, mono }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-[var(--text-muted)] uppercase">{k}</span>
      <span className={`text-[var(--text-secondary)] ${mono ? 'font-mono text-[10px] break-all max-w-[180px]' : ''}`}>{v}</span>
    </div>
  );
}
