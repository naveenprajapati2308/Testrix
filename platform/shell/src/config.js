// The one place every backend origin is defined. Two bases because the shell talks to two
// services: identity/mail live in the platform backend, dashboards and executions in automation.
export const PLATFORM_BASE = import.meta.env.VITE_PLATFORM_BASE ?? '/platform';
export const AUTOMATION_BASE = import.meta.env.VITE_AUTOMATION_BASE ?? '/automation';
