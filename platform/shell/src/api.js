import { PLATFORM_BASE, AUTOMATION_BASE } from './config.js';

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
    return 'Some required fileds are missing or invalid ';
  }
  if (status === 401) {
    return path.startsWith('/api/auth/login')
      ? 'Invalid username/email or password. Please check your credentials and try again.'
      : 'Your session has expired. Please sign in again.';
  }
  if (status === 403) {
    return 'You do not have permission.';
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
  const base = options.base ?? PLATFORM_BASE;
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
  
      const current = authStore.get();
      if (current?.refreshToken === session.refreshToken) {
        authStore.clear();
        triggerGlobalError(401, 'Your session has expired. Please sign in again.');
      } else if (current?.accessToken) {
        return request(path, options, retryCount + 1);
      }
  
    }
  } else if (response.status === 401) {
 
    const current = authStore.get();
    if (current?.accessToken && current.accessToken !== session?.accessToken && retryCount < 2) {
      return request(path, options, retryCount + 1);
    }
    triggerGlobalError(401, 'Your session has expired. Please sign in again.');
  }
  return unwrap(response, path);
};

export const auth = authStore;

// Calls that belong to the automation product rather than the platform. Split out so that an
// automation outage takes down only the screens below the "Test Engines" marker in the map
// below — sign-in, profile and user administration keep working.
const areq = (path, options = {}) => request(path, { ...options, base: AUTOMATION_BASE });

