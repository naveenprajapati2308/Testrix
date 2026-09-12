import { API_BASE, PLATFORM_BASE } from './config.js';

export { API_BASE };

const authStore = {
  get: () => JSON.parse(localStorage.getItem('automationPortalAuth') || 'null'),
  set: (session) => localStorage.setItem('automationPortalAuth', JSON.stringify(session)),
  clear: () => localStorage.removeItem('automationPortalAuth')
};

const friendlyHttpMessage = (status, path, serverMessage) => {
  if (serverMessage) return serverMessage;

  const area = path.startsWith('/api/auth') ? 'authentication service' : 'server';

  if (status === 0) {
    return 'Unable to connect to the server. Please check that the backend is running and try again.';
  }
  if (status === 400) {
    return 'Some required information is missing or invalid. Please check the form and try again.';
  }
  if (status === 401) {
    return path.startsWith('/api/auth/login')
      ? 'Invalid username/email or password. Please check your credentials and try again.'
      : 'Your session has expired. Please sign in again.';
  }
  if (status === 403) {
    return 'You do not have permission to perform this action.';
  }
  if (status === 404) {
    return 'The requested service was not found. Please refresh the page and try again.';
  }
  if (status === 409) {
    return 'This record already exists or conflicts with existing data.';
  }
  if (status === 413) {
    return 'The uploaded file is too large. Please choose a smaller file.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return `The ${area} is currently unavailable. Please make sure the backend container is running, then try again.`;
  }
  if (status >= 500) {
    return 'The server could not complete the request. Please try again in a moment.';
  }

  return 'Something went wrong. Please try again.';
};

// Mandatory session-expiry behavior: clear auth data and leave immediately — never wait for
// the user to dismiss a popup first, and never let further requests go out on a dead token.
// Guarded so concurrent 401s (e.g. a Promise.all of several calls) only redirect once.
let sessionExpiredRedirectStarted = false;
const forceSessionExpiredRedirect = () => {
  authStore.clear();
  if (sessionExpiredRedirectStarted) return;
  sessionExpiredRedirectStarted = true;
  // Navigate the TOP window, not this one — when embedded in the shell's iframe this app
  // has no login screen of its own; window.top === window when not framed.
  window.top.location.href = '/';
};

let globalErrorCallback = null;

const triggerGlobalError = (status, message, detail = '') => {
  if (!globalErrorCallback) return;
  let title = 'Error';
  if (status === 0) title = 'Network Connection Error';
  else if (status === 401) title = 'Session Expired';
  else if (status === 403) title = 'Access Restricted (403)';
  else if (status === 404) title = 'Resource Not Found (404)';
  else if (status >= 500) title = 'Internal Server Error (500)';
  
  globalErrorCallback({ status, title, message, detail });
};

const unwrap = async (response, path = response.url || '') => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const message = friendlyHttpMessage(response.status, path, body.message);
    
    if (response.status === 403 || response.status === 404 || response.status >= 500) {
      const detail = `Request Endpoint: ${path}\nStatus Code: ${response.status}\nServer Error: ${body.message || 'No additional details provided.'}\nTimestamp: ${new Date().toISOString()}`;
      triggerGlobalError(response.status, message, detail);
    }
    
    const error = new Error(message);
    error.status = response.status;
    error.detail = body.message;
    throw error;
  }
  return body.data;
};

// Refresh tokens rotate server-side, so concurrent 401s each retrying with the same token means
// only the first succeeds — the rest saw "already revoked" and wrongly cleared a healthy session.
// One shared in-flight refresh fixes that.
let inFlightRefresh = null;

