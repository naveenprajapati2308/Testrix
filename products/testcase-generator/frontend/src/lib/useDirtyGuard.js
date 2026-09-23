import { useEffect, useRef, useState } from 'react';

const AUTH_KEY = 'automationPortalAuth';

function currentProjectId() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null')?.project?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Warns before unsaved grid edits are lost.
 *
 * Switching workspace in the shell ends in window.location.reload(), which unloads this iframe
 * too — so a beforeunload handler here is what actually gates the switch, as well as tab close
 * and refresh. The storage listener is a backstop: if the session's project ever changes without
 * a reload, the edits in front of the user belong to the previous workspace and must not be
 * saved into the new one.
 */
export function useDirtyGuard(isDirty) {
  const [projectChanged, setProjectChanged] = useState(false);
  const projectIdRef = useRef(currentProjectId());

  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== AUTH_KEY) return;
      const next = currentProjectId();
      if (next !== projectIdRef.current) {
        projectIdRef.current = next;
        setProjectChanged(true);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { projectChanged };
}

/** Confirms before an in-app navigation away from unsaved edits. */
export function confirmDiscard(isDirty) {
  if (!isDirty) return true;
  return window.confirm('You have unsaved changes. Leave without saving?');
}
