/**
 * Smart API base URL detection
 * - localhost development: http://localhost:3000
 * - production/deployed: https://chatgpt-project-0vpi.onrender.com
 */
export function getApiBaseUrl() {
  if (typeof window === 'undefined') {
    return 'https://chatgpt-project-0vpi.onrender.com';
  }

  // Use environment variable if set
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) {
    return envUrl;
  }

  // Local development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://${window.location.hostname}:3000`;
  }

  // Production (deployed)
  return 'https://chatgpt-project-0vpi.onrender.com';
}

export function getAuthToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('auth.token') : null;
}

export function getAuthConfig() {
  const token = getAuthToken();
  return {
    withCredentials: true,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  };
}
