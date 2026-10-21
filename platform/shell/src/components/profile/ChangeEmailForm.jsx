import { X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api.js';
import { Field } from '../shared/Field.jsx';
import { notify } from '../../../../../shared/ui/NotificationProvider.jsx';

// ── Change Email Form ─────────────────────────────────────────────────────────
export function ChangeEmailForm({ setNotice, onClose, emailOtp, setEmailOtp }) {
  const [newEmail, setNewEmail] = useState('');
  const [otp, setOtp]           = useState('');
  const [step, setStep]         = useState('request');
  const [formError, setFormError] = useState('');

  const requestOtp = async (e) => {
    e.preventDefault();
    setFormError('');
    try {
      const data = await api.requestEmailChange({ newEmail });
      setEmailOtp(data.otp);
      setStep('verify');
      notify.info('OTP generated. Use the verification code shown.');
    } catch (err) {
      setFormError(err.message);
      notify.error(err.message || 'Failed to request email change OTP.');
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setFormError('');
    try {
      await api.verifyEmailChange({ newEmail, otp });
      notify.success('Email changed successfully.');
      setEmailOtp(null);
      onClose();
    } catch (err) {
      setFormError(err.message);
      notify.error(err.message || 'Failed to verify OTP.');
    }
  };

  return (
    <div className="inline-form-box">
      <div className="inline-form-title">
        Change Email <button className="close-btn" onClick={onClose}><X size={14} /></button>
      </div>
      {step === 'request' ? (
        <form onSubmit={requestOtp} className="auth-form">
          <Field label="New Email" type="email" value={newEmail} onChange={(value) => { setNewEmail(value); setFormError(''); }} error={formError} />
          <button className="primary-action" type="submit">Send OTP</button>
        </form>
      ) : (
        <form onSubmit={verify} className="auth-form">
          <Field label="New Email" type="email" value={newEmail} onChange={(value) => { setNewEmail(value); setFormError(''); }} error={!otp ? formError : 
            ''} />
          {emailOtp && (
            <div className="otp-reveal">
              <span className="otp-label">Your OTP Code</span>
              <span className="otp-code">{emailOtp}</span>
              <span className="otp-hint">Copy and paste into the field below.</span>
            </div>
          )}
          <Field label="OTP Code" value={otp} onChange={(value) => { setOtp(value); setFormError(''); }} error={otp ? formError : ''} />
          <button className="primary-action" type="submit">Verify &amp; Update Email</button>
        </form>
      )}
    </div>
  );
}
