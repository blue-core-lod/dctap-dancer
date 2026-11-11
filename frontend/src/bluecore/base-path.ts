// BLUECORE: copy of the base path detection in upstream src/router/index.ts and
// src/services/api.ts (each keeps its own private copy), so the plugin needs
// no upstream changes. Keep in sync if upstream changes how it detects it.

/**
 * Detect the base path from the current URL.
 * Supports deployments at /dancer/, /bfe2/dancer/, /marva/dancer/, or root /
 */
export function getBasePath(): string {
  const path = window.location.pathname;
  // Match paths containing /dancer followed by end, slash, or more path
  const match = path.match(/^(.*\/dancer)(?:\/|$)/);
  if (match) {
    return match[1] + '/';
  }
  return '/';
}