export const api = {
  // ── Auth ─────────────────────────────────────────────────────────────────
  login: (payload) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: (refreshToken) => request('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
  me: () => request('/api/auth/me'),
  forgotPassword: (payload) => request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) }),
  resetPassword: (payload) => request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(payload) }),
  changePassword: (payload) => request('/api/auth/change-password', { method: 'POST', body: JSON.stringify(payload) }),

  // ── Profile ───────────────────────────────────────────────────────────────
  profile: () => request('/api/profile'),
  updateProfile: (payload) => request('/api/profile', { method: 'PUT', body: JSON.stringify(payload) }),
  uploadProfileImage: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/api/profile/image', { method: 'POST', body: form });
  },
  auditLogs: () => request('/api/profile/audit-logs'),
  requestEmailChange: (payload) => request('/api/profile/email-change/request', { method: 'POST', body: JSON.stringify(payload) }),
  verifyEmailChange: (payload) => request('/api/profile/email-change/verify', { method: 'POST', body: JSON.stringify(payload) }),

  // ── Admin: User Management (SUPER_ADMIN only) ─────────────────────────────
  adminListUsers: () => request('/api/admin/users'),
  adminListRoles: () => request('/api/admin/roles'),
  adminGetUser: (id) => request(`/api/admin/users/${id}`),
  adminGetUserWorkspaces: (id) => request(`/api/admin/users/${id}/workspaces`),
  adminCreateUser: (payload) => request('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  adminUpdateUser: (id, payload) => request(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  adminDisableUser: (id) => request(`/api/admin/users/${id}/disable`, { method: 'PUT', body: JSON.stringify({}) }),
  adminEnableUser: (id) => request(`/api/admin/users/${id}/enable`, { method: 'PUT', body: JSON.stringify({}) }),
  adminResetPassword: (id, payload) => request(`/api/admin/users/${id}/reset-password`, { method: 'PUT', body: JSON.stringify(payload) }),
  adminAssignRole: (id, role) => request(`/api/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  adminDeleteUser: (id) => request(`/api/admin/users/${id}`, { method: 'DELETE' }),

  // ── Workspace Requests (public submit + SUPER_ADMIN review) ────────────────
  sendWorkspaceRequestOtp: (payload) => request('/api/workspace-requests/send-otp', { method: 'POST', body: JSON.stringify(payload) }),
  verifyWorkspaceRequestOtp: (payload) => request('/api/workspace-requests/verify-otp', { method: 'POST', body: JSON.stringify(payload) }),
  submitWorkspaceRequest: (payload) => request('/api/workspace-requests', { method: 'POST', body: JSON.stringify(payload) }),
  adminListWorkspaceRequests: (status) => request(`/api/admin/workspace-requests${status ? `?status=${status}` : ''}`),
  adminApproveWorkspaceRequest: (id) => request(`/api/admin/workspace-requests/${id}/approve`, { method: 'POST' }),
  adminRejectWorkspaceRequest: (id, reason) => request(`/api/admin/workspace-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  adminListProjects: () => request('/api/admin/projects'),
  adminDeleteProject: (id) => request(`/api/admin/projects/${id}`, { method: 'DELETE' }),
  adminSuspendProject: (id) => request(`/api/admin/projects/${id}/suspend`, { method: 'PUT' }),
  adminActivateProject: (id) => request(`/api/admin/projects/${id}/activate`, { method: 'PUT' }),
  adminListAuditLogs: () => request('/api/admin/audit-logs'),

  // ── Project Admin: manage users within their own project ───────────────────
  myProjects: () => request('/api/auth/my-projects'),
  selectProject: (projectId, refreshToken) => request('/api/auth/select-project', { method: 'POST', body: JSON.stringify({ projectId, refreshToken }) }),
  listProjectUsers: (projectId) => request(`/api/projects/${projectId}/users`),
  sharedProjectUserWorkspaces: (projectId, userId) => request(`/api/projects/${projectId}/users/${userId}/shared-workspaces`),
  createProjectUser: (projectId, payload) => request(`/api/projects/${projectId}/users`, { method: 'POST', body: JSON.stringify(payload) }),
  updateProjectUser: (projectId, userId, payload) => request(`/api/projects/${projectId}/users/${userId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  setProjectUserStatus: (projectId, userId, status) => request(`/api/projects/${projectId}/users/${userId}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  assignProjectUserRoles: (projectId, userId, roleCodes) => request(`/api/projects/${projectId}/users/${userId}/roles`, { method: 'PUT', body: JSON.stringify({ roleCodes }) }),
  removeProjectUser: (projectId, userId) => request(`/api/projects/${projectId}/users/${userId}`, { method: 'DELETE' }),
  transferProjectOwnership: (projectId, userId) => request(`/api/projects/${projectId}/users/${userId}/transfer-ownership`, { method: 'POST' }),
  projectRoles: () => request('/api/projects/roles'),
  workspaceSettings: (projectId) => request(`/api/projects/${projectId}/settings`),
  updateWorkspaceProfile: (projectId, payload) => request(`/api/projects/${projectId}/settings/profile`, { method: 'PUT', body: JSON.stringify(payload) }),
  toggleWorkspaceModule: (projectId, moduleType, enabled) => request(`/api/projects/${projectId}/settings/modules/${moduleType}`, { method: 'PUT', body: JSON.stringify({ enabled }) }),

  // ── Test Engines (docs/version2.3.md Plan 2) ────────────────────────────────
  testEngines: () => areq('/api/test-engines'),
  registerTestEngine: (payload) => areq('/api/test-engines', { method: 'POST', body: JSON.stringify(payload) }),
  updateTestEngine: (id, payload) => areq(`/api/test-engines/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  disableTestEngine: (id) => areq(`/api/test-engines/${id}`, { method: 'DELETE' }),
  rotateTestEngineCredential: (id) => areq(`/api/test-engines/${id}/credential/rotate`, { method: 'POST' }),
  revokeTestEngineCredential: (id) => areq(`/api/test-engines/${id}/credential/revoke`, { method: 'POST' }),
  // Raw fetch, not the JSON-envelope `areq()` helper — this endpoint streams a zip file body.
  downloadEngineStarterKit: async (id, apiKey) => {
    const session = authStore.get();
    const response = await fetch(`${AUTOMATION_BASE}/api/test-engines/${id}/starter-kit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {})
      },
      body: JSON.stringify({ apiKey: apiKey || null, portalUrl: `${window.location.origin}${AUTOMATION_BASE}` })
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

  // ── Portal ────────────────────────────────────────────────────────────────
  dashboardSummary: () => areq('/api/dashboard/summary'),
  dashboardTrends: (range) => areq(`/api/dashboard/trends?range=${range || '7d'}`),
  dashboardModuleHealth: (range, environmentId) => areq(`/api/dashboard/module-health?range=${range || '30d'}${environmentId ? `&environmentId=${environmentId}` : ''}`),
  dashboardRecentActivity: () => areq('/api/dashboard/recent-activity'),
  dashboardFailureAnalysis: (range) => areq(`/api/dashboard/failure-analysis?range=${range || '30d'}`),
  dashboardSlowTests: (range) => areq(`/api/dashboard/slow-tests?range=${range || '30d'}`),
  dashboardFlakyTests: (range) => areq(`/api/dashboard/flaky-tests?range=${range || '30d'}`),
  dashboardPassRateTrend: (range) => areq(`/api/dashboard/pass-rate-trend?range=${range || '7d'}`),
  dashboardDurationTrend: (range) => areq(`/api/dashboard/duration-trend?range=${range || '7d'}`),
  dashboardHeatmap: (range) => areq(`/api/dashboard/heatmap?range=${range || '7d'}`),
  dashboardEnvDistribution: (range) => areq(`/api/dashboard/env-distribution?range=${range || '30d'}`),
  dashboardRegressionAlerts: () => areq('/api/dashboard/regression-alerts'),
  getTestSteps: (testCaseId) => areq(`/api/test-cases/${testCaseId}/steps`),

  environments: () => areq('/api/environments'),
  environmentsHealth: () => areq('/api/environments/health'),
  createEnvironment: (payload) => areq('/api/environments', { method: 'POST', body: JSON.stringify(payload) }),
  updateEnvironment: (id, payload) => areq(`/api/environments/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEnvironment: (id) => areq(`/api/environments/${id}`, { method: 'DELETE' }),
  environmentModules: (id, framework) => areq(`/api/environments/${id}/modules${framework ? `?framework=${framework}` : ''}`),

  configurations: () => areq('/api/configurations'),
  updateConfiguration: (key, payload) => areq(`/api/configurations/${key}`, { method: 'PUT', body: JSON.stringify(payload) }),

  // ── Integration Guide ────────────────────────────────────────────────────
  integrationGuide: () => areq('/api/integration-guide'),
  adminCreateGuideSection: (payload) => areq('/api/admin/integration-guide', { method: 'POST', body: JSON.stringify(payload) }),
  adminUpdateGuideSection: (id, payload) => areq(`/api/admin/integration-guide/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  adminDeleteGuideSection: (id) => areq(`/api/admin/integration-guide/${id}`, { method: 'DELETE' }),
  adminUploadGuideSectionImage: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return areq(`/api/admin/integration-guide/${id}/image`, { method: 'POST', body: form });
  },
  adminRemoveGuideSectionImage: (id) => areq(`/api/admin/integration-guide/${id}/image`, { method: 'DELETE' }),

  modules: (framework) => areq(`/api/modules${framework ? `?framework=${framework}` : ''}`),
  moduleEnvironments: (moduleId) => areq(`/api/modules/${moduleId}/environments`),
  moduleEnvironmentOptions: (moduleId, environmentId) => areq(`/api/modules/${moduleId}/environments/${environmentId}/options`),

  // ── Admin: Module Management (SUPER_ADMIN only) ───────────────────────────
  adminListModules: () => areq('/api/admin/modules'),
  adminCreateModule: (payload) => areq('/api/admin/modules', { method: 'POST', body: JSON.stringify(payload) }),
  adminUpdateModule: (id, payload) => areq(`/api/admin/modules/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  adminDeleteModule: (id) => areq(`/api/admin/modules/${id}`, { method: 'DELETE' }),
  adminToggleModule: (id) => areq(`/api/admin/modules/${id}/toggle`, { method: 'PATCH' }),
  adminListTestEngines: () => areq('/api/admin/test-engines'),

  // ── Admin: Module <-> Environment mapping (overrides + enable/disable) ────
  adminListModuleEnvironments: (moduleId) => areq(`/api/admin/module-environments${moduleId ? `?moduleId=${moduleId}` : ''}`),
  adminCreateModuleEnvironment: (payload) => areq('/api/admin/module-environments', { method: 'POST', body: JSON.stringify(payload) }),
  adminUpdateModuleEnvironment: (id, payload) => areq(`/api/admin/module-environments/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  adminDeleteModuleEnvironment: (id) => areq(`/api/admin/module-environments/${id}`, { method: 'DELETE' }),
  executions: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return areq('/api/executions' + (qs ? '?' + qs : ''));
  },
  runExecution: (payload) => areq('/api/executions/run', { method: 'POST', body: JSON.stringify(payload) }),
  executionDetails: (id) => areq(`/api/executions/${id}`),
  executionTestCases: (id) => areq(`/api/executions/${id}/test-cases`),
  executionArtifacts: (id) => areq(`/api/executions/${id}/artifacts`),
  executionLogs: (id) => areq(`/api/executions/${id}/logs`),
  executionSummary: (id) => areq(`/api/executions/${id}/summary`),
  deleteExecution: (id) => areq(`/api/executions/${id}`, { method: 'DELETE' }),
  cancelExecution: (id) => areq(`/api/executions/${id}/cancel`, { method: 'POST' }),
  rerunExecution: (id) => areq(`/api/executions/${id}/rerun`, { method: 'POST' }),
  rerunFailedExecution: (id) => areq(`/api/executions/${id}/rerun-failed`, { method: 'POST' }),
  runnerSuites: (framework = 'MAVEN_TESTNG') => areq(`/api/executions/runner/suites?framework=${framework}`),
  frameworks: () => areq('/api/frameworks'),

  reportsList: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return areq('/api/reports' + (qs ? '?' + qs : ''));
  },
  reportDetails: (id) => areq(`/api/reports/${id}`),
  reportFailedTests: (id) => areq(`/api/reports/${id}/failed-tests`),

  screenshotsList: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return areq('/api/screenshots' + (qs ? '?' + qs : ''));
  },
  deleteScreenshot: (testCaseId) => areq(`/api/screenshots/${testCaseId}`, { method: 'DELETE' }),

  compareExecutions: (baseId, targetId) => areq(`/api/compare/executions?baseExecutionId=${baseId}&targetExecutionId=${targetId}`),
  compareLatest: (module) => areq(`/api/compare/latest?module=${module}`),
  setErrorCallback: (cb) => { globalErrorCallback = cb; }
};
