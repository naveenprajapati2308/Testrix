import axios from 'axios';

export const apiClient = axios.create({
  baseURL: `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/v1`,
  timeout: 60000,
});

apiClient.interceptors.request.use((config) => {
  const session = JSON.parse(localStorage.getItem('automationPortalAuth') || 'null');
  if (session?.accessToken) config.headers.Authorization = `Bearer ${session.accessToken}`;
  return config;
});

let sessionExpiredRedirectStarted = false;

apiClient.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body) {
      if (body.success) return body.data;
      return Promise.reject(new Error(body.message || 'Request failed'));
    }
    return body;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('automationPortalAuth');
      if (!sessionExpiredRedirectStarted) {
        sessionExpiredRedirectStarted = true;
        // Navigate the TOP window — this app has no login screen of its own; when embedded in
        // the shell's iframe, window.top is the real outer window.
        window.top.location.href = '/';
      }
      return Promise.reject(error);
    }
    const message = error.response?.data?.message || error.message || 'Internal error, please try again later';
    return Promise.reject(new Error(message));
  },
);

export const api = {
  get: (path, config) => apiClient.get(path, config),
  post: (path, body, config) => apiClient.post(path, body, config),
  put: (path, body, config) => apiClient.put(path, body, config),
  delete: (path, config) => apiClient.delete(path, config),
};

/** Blob endpoints bypass the JSON unwrapping interceptor, so they go through a bare request. */
export async function downloadFile(path, fileName) {
  const session = JSON.parse(localStorage.getItem('automationPortalAuth') || 'null');
  const response = await fetch(`${apiClient.defaults.baseURL}${path}`, {
    headers: session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {},
  });
  if (!response.ok) throw new Error('Download failed');

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
