import { CheckCircle2, ClipboardList, KeyRound, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { Panel, DataTable, Modal, ConfirmDialog } from '../shared/index.jsx';

const MODULE_LABELS = {
  AUTOMATION_SELENIUM: 'Automation (Selenium)',
  AUTOMATION_PLAYWRIGHT: 'Automation (Playwright)',
  API_TESTING: 'API Testing',
  PERFORMANCE_TESTING: 'Performance Testing'
};

// ── Super Admin: Workspace Requests queue — approve provisions a real Tenant-scoped Project +
// Project Admin account; reject stores a reason and allows the requester to resubmit later. ──────
export function WorkspaceRequests({ setNotice }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [approveTarget, setApproveTarget] = useState(null);
  const [approvalResult, setApprovalResult] = useState(null);
  const [isApproving, setIsApproving] = useState(false);

  const load = () => {
    setLoading(true);
    return api.adminListWorkspaceRequests(statusFilter || undefined).then(setRequests).catch((e) => setNotice(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [statusFilter]);

  const confirmApprove = async () => {
    if (!approveTarget || isApproving) return;
    setIsApproving(true);
    try {
      const result = await api.adminApproveWorkspaceRequest(approveTarget.id);
      setApproveTarget(null);
      setApprovalResult(result);
      setNotice(`Workspace "${result.projectName}" provisioned.`);
      await load();
    } catch (e) {
      setNotice(e.message);
      setApproveTarget(null);
    } finally {
      setIsApproving(false);
    }
  };

  const columns = useMemo(() => [
    { key: 'projectName', label: 'Project', render: (v, r) => (<div><strong>{v}</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.organizationName}</div></div>) },
    { key: 'workspaceName', label: 'Workspace', render: (v, r) => (<div>{v}<div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.preferredWorkspaceSlug}</div></div>) },
    { key: 'requestedModules', label: 'Modules', render: (v) => (v || []).map((m) => MODULE_LABELS[m] || m).join(', ') },
    { key: 'projectManagerName', label: 'Project Manager', render: (v, r) => (<div>{v}<div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.email}</div></div>) },
    { key: 'status', label: 'Status', render: (v) => <span className={`status ${v?.toLowerCase()}`}>{v}</span> },
    { key: 'createdAt', label: 'Submitted', render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, r) => r.status === 'PENDING' ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="action-btn" onClick={() => setApproveTarget(r)} title="Approve">
            <CheckCircle2 size={13} /> Approve
          </button>
          <button className="action-btn delete-btn" onClick={() => setRejectTarget(r)} title="Reject">
            <XCircle size={13} /> Reject
          </button>
        </div>
      ) : r.status === 'REJECTED' ? (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }} title={r.rejectionReason}>{r.rejectionReason}</span>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reviewed</span>
      )
    }
  ], []);

  return (
    <section className="page-grid" style={{ gridTemplateColumns: '1fr' }}>
      <Panel title="Workspace Requests">
        <div className="um-toolbar">
          <span className="um-count"><ClipboardList size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />{requests.length} request{requests.length !== 1 ? 's' : ''}</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="um-filter-select">
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
        <DataTable columns={columns} data={requests} loading={loading} searchPlaceholder="Filter requests..." exportFilename="workspace_requests.csv" />
      </Panel>

      {approveTarget && (
        <ConfirmDialog onClose={() => setApproveTarget(null)}>
          <div className="confirm-icon"><CheckCircle2 size={30} /></div>
          <h3>Approve Workspace?</h3>
          <p>This creates a real Project workspace for <strong>{approveTarget.projectName}</strong> and a Project Admin account for <strong>{approveTarget.projectManagerName}</strong>.</p>
          <div className="confirm-actions">
            <button className="secondary-action" onClick={() => setApproveTarget(null)} disabled={isApproving}>Cancel</button>
            <button className="primary-action" onClick={confirmApprove} disabled={isApproving}>{isApproving ? 'Approving…' : 'Approve'}</button>
          </div>
        </ConfirmDialog>
      )}

      {rejectTarget && (
        <Modal title={`Reject — ${rejectTarget.projectName}`} onClose={() => setRejectTarget(null)} closeOnBackdrop={false}>
          <RejectForm
            request={rejectTarget}
            setNotice={setNotice}
            onDone={() => { setRejectTarget(null); load(); }}
            onCancel={() => setRejectTarget(null)}
          />
        </Modal>
      )}

      {approvalResult && (
        <Modal title="Workspace Provisioned" onClose={() => setApprovalResult(null)} closeOnBackdrop={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p><strong>{approvalResult.projectName}</strong> ({approvalResult.projectCode} / {approvalResult.workspaceCode}) is live.</p>
            {approvalResult.projectAdminTempPassword ? (
              <div className="otp-reveal">
                <span className="otp-label"><KeyRound size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Project Admin Credentials</span>
                <span className="otp-code" style={{ fontSize: 15 }}>{approvalResult.projectAdminUsername}</span>
                <span className="otp-code" style={{ fontSize: 15 }}>{approvalResult.projectAdminTempPassword}</span>
                <span className="otp-hint">
                  {approvalResult.emailSent ? 'Also emailed to the project manager.' : 'Email delivery failed — please share these credentials manually.'}
                </span>
              </div>
            ) : (
              <div className="otp-reveal">
                <span className="otp-label"><KeyRound size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Linked Existing Account</span>
                <span className="otp-code" style={{ fontSize: 15 }}>Username: {approvalResult.projectAdminUsername}</span>
                <span className="otp-hint">
                  This user already has a Testrix account. The new workspace has been linked to their existing credentials.
                  {approvalResult.emailSent ? ' Access details have been emailed.' : ''}
                </span>
              </div>
            )}
            <div className="modal-form-actions">
              <button className="primary-action" onClick={() => setApprovalResult(null)}>Done</button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

function RejectForm({ request, setNotice, onDone, onCancel }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setError('Rejection reason is required'); return; }
    try {
      await api.adminRejectWorkspaceRequest(request.id, reason.trim());
      setNotice(`Request for "${request.projectName}" rejected.`);
      onDone();
    } catch (err) {
      setNotice(err.message);
    }
  };

  return (
    <form onSubmit={submit} className="auth-form">
      <div className={`form-field${error ? ' has-error' : ''}`}>
        <label className="form-row">
          <span>Rejection Reason<span className="required-mark" aria-hidden="true">*</span></span>
          <textarea rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setError(''); }} className="ws-request-textarea" />
        </label>
        {error && <span className="field-error">{error}</span>}
      </div>
      <div className="modal-form-actions">
        <button type="button" className="secondary-action" onClick={onCancel}>Cancel</button>
        <button className="danger-action" type="submit">Reject Request</button>
      </div>
    </form>
  );
}
