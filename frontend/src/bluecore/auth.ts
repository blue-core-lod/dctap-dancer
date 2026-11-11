// BLUECORE: Keycloak login for deployments that enable it (backend KEYCLOAK_URL).
import Keycloak from 'keycloak-js';
import { getBasePath } from './base-path';

/**
 * The backend reports whether auth is on, so one build works with or without it.
 */
interface AuthSettings {
  enabled: boolean;
  url: string;
  realm: string;
  clientId: string;
}

// Must match TOKEN_COOKIE in backend/src/bluecore/auth.ts
const TOKEN_COOKIE = 'dancer_access_token';

// Renew the token when it has less than this many seconds left
const MIN_VALIDITY_SECONDS = 60;
const REFRESH_INTERVAL_MS = 30_000;

let keycloak: Keycloak | null = null;

async function fetchSettings(): Promise<AuthSettings> {
  const response = await fetch(`${getBasePath()}api/auth/config`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to load auth settings (HTTP ${response.status})`);
  }
  const body = await response.json();
  return body.data as AuthSettings;
}

/**
 * Mirror the access token into a cookie scoped to the dancer's base path, so
 * links the browser opens directly (downloads) are authenticated without
 * changing upstream's URL builders. The backend accepts it on GET only.
 */
function syncTokenCookie(): void {
  const path = getBasePath();
  const token = keycloak?.token;
  const exp = keycloak?.tokenParsed?.exp;
  if (token && exp) {
    const maxAge = Math.max(0, exp - Math.floor(Date.now() / 1000));
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=${path}; Max-Age=${maxAge}; SameSite=Strict${secure}`;
  } else {
    document.cookie = `${TOKEN_COOKIE}=; Path=${path}; Max-Age=0; SameSite=Strict`;
  }
}

async function refreshToken(): Promise<void> {
  if (!keycloak) {
    return;
  }
  try {
    await keycloak.updateToken(MIN_VALIDITY_SECONDS);
    syncTokenCookie();
  } catch {
    await keycloak.login();
  }
}

/**
 * Resolve once the user is logged in (redirecting to Keycloak if needed),
 * or right away when auth is disabled.
 */
export async function initAuth(): Promise<void> {
  const settings = await fetchSettings();
  if (!settings.enabled) {
    return;
  }

  keycloak = new Keycloak({ url: settings.url, realm: settings.realm, clientId: settings.clientId });
  const urlBeforeLogin = window.location.href;
  await keycloak.init({
    onLoad: 'login-required',
    pkceMethod: 'S256',
    checkLoginIframe: false
  });
  syncTokenCookie();

  // keycloak-js strips the login reply (#state=…&code=…) from the URL, but
  // upstream's router was created earlier and still holds the old URL, which
  // it would restore on its first navigation. A popstate event makes the
  // router re-read the cleaned URL before the app mounts.
  if (window.location.href !== urlBeforeLogin) {
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }

  // Keep the access token (and cookie) fresh while the editor is open
  window.setInterval(refreshToken, REFRESH_INTERVAL_MS);
}

/** A current access token, refreshed first if it is about to expire */
export async function getToken(): Promise<string | undefined> {
  await refreshToken();
  return keycloak?.token;
}

export function getUsername(): string | undefined {
  return keycloak?.tokenParsed?.preferred_username as string | undefined;
}

export function login(): Promise<void> {
  return keycloak ? keycloak.login() : Promise.resolve();
}

export function logout(): Promise<void> {
  if (!keycloak) {
    return Promise.resolve();
  }
  const instance = keycloak;
  keycloak = null;
  syncTokenCookie(); // clears it
  return instance.logout({ redirectUri: `${window.location.origin}${getBasePath()}` });
}
