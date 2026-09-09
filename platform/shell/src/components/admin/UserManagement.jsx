import { Building2, Eye, KeyRound, Search, Trash2, UserCheck, UserMinus, UserPen, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { ROLES } from '../../constants.js';
import { Field } from '../shared/Field.jsx';
import { Panel, DataTable, Modal, ConfirmDialog } from '../shared/index.jsx';

// ── Validation helpers ────────────────────────────────────────────────────────
const MOBILE_REGEX = /^[0-9]{10}$/;
// The platform-level `role` field only ever matters for the Super Admin distinction now — every
// other value (QA_LEAD, AUTOMATION_ENGINEER, etc.) is a per-workspace concept granted via
// project_users instead (see the "View" workspace-breakdown action), so this page's inline editor
// only offers the one platform-wide choice that's actually meaningful here.
const PLATFORM_ROLE_OPTIONS = ['SUPER_ADMIN', 'VIEWER'];

function validate(form) {
  const errors = {};
  if (!form.username?.trim()) errors.username = 'Username is required';
  if (!form.email?.trim()) errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
    errors.email = 'Enter a valid email address';
  if (!form.password?.trim()) errors.password = 'Password is required';
  else if (form.password.length < 8) errors.password = 'Password must be at least 8 characters';
  if (!form.fullName?.trim()) errors.fullName = 'Full name is required';
  if (!form.mobileNumber?.trim()) errors.mobileNumber = 'Mobile number is required';
  else if (!MOBILE_REGEX.test(form.mobileNumber.trim()))
    errors.mobileNumber = 'Enter a valid mobile number';
  if (!form.designation?.trim()) errors.designation = 'Designation is required';
  if (!form.role) errors.role = 'Role is required';
  return errors;
}

function validateEdit(form) {
  const errors = {};
  if (!form.fullName?.trim()) errors.fullName = 'Full name is required';
  if (!form.mobileNumber?.trim()) errors.mobileNumber = 'Mobile number is required';
  else if (!MOBILE_REGEX.test(form.mobileNumber.trim()))
    errors.mobileNumber = 'Enter a valid mobile number';
  if (!form.designation?.trim()) errors.designation = 'Designation is required';
  return errors;
}

// ── User Management Page ───────────────────────────────────────────────────────
export function UserManagement({ setNotice }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  // Pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const loadUsers = () => {
    setLoading(true);
    return api.adminListUsers().then(setUsers).catch((e) => setNotice(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { loadUsers(); }, []);

  const changeRole = async (id, role) => {
    try { await api.adminAssignRole(id, role); setNotice('Role updated successfully.'); await loadUsers(); }
    catch (e) { setNotice(e.message); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.adminDeleteUser(deleteTarget.id);
      setNotice(`User "${deleteTarget.username}" deleted successfully.`);
      setDeleteTarget(null);
      await loadUsers();
    } catch (e) {
      setNotice(e.message);
      setDeleteTarget(null);
    }
  };

  // Client-side filtering
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      const matchSearch = !q || u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
      const matchRole = !filterRole || u.role === filterRole;
      const matchStatus = !filterStatus || u.status === filterStatus;
      return matchSearch && matchRole && matchStatus;
    });
  }, [users, search, filterRole, filterStatus]);

  const usersWithIndices = useMemo(() => {
    return filtered.map((u, idx) => ({ ...u, index: idx + 1 }));
  }, [filtered]);

  const columns = useMemo(() => [
    {
      key: 'index',
      label: '#',
      render: (val) => <span style={{ color: 'var(--text-muted)' }}>{val}</span>
    },
    {
      key: 'username',
      label: 'Username',
      render: (val) => <strong>{val}</strong>
    },
    {
      key: 'email',
      label: 'Email',
      render: (val) => val || '-'
    },
    {
      key: 'mobileNumber',
      label: 'Mobile',
      render: (val) => val || '—'
    },
    {
      key: 'role',
      label: 'Platform Role',
      render: (val, u) => (
        <select
          value={PLATFORM_ROLE_OPTIONS.includes(val) ? val : 'VIEWER'}
          onChange={(e) => changeRole(u.id, e.target.value)}
          disabled={val === 'SUPER_ADMIN'}
          title="Platform-wide role — per-workspace roles are under View"
          className="role-select"
        >
          {PLATFORM_ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r === 'SUPER_ADMIN' ? 'Super Admin' : 'Regular User'}</option>)}
        </select>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => <span className={`status ${val?.toLowerCase()}`}>{val}</span>
    },
    {
      key: 'createdAt',
      label: 'Created',
      render: (val) => val ? new Date(val).toLocaleDateString() : '—'
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, u) => (
        <button className="action-btn" onClick={() => setViewTarget(u)} title="View & manage this user">
          <Eye size={12} /> View
        </button>
      )
    }
  ], [users]);

  return (
    <section className="page-grid" style={{ gridTemplateColumns: '1fr' }}>
      <Panel title="User Management">
        {/* Toolbar */}
        <div className="um-toolbar">
          <button className="primary-action um-create-btn" onClick={() => setShowCreate(true)}>
            <Users size={15} /> Create User
          </button>
          <span className="um-count">{filtered.length} user{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Filters */}
        <div className="um-filters">
          <div className="um-search-box">
            <Search size={15} />
            <input
              placeholder="Search by username or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="um-filter-select">
            <option value="">All Roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="um-filter-select">
            <option value="">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="DISABLED">DISABLED</option>
          </select>
          {(search || filterRole || filterStatus) && (
            <button className="um-clear-btn" onClick={() => { setSearch(''); setFilterRole(''); setFilterStatus(''); }}>
              Clear
            </button>
          )}
        </div>

        <DataTable
          columns={columns}
          data={usersWithIndices}
          loading={loading}
          searchPlaceholder="Filter users..."
          exportFilename="users_list.csv"
        />
      </Panel>

      {/* ── Modals ── */}
      {showCreate && (
        <Modal title="Create New User" onClose={() => setShowCreate(false)} closeOnBackdrop={false}>
          <CreateUserForm
            setNotice={setNotice}
            onCreated={() => { setShowCreate(false); loadUsers(); }}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {editUser && (
        <Modal title={`Edit User — ${editUser.username}`} onClose={() => setEditUser(null)} closeOnBackdrop={false}>
          <EditUserForm
            user={editUser}
            setNotice={setNotice}
            onSaved={() => { setEditUser(null); loadUsers(); }}
            onCancel={() => setEditUser(null)}
          />
        </Modal>
      )}

      {viewTarget && (
        <Modal title={`Manage User — ${viewTarget.username}`} onClose={() => setViewTarget(null)} closeOnBackdrop={false}>
          <UserDetailPanel
            user={viewTarget}
            setNotice={setNotice}
            onChanged={loadUsers}
            onEdit={() => { setViewTarget(null); setEditUser(viewTarget); }}
            onResetPassword={() => { setViewTarget(null); setResetTarget(viewTarget); }}
            onDelete={() => { setViewTarget(null); setDeleteTarget(viewTarget); }}
          />
        </Modal>
      )}

      {resetTarget && (
        <Modal title={`Reset Password — ${resetTarget.username}`} onClose={() => setResetTarget(null)} closeOnBackdrop={false}>
          <ResetPasswordForm
            userId={resetTarget.id}
            setNotice={setNotice}
            onDone={() => setResetTarget(null)}
            onCancel={() => setResetTarget(null)}
          />
        </Modal>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <ConfirmDialog onClose={() => setDeleteTarget(null)}>
          <div className="confirm-icon"><Trash2 size={30} /></div>
          <h3>Delete User?</h3>
          <p>Are you sure you want to delete <strong>{deleteTarget.username}</strong>?</p>
          <p className="confirm-warning">This action cannot be reverted.</p>
          <div className="confirm-actions">
            <button className="secondary-action" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="danger-action" onClick={confirmDelete}>Delete</button>
          </div>
        </ConfirmDialog>
      )}
    </section>
  );
}

// ── Create User Form ──────────────────────────────────────────────────────────
function CreateUserForm({ setNotice, onCreated, onCancel }) {
  const [form, setForm] = useState({
    username: '', email: '', password: '', fullName: '',
    mobileNumber: '', designation: '', organization: '', role: 'VIEWER'
  });
  const [errors, setErrors] = useState({});
  const update = (f, v) => {
    setForm((c) => ({ ...c, [f]: v }));
    // Clear error on change
    if (errors[f]) setErrors((e) => { const n = { ...e }; delete n[f]; return n; });
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      await api.adminCreateUser(form);
      setNotice('User created successfully.');
      onCreated();
    } catch (err) {
      setNotice(err.message);
    }
  };

  return (
    <form onSubmit={submit} className="auth-form" noValidate>
      <Field label="Username" required value={form.username} onChange={(v) => update('username', v)} error={errors.username} />
      <Field label="Email" required type="email" value={form.email} onChange={(v) => update('email', v)} error={errors.email} />
      <Field label="Password" required type="password" value={form.password} onChange={(v) => update('password', v)} error={errors.password} />
      <Field label="Mobile Number" required value={form.mobileNumber} onChange={(v) => update('mobileNumber', v.replace(/\D/g, '').slice(0, 15))} error={errors.mobileNumber} inputMode="numeric" />
      <Field label="Full Name" required value={form.fullName} onChange={(v) => update('fullName', v)} error={errors.fullName} />
      <Field label="Designation" required value={form.designation} onChange={(v) => update('designation', v)} error={errors.designation} />
      <Field label="Organization" value={form.organization} onChange={(v) => update('organization', v)} />
      <div className={`form-field${errors.role ? ' has-error' : ''}`}>
        <label className="form-row">
          <span>Role<span className="required-mark" aria-hidden="true">*</span></span>
          <select value={form.role} onChange={(e) => update('role', e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        {errors.role && <span className="field-error">{errors.role}</span>}
      </div>
      <div className="modal-form-actions">
        <button type="button" className="secondary-action" onClick={onCancel}>Cancel</button>
        <button className="primary-action modal-submit-btn" type="submit">
          <Users size={15} /> Create User
        </button>
      </div>
    </form>
  );
}

// ── Edit User Form ────────────────────────────────────────────────────────────
function EditUserForm({ user, setNotice, onSaved, onCancel }) {
  const [form, setForm] = useState({
    fullName: user.displayName ?? '',
    mobileNumber: user.mobileNumber ?? '',
    designation: user.designation ?? '',
    organization: user.organization ?? ''
  });
  const [errors, setErrors] = useState({});
  const update = (f, v) => {
    setForm((c) => ({ ...c, [f]: v }));
    if (errors[f]) setErrors((e) => { const n = { ...e }; delete n[f]; return n; });
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateEdit(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      await api.adminUpdateUser(user.id, form);
      setNotice('User updated.');
      onSaved();
    } catch (err) {
      setNotice(err.message);
    }
  };

  return (
    <form onSubmit={submit} className="auth-form">
      <Field label="Full Name" required value={form.fullName} onChange={(v) => update('fullName', v)} error={errors.fullName} />
      <Field label="Mobile Number" required value={form.mobileNumber} onChange={(v) => update('mobileNumber', v.replace(/\D/g, '').slice(0, 10))} error={errors.mobileNumber} inputMode="numeric" />
      <Field label="Designation" required value={form.designation} onChange={(v) => update('designation', v)} error={errors.designation} />
      <Field label="Organization" value={form.organization} onChange={(v) => update('organization', v)} />
      <div className="modal-form-actions">
        <button type="button" className="secondary-action" onClick={onCancel}>Cancel</button>
        <button className="primary-action modal-submit-btn" type="submit">Save Changes</button>
      </div>
    </form>
  );
}

// ── Reset Password Form ───────────────────────────────────────────────────────
function ResetPasswordForm({ userId, setNotice, onDone, onCancel }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!newPassword || newPassword.length < 8) errs.newPassword = 'Password must be at least 8 characters';
    if (newPassword !== confirmPassword) errs.confirmPassword = 'Passwords do not match';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      await api.adminResetPassword(userId, { newPassword });
      setNotice('Password reset successfully.');
      onDone();
    } catch (err) {
      setNotice(err.message);
    }
  };

  return (
    <form onSubmit={submit} className="auth-form">
      <Field label="New Password" required type="password" value={newPassword} onChange={setNewPassword} error={errors.newPassword} />
      <Field label="Confirm New Password" required type="password" value={confirmPassword} onChange={setConfirmPassword} error={errors.confirmPassword} />
      <div className="modal-form-actions">
        <button type="button" className="secondary-action" onClick={onCancel}>Cancel</button>
        <button className="primary-action modal-submit-btn" type="submit">
          <KeyRound size={15} /> Reset Password
        </button>
      </div>
    </form>
  );
}

