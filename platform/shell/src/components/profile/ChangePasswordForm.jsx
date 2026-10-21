import { X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api.js';
import { Field } from '../shared/Field.jsx';
import { notify } from '../../../../../shared/ui/NotificationProvider.jsx';

// ── Change Password Form ───────────────────────────────────────────────────────
export function ChangePasswordForm({ setNotice, onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [formError, setFormError] = useState('');
  const update = (f, v) => {
    setFormError('');
    setForm((c) => ({ ...c, [f]: v }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      const message = 'New passwords do not match.';
      setFormError(message);
      notify.error(message);
      return;
    }
    try {
      await api.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      notify.success('Password changed successfully.');
      onClose();
    } catch (err) {
      setFormError(err.message);
      notify.error(err.message || 'Failed to change password.');
    }
  };

  return (
    <div className="inline-form-box">
      <div className="inline-form-title">
        Change Password <button className="close-btn" onClick={onClose}><X size={14} /></button>
      </div>
      <form onSubmit={submit} className="auth-form">
        <Field label="Current Password" type="password" value={form.currentPassword} onChange={(v) => update('currentPassword', v)} />
        <Field label="New Password"     type="password" value={form.newPassword}     onChange={(v) => update('newPassword', v)} />
        <Field label="Confirm Password" type="password" value={form.confirmPassword} onChange={(v) => update('confirmPassword', v)} error={formError} />
        <button className="primary-action" type="submit">Update Password</button>
      </form>
    </div>
  );
}
