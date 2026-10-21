import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  HelpCircle,
  Trash2
} from 'lucide-react';
import './notifications.css';

// ── Global Singleton Dispatcher ───────────────────────────────────────────────
// Allows direct functional calls: notify.success("Saved!"), await confirmDialog(...)
// from any file without needing a React hook.
let globalDispatch = {
  addToast: () => {},
  showConfirm: () => Promise.resolve(false)
};

export const notify = {
  success: (message, titleOrOpts, opts) => {
    const options = typeof titleOrOpts === 'object' ? titleOrOpts : (opts || {});
    const title = typeof titleOrOpts === 'string' ? titleOrOpts : (options.title || 'Success');
    globalDispatch.addToast({ type: 'success', title, message: String(message || ''), ...options });
  },
  error: (message, titleOrOpts, opts) => {
    const options = typeof titleOrOpts === 'object' ? titleOrOpts : (opts || {});
    const title = typeof titleOrOpts === 'string' ? titleOrOpts : (options.title || 'Error');
    globalDispatch.addToast({ type: 'error', title, message: String(message || ''), ...options });
  },
  warning: (message, titleOrOpts, opts) => {
    const options = typeof titleOrOpts === 'object' ? titleOrOpts : (opts || {});
    const title = typeof titleOrOpts === 'string' ? titleOrOpts : (options.title || 'Warning');
    globalDispatch.addToast({ type: 'warning', title, message: String(message || ''), ...options });
  },
  info: (message, titleOrOpts, opts) => {
    const options = typeof titleOrOpts === 'object' ? titleOrOpts : (opts || {});
    const title = typeof titleOrOpts === 'string' ? titleOrOpts : (options.title || 'Information');
    globalDispatch.addToast({ type: 'info', title, message: String(message || ''), ...options });
  }
};

export const confirmDialog = (options) => {
  return globalDispatch.showConfirm(options);
};

const NotificationContext = createContext({ notify, confirmDialog });
export const useNotification = () => useContext(NotificationContext);

// ── Toast Item Component ──────────────────────────────────────────────────────
function ToastItem({ toast, onDismiss }) {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);

  const duration = toast.duration ?? 4000;
  const startTimeRef = useRef(Date.now());
  const remainingTimeRef = useRef(duration);
  const animFrameRef = useRef(null);

  const dismiss = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(toast.id);
    }, 180);
  }, [isExiting, onDismiss, toast.id]);

  useEffect(() => {
    if (duration <= 0) return;

    const tick = () => {
      if (!isPaused) {
        const elapsed = Date.now() - startTimeRef.current;
        const left = Math.max(0, remainingTimeRef.current - elapsed);
        setProgress((left / duration) * 100);

        if (left <= 0) {
          dismiss();
          return;
        }
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [dismiss, duration, isPaused]);

  const handleMouseEnter = () => {
    setIsPaused(true);
    remainingTimeRef.current = Math.max(0, remainingTimeRef.current - (Date.now() - startTimeRef.current));
  };

  const handleMouseLeave = () => {
    startTimeRef.current = Date.now();
    setIsPaused(false);
  };

  const IconComponent = toast.type === 'success'
    ? CheckCircle2
    : toast.type === 'error'
    ? AlertCircle
    : toast.type === 'warning'
    ? AlertTriangle
    : Info;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`testrix-toast testrix-toast-${toast.type} ${isExiting ? 'testrix-toast-exiting' : ''}`}
      onClick={dismiss}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="testrix-toast-icon-wrapper">
        <IconComponent size={16} />
      </div>
      <div className="testrix-toast-content">
        {toast.title && <div className="testrix-toast-title">{toast.title}</div>}
        <div className="testrix-toast-message">{toast.message}</div>
      </div>
      <button
        type="button"
        className="testrix-toast-close"
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>

      {duration > 0 && (
        <div
          className="testrix-toast-progress-bar"
          style={{ width: `${progress}%` }}
        />
      )}
    </div>
  );
}

// ── Notification & Confirmation Provider ──────────────────────────────────────
export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null); // { title, message, confirmText, cancelText, danger, resolve }
  const [isClosingConfirm, setIsClosingConfirm] = useState(false);
  const previouslyFocusedElementRef = useRef(null);
  const confirmBtnRef = useRef(null);

  const addToast = useCallback((toastData) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 7);
    setToasts((prev) => {
      const next = [...prev, { ...toastData, id }];
      // Keep maximum of 4 visible toasts
      if (next.length > 4) {
        return next.slice(next.length - 4);
      }
      return next;
    });
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showConfirm = useCallback((options) => {
    previouslyFocusedElementRef.current = document.activeElement;
    return new Promise((resolve) => {
      setConfirmState({
        title: options?.title || 'Are you sure?',
        message: options?.message || 'Please confirm to proceed.',
        confirmText: options?.confirmText || 'Confirm',
        cancelText: options?.cancelText || 'Cancel',
        danger: options?.danger ?? true,
        resolve
      });
    });
  }, []);

  // Bind singleton
  useEffect(() => {
    globalDispatch = {
      addToast,
      showConfirm
    };
  }, [addToast, showConfirm]);

  const closeConfirm = useCallback((result) => {
    if (!confirmState) return;
    setIsClosingConfirm(true);
    setTimeout(() => {
      confirmState.resolve(result);
      setConfirmState(null);
      setIsClosingConfirm(false);
      if (previouslyFocusedElementRef.current?.focus) {
        previouslyFocusedElementRef.current.focus();
      }
    }, 180);
  }, [confirmState]);

  // Trap focus and ESC key on confirm dialog
  useEffect(() => {
    if (!confirmState) return;
    confirmBtnRef.current?.focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeConfirm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmState, closeConfirm]);

  return (
    <NotificationContext.Provider value={{ notify, confirmDialog }}>
      {children}

      {/* ── Toast Container ─────────────────────────────────────────────── */}
      <div className="testrix-toast-container" aria-label="Notifications">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>

      {/* ── Confirmation Dialog Modal ────────────────────────────────────── */}
      {confirmState && (
        <div
          className={`testrix-dialog-backdrop ${isClosingConfirm ? 'testrix-dialog-closing' : ''}`}
          onClick={() => closeConfirm(false)}
        >
          <div
            className={`testrix-dialog-panel ${isClosingConfirm ? 'testrix-dialog-closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="testrix-confirm-title"
          >
            <div className="testrix-dialog-header">
              <div className={`testrix-dialog-icon ${confirmState.danger ? 'danger' : 'info'}`}>
                {confirmState.danger ? <Trash2 size={20} /> : <HelpCircle size={20} />}
              </div>
              <div className="testrix-dialog-title-group">
                <h3 id="testrix-confirm-title">{confirmState.title}</h3>
                <p>{confirmState.message}</p>
              </div>
            </div>

            <div className="testrix-dialog-footer">
              <button
                type="button"
                className="testrix-dialog-btn testrix-dialog-btn-cancel"
                onClick={() => closeConfirm(false)}
              >
                {confirmState.cancelText}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                className={`testrix-dialog-btn ${confirmState.danger ? 'testrix-dialog-btn-danger' : 'testrix-dialog-btn-primary'}`}
                onClick={() => closeConfirm(true)}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
}
