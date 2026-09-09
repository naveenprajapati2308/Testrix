import { Building2, Crown, Eye, KeyRound, Trash2, UserCheck, UserMinus, UserPen, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, auth } from '../../api.js';
import { Field } from '../shared/Field.jsx';
import { Panel, DataTable, Modal, ConfirmDialog } from '../shared/index.jsx';

// ── Project Admin's own Team Management page — create/onboard, edit, activate/deactivate,
// assign roles, remove users within their current project. Never touches the platform Role
// catalog (only the project's own membership grants). All per-row actions live behind a single
// "View" action (mirrors Super Admin's Manage Users), which also surfaces any OTHER workspace
// this same member shares with the caller — for an admin who runs several workspaces, so they
// can manage that member's role there too without switching their active workspace. ───────────
export function ProjectUserManagement({ setNotice }) {
  const project = auth.get()?.project;
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleOptions, setRoleOptions] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
  // rolesTarget/removeTarget carry { member, projectId, projectName } so the same modals can act
  // on either the current workspace or one of the member's other shared workspaces.
  const [rolesTarget, setRolesTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  // Set when the caller tries to remove themselves while still this project's Project Admin —
  // blocked (backend enforces it too); this offers transferring ownership right there instead.
  const [selfRemoveBlock, setSelfRemoveBlock] = useState(null); // { inCurrentWorkspace, workspaceName }
  const [selfTransferPick, setSelfTransferPick] = useState('');

  const currentUsername = auth.get()?.user?.username;

  const load = () => {
    setLoading(true);
    return api.listProjectUsers(project.id).then(setMembers).catch((e) => setNotice(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    api.projectRoles().then(setRoleOptions).catch(() => {});
  }, []);

  const confirmRemove = async () => {
    if (!removeTarget) return;
    try {
      await api.removeProjectUser(removeTarget.projectId, removeTarget.member.userId);
      setNotice(`${removeTarget.member.username} removed from ${removeTarget.projectName}.`);
      setRemoveTarget(null);
      await load();
    } catch (e) {
      setNotice(e.message);
      setRemoveTarget(null);
    }
  };

  const confirmTransfer = async () => {
    if (!transferTarget) return;
    try {
      await api.transferProjectOwnership(project.id, transferTarget.userId);
      setNotice(`${transferTarget.username} is now the Project Admin.`);
      setTransferTarget(null);
      await load();
    } catch (e) {
      setNotice(e.message);
      setTransferTarget(null);
    }
  };

  const confirmSelfTransfer = async () => {
    if (!selfTransferPick) return;
    try {
      await api.transferProjectOwnership(project.id, Number(selfTransferPick));
      setNotice('Ownership transferred. You can remove yourself now if you still want to leave.');
      setSelfRemoveBlock(null);
      setSelfTransferPick('');
      await load();
    } catch (e) {
      setNotice(e.message);
    }
  };

  const columns = useMemo(() => [
    { key: 'username', label: 'Username', render: (v) => <strong>{v}</strong> },
    { key: 'email', label: 'Email' },
    { key: 'mobileNumber', label: 'Mobile', render: (v) => v || '—' },
    { key: 'roles', label: 'Roles', render: (v) => (v || []).join(', ') },
    { key: 'status', label: 'Status', render: (v) => <span className={`status ${v?.toLowerCase()}`}>{v}</span> },
    { key: 'joinedAt', label: 'Joined', render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, m) => (
        <button className="action-btn" onClick={() => setViewTarget(m)} title="View & manage this member">
          <Eye size={13} /> View
        </button>
      )
    }
  ], []);

  if (!project) {
    return <section className="page-grid" style={{ gridTemplateColumns: '1fr' }}><Panel title="Team Management"><p>No workspace context found.</p></Panel></section>;
  }

  return (
    <section className="page-grid" style={{ gridTemplateColumns: '1fr' }}>
      <Panel title={`Team Management — ${project.name}`}>
        <div className="um-toolbar">
          <button className="primary-action um-create-btn" onClick={() => setShowCreate(true)}>
            <Users size={15} /> Add / Create User
          </button>
          <span className="um-count">{members.length} member{members.length !== 1 ? 's' : ''}</span>
        </div>
        <DataTable columns={columns} data={members} loading={loading} searchPlaceholder="Filter team members..." exportFilename="project_team.csv" />
      </Panel>

      {showCreate && (
        <Modal title="Add / Create User" onClose={() => setShowCreate(false)} closeOnBackdrop={false}>
          <CreateProjectUserForm
            projectId={project.id}
            roleOptions={roleOptions}
            setNotice={setNotice}
            onCreated={() => { setShowCreate(false); load(); }}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {editTarget && (
        <Modal title={`Edit — ${editTarget.username}`} onClose={() => setEditTarget(null)} closeOnBackdrop={false}>
          <EditProjectUserForm
            projectId={project.id}
            member={editTarget}
            setNotice={setNotice}
            onSaved={() => { setEditTarget(null); load(); }}
            onCancel={() => setEditTarget(null)}
          />
        </Modal>
      )}

      {viewTarget && (
        <Modal title={`Manage — ${viewTarget.username}`} onClose={() => setViewTarget(null)} closeOnBackdrop={false}>
          <MemberDetailPanel
            member={viewTarget}
            project={project}
            currentUsername={currentUsername}
            setNotice={setNotice}
            onChanged={load}
            onEdit={() => { setViewTarget(null); setEditTarget(viewTarget); }}
            onOpenRoles={(projectId, projectName, roles) => {
              setViewTarget(null);
              setRolesTarget({ member: { userId: viewTarget.userId, username: viewTarget.username, roles }, projectId, projectName });
            }}
            onOpenRemove={(projectId, projectName) => { setViewTarget(null); setRemoveTarget({ member: viewTarget, projectId, projectName }); }}
            onOpenTransfer={() => { setViewTarget(null); setTransferTarget(viewTarget); }}
            onSelfRemoveBlocked={(inCurrentWorkspace, workspaceName) => {
              setViewTarget(null);
              setSelfRemoveBlock({ inCurrentWorkspace, workspaceName });
            }}
          />
        </Modal>
      )}

      {rolesTarget && (
        <Modal title={`Assign Roles — ${rolesTarget.member.username} (${rolesTarget.projectName})`} onClose={() => setRolesTarget(null)} closeOnBackdrop={false}>
          <AssignRolesForm
            projectId={rolesTarget.projectId}
            member={rolesTarget.member}
            roleOptions={roleOptions}
            setNotice={setNotice}
            onSaved={() => { setRolesTarget(null); load(); }}
            onCancel={() => setRolesTarget(null)}
          />
        </Modal>
      )}

      {removeTarget && (
        <ConfirmDialog onClose={() => setRemoveTarget(null)}>
          <div className="confirm-icon"><Trash2 size={30} /></div>
          <h3>Remove from Project?</h3>
          <p>Remove <strong>{removeTarget.member.username}</strong> from <strong>{removeTarget.projectName}</strong>?</p>
          <div className="confirm-actions">
            <button className="secondary-action" onClick={() => setRemoveTarget(null)}>Cancel</button>
            <button className="danger-action" onClick={confirmRemove}>Remove</button>
          </div>
        </ConfirmDialog>
      )}

      {transferTarget && (
        <ConfirmDialog onClose={() => setTransferTarget(null)}>
          <div className="confirm-icon"><Crown size={30} /></div>
          <h3>Transfer Ownership?</h3>
          <p>Make <strong>{transferTarget.username}</strong> the Project Admin of <strong>{project.name}</strong>? You will no longer be a Project Admin here.</p>
          <div className="confirm-actions">
            <button className="secondary-action" onClick={() => setTransferTarget(null)}>Cancel</button>
            <button className="danger-action" onClick={confirmTransfer}>Transfer Ownership</button>
          </div>
        </ConfirmDialog>
      )}

      {selfRemoveBlock && (
        <ConfirmDialog onClose={() => { setSelfRemoveBlock(null); setSelfTransferPick(''); }}>
          <div className="confirm-icon"><Crown size={30} /></div>
          <h3>You Can't Remove Yourself</h3>
          {selfRemoveBlock.inCurrentWorkspace ? (
            <>
              <p>You're the Project Admin of <strong>{project.name}</strong> — transfer ownership to another active member first.</p>
              <div className="form-field">
                <label className="form-row">
                  <span>New Project Admin</span>
                  <select value={selfTransferPick} onChange={(e) => setSelfTransferPick(e.target.value)}>
                    <option value="">Choose a member…</option>
                    {members.filter((m) => m.username !== currentUsername && m.status === 'ACTIVE').map((m) => (
                      <option key={m.userId} value={m.userId}>{m.username}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="confirm-actions">
                <button className="secondary-action" onClick={() => { setSelfRemoveBlock(null); setSelfTransferPick(''); }}>Cancel</button>
                <button className="danger-action" disabled={!selfTransferPick} onClick={confirmSelfTransfer}>
                  <Crown size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} /> Transfer Ownership
                </button>
              </div>
            </>
          ) : (
            <>
              <p>You're also the Project Admin of <strong>{selfRemoveBlock.workspaceName}</strong> — switch to that workspace's Team Management to transfer ownership there before removing yourself from it.</p>
              <div className="confirm-actions">
                <button className="secondary-action" onClick={() => setSelfRemoveBlock(null)}>OK</button>
              </div>
            </>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}

function RoleCheckboxes({ roleOptions, selected, onChange }) {
  return (
    <div className="form-field">
      <label className="form-row"><span>Roles<span className="required-mark" aria-hidden="true">*</span></span></label>
      <div className="ws-module-checks">
        {roleOptions.map((r) => (
          <label key={r.code} className="check-row">
            <input
              type="checkbox"
              checked={selected.includes(r.code)}
              onChange={() => onChange(selected.includes(r.code) ? selected.filter((c) => c !== r.code) : [...selected, r.code])}
            />
            {r.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function CreateProjectUserForm({ projectId, roleOptions, setNotice, onCreated, onCancel }) {
  const [form, setForm] = useState({ email: '', username: '', fullName: '', mobileNumber: '', roleCodes: [] });
  const [errors, setErrors] = useState({});
  const [confirmingEmail, setConfirmingEmail] = useState(false);
  const update = (f, v) => { setForm((c) => ({ ...c, [f]: v })); if (errors[f]) setErrors((e) => ({ ...e, [f]: undefined })); };

  // Login details (a temp password for a new account, or just the invite for an existing one) go
  // straight to this address with no other verification of it — so before sending, make the admin
  // look at it once, isolated from the rest of the form, instead of letting a typo slide through.
  const reviewEmail = (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.email.trim()) errs.email = 'Email is required';
    if (form.roleCodes.length === 0) errs.roleCodes = 'Select at least one role';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setConfirmingEmail(true);
  };

  const confirmAndSubmit = async () => {
    try {
      await api.createProjectUser(projectId, form);
      setNotice('User added to project — a welcome email was sent.');
      onCreated();
    } catch (err) {
      setNotice(err.message);
      setConfirmingEmail(false);
    }
  };

  if (confirmingEmail) {
    return (
      <div className="auth-form">
        <p style={{ margin: 0 }}>Login details will be emailed to:</p>
        <p style={{ fontSize: 18, fontWeight: 700, margin: '8px 0 4px', wordBreak: 'break-all' }}>{form.email}</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>Double-check this is correct — it's the only copy of their password.</p>
        <div className="modal-form-actions">
          <button type="button" className="secondary-action" onClick={() => setConfirmingEmail(false)}>Go Back &amp; Edit</button>
          <button type="button" className="primary-action modal-submit-btn" onClick={confirmAndSubmit}><Users size={15} /> Confirm &amp; Send</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={reviewEmail} className="auth-form" noValidate>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: -6 }}>
        If this email already has a Testrix account, they'll simply be added to this workspace — otherwise a new account is
        created with a temporary password, and the user is emailed either way.
      </p>
      <Field label="Email" required type="email" value={form.email} onChange={(v) => update('email', v)} error={errors.email} />
      <Field label="Username (new users only)" value={form.username} onChange={(v) => update('username', v)} />
      <Field label="Full Name (new users only)" value={form.fullName} onChange={(v) => update('fullName', v)} />
      <Field label="Mobile Number" value={form.mobileNumber} onChange={(v) => update('mobileNumber', v.replace(/\D/g, '').slice(0, 15))} />
      <RoleCheckboxes roleOptions={roleOptions} selected={form.roleCodes} onChange={(v) => update('roleCodes', v)} />
      {errors.roleCodes && <span className="field-error">{errors.roleCodes}</span>}
      <div className="modal-form-actions">
        <button type="button" className="secondary-action" onClick={onCancel}>Cancel</button>
        <button className="primary-action modal-submit-btn" type="submit"><Users size={15} /> Add User</button>
      </div>
    </form>
  );
}

function EditProjectUserForm({ projectId, member, setNotice, onSaved, onCancel }) {
  const [form, setForm] = useState({ fullName: member.displayName ?? '', mobileNumber: member.mobileNumber ?? '' });
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!form.fullName.trim()) { setError('Full name is required'); return; }
    try {
      await api.updateProjectUser(projectId, member.userId, form);
      setNotice('User updated.');
      onSaved();
    } catch (err) {
      setNotice(err.message);
    }
  };

  return (
    <form onSubmit={submit} className="auth-form">
      <Field label="Full Name" required value={form.fullName} onChange={(v) => setForm((c) => ({ ...c, fullName: v }))} error={error} />
      <Field label="Mobile Number" value={form.mobileNumber} onChange={(v) => setForm((c) => ({ ...c, mobileNumber: v.replace(/\D/g, '').slice(0, 15) }))} />
      <div className="modal-form-actions">
        <button type="button" className="secondary-action" onClick={onCancel}>Cancel</button>
        <button className="primary-action modal-submit-btn" type="submit">Save Changes</button>
      </div>
    </form>
  );
}

function AssignRolesForm({ projectId, member, roleOptions, setNotice, onSaved, onCancel }) {
  const [selected, setSelected] = useState(member.roles || []);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (selected.length === 0) { setError('Select at least one role'); return; }
    try {
      await api.assignProjectUserRoles(projectId, member.userId, selected);
      setNotice('Roles updated.');
      onSaved();
    } catch (err) {
      setNotice(err.message);
    }
  };

  return (
    <form onSubmit={submit} className="auth-form">
      <RoleCheckboxes roleOptions={roleOptions} selected={selected} onChange={setSelected} />
      {error && <span className="field-error">{error}</span>}
      <div className="modal-form-actions">
        <button type="button" className="secondary-action" onClick={onCancel}>Cancel</button>
        <button className="primary-action modal-submit-btn" type="submit">Save Roles</button>
      </div>
    </form>
  );
}

// ── Member detail panel (View action) — this workspace's own actions (Edit/Roles/Make
// Admin/Deactivate/Remove, moved here from the row so the table only ever shows one "View"
// action) plus, below, any OTHER workspace the caller also administers where this same member
// is also present — each with its own Roles/Deactivate/Remove, so a Project Admin running
// several workspaces doesn't have to switch their active one to manage a shared member. ────────
function MemberDetailPanel({ member, project, currentUsername, setNotice, onChanged, onEdit, onOpenRoles, onOpenRemove, onOpenTransfer, onSelfRemoveBlocked }) {
  const [currentStatus, setCurrentStatus] = useState(member.status);
  const [otherWorkspaces, setOtherWorkspaces] = useState(null);
  const isSelf = member.username === currentUsername;

  const loadOther = () => {
    api.sharedProjectUserWorkspaces(project.id, member.userId)
      .then((rows) => setOtherWorkspaces(rows.filter((w) => w.projectId !== project.id)))
      .catch((e) => setNotice(e.message));
  };
  useEffect(() => { loadOther(); }, [member.userId]);

  const toggleCurrent = async () => {
    try {
      await api.setProjectUserStatus(project.id, member.userId, currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE');
      setNotice(`${member.username} ${currentStatus === 'ACTIVE' ? 'deactivated' : 'activated'}.`);
      setCurrentStatus(currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE');
      onChanged();
    } catch (e) {
      setNotice(e.message);
    }
  };

  const toggleOther = async (w) => {
    try {
      await api.setProjectUserStatus(w.projectId, member.userId, w.membershipStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE');
      setNotice(`${member.username}: ${w.projectName} membership ${w.membershipStatus === 'ACTIVE' ? 'disabled' : 'enabled'}.`);
      loadOther();
    } catch (e) {
      setNotice(e.message);
    }
  };

  return (
    <>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 600 }}>{member.username}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{member.email}{member.mobileNumber ? ` · ${member.mobileNumber}` : ''}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{project.name}: {(member.roles || []).join(', ') || '—'}</div>
        </div>
        <span className={`status ${currentStatus?.toLowerCase()}`}>{currentStatus}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="action-btn edit-btn" onClick={onEdit} title="Edit"><UserPen size={13} /> Edit</button>
          <button className="action-btn" onClick={() => onOpenRoles(project.id, project.name, member.roles || [])} title="Assign roles"><KeyRound size={13} /> Roles</button>
          {currentStatus === 'ACTIVE' && !(member.roles || []).includes('PROJECT_ADMIN') && member.username !== currentUsername && (
            <button className="action-btn" onClick={onOpenTransfer} title="Transfer ownership"><Crown size={13} /> Make Admin</button>
          )}
          {currentStatus === 'ACTIVE'
            ? <button className="action-btn disable-btn" onClick={toggleCurrent} title="Deactivate"><UserMinus size={13} /> Deactivate</button>
            : <button className="action-btn enable-btn" onClick={toggleCurrent} title="Activate"><UserCheck size={13} /> Activate</button>}
          <button
            className="action-btn delete-btn"
            onClick={() => (isSelf && (member.roles || []).includes('PROJECT_ADMIN'))
              ? onSelfRemoveBlocked(true, project.name)
              : onOpenRemove(project.id, project.name)}
            title="Remove from project"
          >
            <Trash2 size={13} /> Remove
          </button>
        </div>
      </div>

      {otherWorkspaces && otherWorkspaces.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>
            Other workspaces you manage — {member.username} is there too
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {otherWorkspaces.map((w) => (
              <div key={w.projectId} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Building2 size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600 }}>{w.projectName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{w.roles.join(', ') || '—'}</div>
                </div>
                <span className={`status ${w.membershipStatus?.toLowerCase()}`}>{w.membershipStatus}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="action-btn" onClick={() => onOpenRoles(w.projectId, w.projectName, w.roles)} title="Assign roles"><KeyRound size={13} /> Roles</button>
                  {w.membershipStatus === 'ACTIVE'
                    ? <button className="action-btn disable-btn" onClick={() => toggleOther(w)} title="Deactivate"><UserMinus size={13} /> Deactivate</button>
                    : <button className="action-btn enable-btn" onClick={() => toggleOther(w)} title="Activate"><UserCheck size={13} /> Activate</button>}
                  <button
                    className="action-btn delete-btn"
                    onClick={() => (isSelf && w.roles.includes('PROJECT_ADMIN'))
                      ? onSelfRemoveBlocked(false, w.projectName)
                      : onOpenRemove(w.projectId, w.projectName)}
                    title="Remove from this workspace"
                  >
                    <Trash2 size={13} /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
