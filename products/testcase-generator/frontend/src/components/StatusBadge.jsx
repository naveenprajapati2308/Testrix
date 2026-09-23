const TONES = {
  COMPLETED: ['--success-bg-soft', '--success-text', '--success-border-soft'],
  APPROVED: ['--success-bg-soft', '--success-text', '--success-border-soft'],
  FAILED: ['--danger-bg-soft', '--danger-text', '--danger-border-soft'],
  REJECTED: ['--danger-bg-soft', '--danger-text', '--danger-border-soft'],
  PROCESSING: ['--warning-bg-soft', '--warning-text', '--warning-border-soft'],
  UPLOADED: ['--warning-bg-soft', '--warning-text', '--warning-border-soft'],
  UNDER_REVIEW: ['--warning-bg-soft', '--warning-text', '--warning-border-soft'],
};

export default function StatusBadge({ status }) {
  if (!status) return null;
  const [bg, text, border] = TONES[status] || ['--bg-hover', '--text-muted', '--border'];

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap"
      style={{ background: `var(${bg})`, color: `var(${text})`, borderColor: `var(${border})` }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