// ── User detail panel (View action) — account-level actions (Edit/Reset Pwd/Disable/Delete,
// moved here from the main table's row so that table only ever shows one "View" action) plus
// every workspace this user belongs to, their role(s) in each, and workspace-scoped
// disable/remove (reusing the same endpoints Project Admins use for their own team, per
// docs/version2.1.md — Super Admin is allowed to call them for any project). ─────────────────
function UserDetailPanel({ user, setNotice, onChanged, onEdit, onResetPassword, onDelete }) {
  const [account, setAccount] = useState(user);
  const [memberships, setMemberships] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);

  const load = () => {
    api.adminGetUser(user.id).then(setAccount).catch((e) => setNotice(e.message));
    api.adminGetUserWorkspaces(user.id).then(setMemberships).catch((e) => setNotice(e.message));
  };
  useEffect(() => { load(); }, [user.id]);

  const toggleAccountStatus = async () => {
    try {
      if (account.status === 'ACTIVE') await api.adminDisableUser(user.id);
      else await api.adminEnableUser(user.id);
      setNotice(`User ${account.status === 'ACTIVE' ? 'disabled' : 'enabled'}.`);
      load();
      onChanged();
    } catch (e) {
      setNotice(e.message);
    }
  };

  const toggleStatus = async (m) => {
    try {
      await api.setProjectUserStatus(m.projectId, user.id, m.membershipStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE');
      setNotice(`${m.projectName}: membership ${m.membershipStatus === 'ACTIVE' ? 'disabled' : 'enabled'}.`);
      await load();
    } catch (e) {
      setNotice(e.message);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    try {
      await api.removeProjectUser(removeTarget.projectId, user.id);
      setNotice(`Removed from ${removeTarget.projectName}.`);
      setRemoveTarget(null);
      await load();
    } catch (e) {
      setNotice(e.message);
      setRemoveTarget(null);
    }
  };

  return (
    <>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 600 }}>{account.email}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{account.mobileNumber || '—'}</div>
        </div>
        <span className={`status ${account.status?.toLowerCase()}`}>{account.status}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="action-btn edit-btn" onClick={onEdit} title="Edit user"><UserPen size={13} /> Edit</button>
          <button className="action-btn reset-btn" onClick={onResetPassword} title="Reset password"><KeyRound size={13} /> Reset Pwd</button>
          {account.status === 'ACTIVE'
            ? <button className="action-btn disable-btn" onClick={toggleAccountStatus} disabled={account.role === 'SUPER_ADMIN'} title="Disable user"><UserMinus size={13} /> Disable</button>
            : <button className="action-btn enable-btn" onClick={toggleAccountStatus} title="Enable user"><UserCheck size={13} /> Enable</button>}
          <button
            className="action-btn delete-btn"
            onClick={onDelete}
            disabled={account.role === 'SUPER_ADMIN'}
            title={account.role === 'SUPER_ADMIN' ? 'Super admin can not be deleted' : 'Delete user'}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>
        Workspaces
      </div>

      {memberships === null ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : memberships.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>Not a member of any workspace.</p>
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {memberships.map((m) => (
          <div key={m.projectId} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Building2 size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: 600 }}>{m.projectName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.roles.join(', ') || '—'}</div>
            </div>
            <span className={`status ${m.membershipStatus?.toLowerCase()}`}>{m.membershipStatus}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {m.membershipStatus === 'ACTIVE'
                ? <button className="action-btn disable-btn" onClick={() => toggleStatus(m)} title="Disable in this workspace"><UserMinus size={13} /> Disable</button>
                : <button className="action-btn enable-btn" onClick={() => toggleStatus(m)} title="Enable in this workspace"><UserCheck size={13} /> Enable</button>}
              <button className="action-btn delete-btn" onClick={() => setRemoveTarget(m)} title="Remove from this workspace"><Trash2 size={13} /> Remove</button>
            </div>
          </div>
        ))}
      </div>
      )}

      {removeTarget && (
        <ConfirmDialog onClose={() => setRemoveTarget(null)}>
          <div className="confirm-icon"><Trash2 size={30} /></div>
          <h3>Remove from Workspace?</h3>
          <p>Remove this user from <strong>{removeTarget.projectName}</strong>?</p>
          <div className="confirm-actions">
            <button className="secondary-action" onClick={() => setRemoveTarget(null)}>Cancel</button>
            <button className="danger-action" onClick={confirmRemove}>Remove</button>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}

// ── Field with inline error ───────────────────────────────────────────────────
