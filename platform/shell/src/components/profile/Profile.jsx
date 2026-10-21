import {
  Activity,
  BadgeCheck,
  Briefcase,
  Building2,
  Calendar,
  Clock,
  KeyRound,
  LogIn,
  Mail,
  MonitorSmartphone,
  Pencil,
  Phone,
  Shield,
  ShieldCheck,
  Trash2,
  Upload,
  UserCircle,
  UserRound,
  UserRoundPen,
  Zap
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api.js';
import { Field } from '../shared/Field.jsx';
import { Modal } from '../shared/index.jsx';
import { ChangeEmailForm } from './ChangeEmailForm.jsx';
import { ChangePasswordForm } from './ChangePasswordForm.jsx';
import './profile.css';
import { Loader } from '../../../../../shared/ui/Loader.jsx';
import { notify } from '../../../../../shared/ui/NotificationProvider.jsx';

// ── Time helpers ───────────────────────────────────────────────────────────────
function formatDateTime(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d)) return String(raw);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ── Profile Page ───────────────────────────────────────────────────────────────
// Project role beats the vestigial platform UserRole (almost always VIEWER — see
// WorkspaceProvisioningService.approve()) for display: it's the role that actually governs
// what this user can do inside their project.
const PROJECT_ROLE_PRIORITY = ['PROJECT_ADMIN', 'QA_LEAD', 'TECH_LEAD', 'AUTOMATION_ENGINEER', 'VIEWER'];

function displayRole(profile, project) {
  const projectRole = project?.roles?.length
    ? PROJECT_ROLE_PRIORITY.find((r) => project.roles.includes(r)) || project.roles[0]
    : null;
  return projectRole || profile?.role || '';
}

