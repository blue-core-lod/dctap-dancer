// BLUECORE: Blue Core plugin for the DCTap Dancer frontend.
import type { AxiosError, AxiosInstance } from 'axios';
import { initAuth, getToken, login } from './auth';
import { mountUserBar } from './user-bar';

/**
 * Hold the app until the user is logged in through Keycloak (redirecting to
 * the login page if needed), then add the "Signed in as …" bar. Resolves right
 * away when the backend has auth turned off. On failure it shows a message in
 * place of the app and never resolves.
 */
export function requireBluecoreLogin(): Promise<void> {
  return initAuth()
    .then(mountUserBar)
    .catch((error) => {
      console.error('Authentication failed:', error);
      const root = document.getElementById('app');
      if (root) {
        root.textContent = 'Unable to sign in. Please reload the page to try again.';
      }
      return new Promise<void>(() => {});
    });
}

/**
 * Add Keycloak authentication to upstream's axios client: send the access
 * token (refreshed when close to expiry) with every request, and send the
 * user back through the login when the API answers 401.
 */
export function addBluecoreAuth(api: AxiosInstance): void {
  api.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  api.interceptors.response.use(undefined, (error: AxiosError) => {
    if (error.response?.status === 401) {
      login();
    }
    return Promise.reject(error);
  });
}
