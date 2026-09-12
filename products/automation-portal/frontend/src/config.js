// The one place every backend origin is defined. Deployments change these, never call sites.
//
// Behind the Testrix gateway this app is served at /automation/, so its own backend calls carry
// that prefix; in dev (vite proxy) BASE_URL is '/'.
export const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// Identity lives in the platform service, not in this product — the only calls that go there
// are session refresh and logout.
export const PLATFORM_BASE = import.meta.env.VITE_PLATFORM_BASE ?? '/platform';