export function Profile({ setNotice, onProfileSaved, project }) {
  const [profile, setProfile] = useState(null);
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState({});
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [emailOtp, setEmailOtp] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editErrors, setEditErrors] = useState({});
  const fileRef = useRef();

  const load = async () => {
    const [profileData, auditData] = await Promise.all([api.profile(), api.auditLogs()]);
    setProfile(profileData);
    setLogs(Array.isArray(auditData) ? auditData : []);
    setForm({
      fullName: profileData.displayName ?? '',
      mobileNumber: profileData.mobileNumber ?? '',
      designation: profileData.designation ?? '',
      organization: profileData.organization ?? '',
      profileImagePath: profileData.profileImagePath ?? ''
    });
    setPreviewUrl(profileData.profileImagePath ?? null);
  };

  useEffect(() => { load().catch((err) => notify.error(err.message || 'Failed to load profile.')); }, []);

  const updateEditField = (field, value) => {
    setForm((c) => ({ ...c, [field]: value }));
    // Typing again clears that field's validation message.
    setEditErrors((c) => (c[field] ? { ...c, [field]: undefined } : c));
  };

  const validateEdit = () => {
    const next = {};
    if (!(form.fullName || '').trim()) next.fullName = 'Full name is required.';
    const mobile = (form.mobileNumber || '').trim();
    if (!mobile) next.mobileNumber = 'Mobile number is required.';
    else if (!/^[6-9]\d{9}$/.test(mobile)) next.mobileNumber = 'Enter a valid 10-digit mobile number starting with 6-9.';
    if (!(form.designation || '').trim()) next.designation = 'Designation is required.';
    if (!(form.organization || '').trim()) next.organization = 'Organization is required.';
    setEditErrors(next);
    return Object.keys(next).every((key) => !next[key]);
  };

  const save = async () => {
    if (!validateEdit()) return;
    try {
      const updated = await api.updateProfile(form);
      setProfile(updated);
      notify.success('Profile updated successfully.');
      setEditing(false);
      onProfileSaved?.({
        displayName: updated.displayName,
        profileImagePath: updated.profileImagePath
      });
      await load();
    } catch (error) {
      notify.error(error.message || 'Failed to update profile.');
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    try {
      const data = await api.uploadProfileImage(file);
      setForm((f) => ({ ...f, profileImagePath: data.profileImagePath }));
      onProfileSaved?.({ profileImagePath: data.profileImagePath });
      notify.success('Profile picture updated successfully.');
    } catch (err) {
      notify.error(err.message || 'Failed to upload photo.');
    } finally {
      setUploading(false);
    }
  };

  // Activity summary counts (from the recent audit trail)
  const stats = useMemo(() => {
    const count = (...actions) => logs.filter((l) => actions.includes(l.action)).length;
    return {
      logins: count('LOGIN'),
      profileUpdates: count('PROFILE_UPDATE'),
      passwordChanges: count('PASSWORD_CHANGE', 'PASSWORD_RESET'),
    };
  }, [logs]);

  if (!profile) return <div style={{ padding: '48px', display: 'grid', placeItems: 'center' }}><Loader size={32} label="Loading account information…" /></div>;

  const isActive = profile.status === 'ACTIVE';
  const roleLabel = displayRole(profile, project);

  const infoRows = [
    { icon: UserRound, label: 'Full Name', value: profile.displayName || '—' },
    { icon: Mail, label: 'Email Address', value: profile.email },
    { icon: Phone, label: 'Mobile Number', value: profile.mobileNumber || '—' },
    { icon: Briefcase, label: 'Designation', value: profile.designation || '—' },
    { icon: Building2, label: 'Organization', value: profile.organization || '—' },
    { icon: Shield, label: 'Role', value: <span className="pf-badge pf-badge-role">{roleLabel}</span> },
    { icon: Activity, label: 'Status', value: <span className="pf-badge pf-badge-status">{profile.status}</span> },
    { icon: Calendar, label: 'Member Since', value: formatDateTime(profile.createdAt) },
    { icon: Clock, label: 'Last Login', value: formatDateTime(profile.lastLogin) }
  ];

  return (
    <section className="pf-page">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="pf-hero">
        <div className="pf-hero-avatar" onClick={() => fileRef.current.click()} title="Click to change photo">
          <div className="pf-avatar-inner">
            {previewUrl
              ? <img src={previewUrl} alt="Profile" />
              : <UserCircle size={62} strokeWidth={1.2} />}
          </div>
          <div className="pf-avatar-overlay">
            <span><Upload size={16} /></span>
            {uploading ? 'Uploading…' : 'Change Photo'}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

        <div className="pf-hero-main">
          <h2 className="pf-hero-name">
            {profile.displayName || profile.username}
            <BadgeCheck size={22} />
          </h2>
          <div className="pf-chips">
            <div className="pf-chip">
              <strong>{profile.designation || '—'}</strong>
              <span>Designation</span>
            </div>
            <div className="pf-chip">
              <strong>{profile.organization || '—'}</strong>
              <span>Organization</span>
            </div>
            <div className="pf-chip pf-chip-role">
              <strong>{roleLabel}</strong>
              <span>Role</span>
            </div>
          </div>
        </div>

        <div className="pf-hero-actions">
          <button className="pf-edit-btn" onClick={() => { setEditErrors({}); setEditing(true); }}>
            <Pencil size={14} />
            Edit Profile
          </button>
          <span className={`pf-status-pill${isActive ? '' : ' pf-status-off'}`}>
            <span className="pf-dot" />
            {isActive ? 'Active' : profile.status}
          </span>
        </div>
      </div>

      {/* ── Info + Actions grid ───────────────────────────────────────────── */}
      <div className="pf-grid">
        <div className="pf-card">
          <h3 className="pf-card-title"><UserRoundPen size={17} /> Account Information</h3>
          {infoRows.map(({ icon: Icon, label, value }) => (
            <div className="pf-info-row" key={label}>
              <span className="pf-info-label"><Icon size={15} /> {label}</span>
              <span className="pf-info-value">{value}</span>
            </div>
          ))}
        </div>

        <div className="pf-right">
          <div className="pf-card">
            <h3 className="pf-card-title"><Zap size={17} /> Quick Actions</h3>
            <div className="pf-actions-grid">
              <button className="pf-action-tile pf-action-violet" onClick={() => setShowChangePassword(true)}>
                <KeyRound size={22} />
                Change Password
              </button>
              <button className="pf-action-tile pf-action-blue" onClick={() => setShowChangeEmail(true)}>
                <Mail size={22} />
                Change Email
              </button>
              <button
                className="pf-action-tile pf-action-red"
                onClick={() => setNotice('Account deletion is not available for this account.')}
              >
                <Trash2 size={22} />
                Delete Account
              </button>
            </div>
          </div>

          <div className="pf-card">
            <h3 className="pf-card-title"><ShieldCheck size={17} /> Activity Summary</h3>
            <div className="pf-stats-grid">
              <div className="pf-stat-tile">
                <span className="pf-stat-icon pf-stat-blue"><LogIn size={17} /></span>
                <div className="pf-stat-value">{stats.logins}</div>
                <div className="pf-stat-label">Total Logins</div>
              </div>
              <div className="pf-stat-tile">
                <span className="pf-stat-icon pf-stat-green"><UserRoundPen size={17} /></span>
                <div className="pf-stat-value">{stats.profileUpdates}</div>
                <div className="pf-stat-label">Profile Updates</div>
              </div>
              <div className="pf-stat-tile">
                <span className="pf-stat-icon pf-stat-amber"><KeyRound size={17} /></span>
                <div className="pf-stat-value">{stats.passwordChanges}</div>
                <div className="pf-stat-label">Password Changes</div>
              </div>
              <div className="pf-stat-tile">
                <span className="pf-stat-icon pf-stat-purple"><MonitorSmartphone size={17} /></span>
                <div className="pf-stat-value">1</div>
                <div className="pf-stat-label">Active Sessions</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Edit Profile modal ────────────────────────────────────────────── */}
      {editing && (
        <Modal title="Edit Profile" onClose={() => { setEditing(false); setEditErrors({}); }}>
          <Field label="Full Name" required value={form.fullName} onChange={(v) => updateEditField('fullName', v)} error={editErrors.fullName} />
          <Field label="Mobile Number" required value={form.mobileNumber} onChange={(v) => updateEditField('mobileNumber', v)} error={editErrors.mobileNumber} />
          <Field label="Designation" required value={form.designation} onChange={(v) => updateEditField('designation', v)} error={editErrors.designation} />
          <Field label="Organization" required value={form.organization} onChange={(v) => updateEditField('organization', v)} error={editErrors.organization} />
          <button className="primary-action" onClick={save} style={{ marginTop: 12 }}>Save &amp; Close</button>
        </Modal>
      )}

      {showChangePassword && (
        <div className="pf-card">
          <ChangePasswordForm setNotice={setNotice} onClose={() => setShowChangePassword(false)} />
        </div>
      )}
      {showChangeEmail && (
        <div className="pf-card">
          <ChangeEmailForm
            setNotice={setNotice}
            onClose={() => setShowChangeEmail(false)}
            
            emailOtp={emailOtp}
            setEmailOtp={setEmailOtp}
          />
        </div>
      )}

    </section>
  );
}
