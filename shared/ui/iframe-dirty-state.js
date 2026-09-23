/**
 * Lets an embedded product tell the shell it holds unsaved edits, and lets the shell ask it to
 * save (or drop them) before doing something destructive like switching workspace.
 *
 * The shell owns the workspace switcher but the unsaved work lives inside the product iframe, so
 * without this channel the shell can only fall back on the browser's native beforeunload prompt —
 * which fires *after* the session has already been swapped, leaving the page showing one
 * workspace's rows while the token points at another.
 */

const DIRTY = 'testrix:dirty';
const SAVE_REQUEST = 'testrix:save-request';
const SAVE_RESULT = 'testrix:save-result';
const DISCARD = 'testrix:discard';

const embedded = () => typeof window !== 'undefined' && window.self !== window.top;

/** Called by the product whenever its unsaved-changes state flips. */
export function reportDirtyToParent(dirty) {
  if (!embedded()) return;
  window.parent.postMessage({ type: DIRTY, dirty: !!dirty }, window.location.origin);
}

/**
 * Registers how this product saves when the shell asks. `handler` returns true on success.
 * `onDiscard` drops the pending edits so the reload that follows is clean.
 */
export function onParentSaveRequest(handler, onDiscard) {
  if (!embedded()) return () => {};

  const listener = async (event) => {
    if (event.origin !== window.location.origin) return;

    if (event.data?.type === DISCARD) {
      onDiscard?.();
      // The shell reloads next; reporting clean first stops beforeunload firing a second prompt.
      reportDirtyToParent(false);
      return;
    }

    if (event.data?.type !== SAVE_REQUEST) return;
    let ok = false;
    let message = null;
    try {
      ok = (await handler()) !== false;
    } catch (e) {
      message = e?.message || 'Save failed';
    }
    if (ok) reportDirtyToParent(false);
    window.parent.postMessage({ type: SAVE_RESULT, ok, message }, window.location.origin);
  };

  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

export const DIRTY_MESSAGES = { DIRTY, SAVE_REQUEST, SAVE_RESULT, DISCARD };
