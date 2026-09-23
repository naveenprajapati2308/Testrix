import { DIRTY_MESSAGES } from '../../../../shared/ui/iframe-dirty-state.js';

/**
 * Tracks whether the embedded product currently holds unsaved edits, and can ask it to save or
 * discard them. A module singleton rather than React state because the only consumer is the
 * workspace switcher buried inside the Topbar — threading a prop down for this would touch three
 * components that otherwise have nothing to do with it.
 */

let dirty = false;
let dirtySource = null;
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn(dirty));

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== DIRTY_MESSAGES.DIRTY) return;
    dirty = !!event.data.dirty;
    dirtySource = dirty ? event.source : null;
    notify();
  });
}

export function isDirty() {
  return dirty;
}

export function subscribeDirty(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A product that unmounts or navigates away can leave a stale flag behind. */
export function clearDirty() {
  if (!dirty) return;
  dirty = false;
  dirtySource = null;
  notify();
}

const target = () => dirtySource || document.querySelector('iframe')?.contentWindow;

/** Resolves { ok, message }. Times out rather than hanging the switcher on a wedged iframe. */
export function requestSave(timeoutMs = 20000) {
  return new Promise((resolve) => {
    const win = target();
    if (!win) {
      resolve({ ok: false, message: 'The page with unsaved changes is no longer open' });
      return;
    }

    const done = (result) => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(result);
    };
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== DIRTY_MESSAGES.SAVE_RESULT) return;
      done({ ok: !!event.data.ok, message: event.data.message });
    };
    const timer = setTimeout(() => done({ ok: false, message: 'Saving timed out' }), timeoutMs);

    window.addEventListener('message', onMessage);
    win.postMessage({ type: DIRTY_MESSAGES.SAVE_REQUEST }, window.location.origin);
  });
}

/** Drops the product's pending edits so the reload that follows raises no second prompt. */
export function discardChanges() {
  target()?.postMessage({ type: DIRTY_MESSAGES.DISCARD }, window.location.origin);
  clearDirty();
}