const refreshSession = (refreshToken) => {
  if (!inFlightRefresh) {
    inFlightRefresh = fetch(`${PLATFORM_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    })
      .then((refreshResponse) => unwrap(refreshResponse, '/api/auth/refresh'))
      .finally(() => { inFlightRefresh = null; });
  }
  return inFlightRefresh;
};

const request = async (path, options = {}, retryCount = 0) => {
  const base = options.base ?? API_BASE;
  const session = authStore.get();
  const headers = {
    ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    ...options.headers
  };
  let response;
  try {
    response = await fetch(base + path, { ...options, headers });
  } catch (error) {
    const msg = 'Unable to connect to the server. Please check that the backend is running and try again.';
    const detail = `Request Endpoint: ${path}\nHTTP Method: ${options.method || 'GET'}\nError Type: ${error.name || 'NetworkError'}\nSystem Message: ${error.message}\n\nTroubleshooting:\n- Verify that the backend docker containers are running.\n- Check if there is an active internet connection.\n- Ensure the port 8080 is accessible.`;
    triggerGlobalError(0, msg, detail);
    const networkError = new Error(msg);
    networkError.cause = error;
    throw networkError;
  }
  if (response.status === 401 && session?.refreshToken && retryCount < 1) {
    try {
      const refreshed = await refreshSession(session.refreshToken);
      authStore.set(refreshed);
      return request(path, options, retryCount + 1);
    } catch {
      // A concurrent caller may have already refreshed successfully while this one was
      // waiting — only treat it as a real expiry if the stored session is still the
      // pre-refresh one (i.e. nothing else updated it in the meantime).
      const current = authStore.get();
      if (current?.refreshToken === session.refreshToken) {
        forceSessionExpiredRedirect();
      } else if (current?.accessToken) {
        return request(path, options, retryCount + 1);
      }
      // Store empty and it wasn't this session's tokens: another caller already
      // handled the expiry — resolving silently avoids stacking popups.
    }
  } else if (response.status === 401 && session?.accessToken) {
    // A 401 is a real expiry only if this request's token is still the active one — a stale
    // request resolving after the user signed back in would otherwise kill the new session.
    // Unauthenticated calls never had a session, so their 401 is a credentials error instead.
    const current = authStore.get();
    if (current?.accessToken && current.accessToken !== session?.accessToken && retryCount < 2) {
      return request(path, options, retryCount + 1);
    }
    forceSessionExpiredRedirect();
  }
  return unwrap(response, path);
};

export const auth = authStore;

// The token already carries projectRoles, so decoding it locally avoids a round trip just to
// answer "is this user a Project Admin?". JWTs are signed, not encrypted — reading a claim out of
// a token this app already holds grants it nothing the backend hasn't already accepted.
export const decodeProjectRoles = (token) => {
  if (!token) return [];
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Array.isArray(payload.projectRoles) ? payload.projectRoles : [];
  } catch {
    return [];
  }
};

export const api = {
  // ── Auth (owned by the platform service, not this product) ────────────────
  logout: (refreshToken) => request('/api/auth/logout', { method: 'POST', base: PLATFORM_BASE, body: JSON.stringify({ refreshToken }) }),

  // ── Portal ────────────────────────────────────────────────────────────────
  dashboardSummary: (range) => request(`/api/dashboard/summary?range=${range || '7d'}`),
  dashboardTrends: (range) => request(`/api/dashboard/trends?range=${range || '7d'}`),
  dashboardModuleHealth: (range, environmentId) => request(`/api/dashboard/module-health?range=${range || '30d'}${environmentId ? `&environmentId=${environmentId}` : ''}`),
  dashboardRecentActivity: () => request('/api/dashboard/recent-activity'),
  dashboardFailureAnalysis: (range) => request(`/api/dashboard/failure-analysis?range=${range || '30d'}`),
  dashboardSlowTests: (range) => request(`/api/dashboard/slow-tests?range=${range || '30d'}`),
  dashboardFlakyTests: (range) => request(`/api/dashboard/flaky-tests?range=${range || '30d'}`),
  dashboardPassRateTrend: (range) => request(`/api/dashboard/pass-rate-trend?range=${range || '7d'}`),
  dashboardDurationTrend: (range) => request(`/api/dashboard/duration-trend?range=${range || '7d'}`),
  dashboardHeatmap: (range) => request(`/api/dashboard/heatmap?range=${range || '7d'}`),
  dashboardEnvDistribution: (range) => request(`/api/dashboard/env-distribution?range=${range || '30d'}`),
  dashboardRegressionAlerts: () => request('/api/dashboard/regression-alerts'),
  getTestSteps: (testCaseId) => request(`/api/test-cases/${testCaseId}/steps`),
  
  environments: () => request('/api/environments'),
  environmentsHealth: () => request('/api/environments/health'),
  createEnvironment: (payload) => request('/api/environments', { method: 'POST', body: JSON.stringify(payload) }),
  updateEnvironment: (id, payload) => request(`/api/environments/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEnvironment: (id) => request(`/api/environments/${id}`, { method: 'DELETE' }),
  environmentModules: (id, framework) => request(`/api/environments/${id}/modules${framework ? `?framework=${framework}` : ''}`),

  configurations: () => request('/api/configurations'),
  updateConfiguration: (key, payload) => request(`/api/configurations/${key}`, { method: 'PUT', body: JSON.stringify(payload) }),

  modules: (framework) => request(`/api/modules${framework ? `?framework=${framework}` : ''}`),
  createModule: (payload) => request('/api/modules', { method: 'POST', body: JSON.stringify(payload) }),
  enableModuleForEnvironment: (moduleId, environmentId) => request(`/api/modules/${moduleId}/environments/${environmentId}/enable`, { method: 'POST' }),
  moduleEnvironments: (moduleId) => request(`/api/modules/${moduleId}/environments`),
  moduleEnvironmentOptions: (moduleId, environmentId) => request(`/api/modules/${moduleId}/environments/${environmentId}/options`),
  moduleTags: (moduleId) => request(`/api/modules/${moduleId}/tags`),

  // ── Test Engines (Automation Setup Wizard) ────────────────────────────────
  testEngines: () => request('/api/test-engines'),
  testEngineConfig: () => request('/api/test-engines/config'),
  registerTestEngine: (payload) => request('/api/test-engines', { method: 'POST', body: JSON.stringify(payload) }),
  updateTestEngine: (id, payload) => request(`/api/test-engines/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  // Raw fetch, not the JSON-envelope `request()` helper — this endpoint streams a zip file body.
  downloadEngineStarterKit: async (id, apiKey) => {
    const session = authStore.get();
    const response = await fetch(`${API_BASE}/api/test-engines/${id}/starter-kit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {})
      },
      body: JSON.stringify({ apiKey: apiKey || null, portalUrl: `${window.location.origin}${API_BASE}` })
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || 'Failed to download starter kit');
    }
    const blob = await response.blob();
    const match = (response.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
    const filename = match ? match[1] : 'testrix-starter-kit.zip';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // ── Admin: Module Management (SUPER_ADMIN only) ───────────────────────────
  adminListModules: () => request('/api/admin/modules'),
  adminCreateModule: (payload) => request('/api/admin/modules', { method: 'POST', body: JSON.stringify(payload) }),
  adminUpdateModule: (id, payload) => request(`/api/admin/modules/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  adminDeleteModule: (id) => request(`/api/admin/modules/${id}`, { method: 'DELETE' }),
  adminToggleModule: (id) => request(`/api/admin/modules/${id}/toggle`, { method: 'PATCH' }),

  // ── Admin: Module <-> Environment mapping (overrides + enable/disable) ────
  adminListModuleEnvironments: (moduleId) => request(`/api/admin/module-environments${moduleId ? `?moduleId=${moduleId}` : ''}`),
  adminCreateModuleEnvironment: (payload) => request('/api/admin/module-environments', { method: 'POST', body: JSON.stringify(payload) }),
  adminUpdateModuleEnvironment: (id, payload) => request(`/api/admin/module-environments/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  adminDeleteModuleEnvironment: (id) => request(`/api/admin/module-environments/${id}`, { method: 'DELETE' }),
  executions: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('/api/executions' + (qs ? '?' + qs : ''));
  },
  runExecution: (payload) => request('/api/executions/run', { method: 'POST', body: JSON.stringify(payload) }),
  executionDetails: (id) => request(`/api/executions/${id}`),
  executionTestCases: (id) => request(`/api/executions/${id}/test-cases`),
  executionArtifacts: (id) => request(`/api/executions/${id}/artifacts`),
  executionLogs: (id) => request(`/api/executions/${id}/logs`),
  executionSummary: (id) => request(`/api/executions/${id}/summary`),
  deleteExecution: (id) => request(`/api/executions/${id}`, { method: 'DELETE' }),
  cancelExecution: (id) => request(`/api/executions/${id}/cancel`, { method: 'POST' }),
  rerunExecution: (id) => request(`/api/executions/${id}/rerun`, { method: 'POST' }),
  rerunFailedExecution: (id) => request(`/api/executions/${id}/rerun-failed`, { method: 'POST' }),
  runnerSuites: (framework = 'MAVEN_TESTNG') => request(`/api/executions/runner/suites?framework=${framework}`),
  frameworks: () => request('/api/frameworks'),

  reportsList: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('/api/reports' + (qs ? '?' + qs : ''));
  },
  reportDetails: (id) => request(`/api/reports/${id}`),
  reportFailedTests: (id) => request(`/api/reports/${id}/failed-tests`),

  screenshotsList: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('/api/screenshots' + (qs ? '?' + qs : ''));
  },
  deleteScreenshot: (testCaseId) => request(`/api/screenshots/${testCaseId}`, { method: 'DELETE' }),

  compareExecutions: (baseId, targetId) => request(`/api/compare/executions?baseExecutionId=${baseId}&targetExecutionId=${targetId}`),
  compareLatest: (module) => request(`/api/compare/latest?module=${module}`),
  setErrorCallback: (cb) => { globalErrorCallback = cb; }
};
