// BLUECORE: adds the Blue Core header above upstream's #app and the footer below it. They are
// the <bluecore-header> / <bluecore-footer> elements served by bluecore-stack (the same ones
// Marva and its login page use), so there is one copy for every Blue Core app. Without the
// stack (e.g. running the dancer on its own) the script isn't there and the dancer shows neither.
//
// The dancer follows Marva's "Slim header & footer" and "Hide header & footer" preferences
// (Preferences > Blue Core in Marva). Marva saves its preferences in localStorage, which the
// dancer shares because both are served from the same host (the dancer is at /marva/dancer/).
// Changing them in a Marva tab updates an open dancer tab too.
import { getUsername, logout } from './auth';
import './styles/bluecore-layout.css';

const SCRIPT_SRC = '/assets/bluecore/bluecore-header-footer.js';
const APP_NAME = 'DCTAP DANCER';

// Marva's localStorage key and preference names (marva_editor src/bluecore/layout.js)
export const MARVA_PREFERENCES_KEY = 'marva-preferences';
export const PREF_SLIM = '--b-bluecore-header-footer-slim';
export const PREF_HIDDEN = '--b-bluecore-header-footer-hidden';

export type HeaderFooterMode = 'full' | 'slim' | 'hidden';

/**
 * How Marva's preferences say to show the header and footer. Hide wins over slim.
 * Anything missing or unreadable means the full header and footer.
 */
export function readHeaderFooterMode(storage: Storage | null = safeLocalStorage()): HeaderFooterMode {
  let prefs: Record<string, { value?: unknown }> | undefined;
  try {
    prefs = JSON.parse(storage?.getItem(MARVA_PREFERENCES_KEY) ?? 'null')?.styleDefault;
  } catch {
    return 'full';
  }
  if (prefs?.[PREF_HIDDEN]?.value === true) {
    return 'hidden';
  }
  if (prefs?.[PREF_SLIM]?.value === true) {
    return 'slim';
  }
  return 'full';
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadScript(): Promise<boolean> {
  if (customElements.get('bluecore-header')) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn(`Blue Core header and footer not loaded (${SCRIPT_SRC})`);
      resolve(false);
    };
    document.head.append(script);
  });
}

export async function mountBluecoreHeaderFooter(): Promise<void> {
  const appEl = document.getElementById('app');
  if (!appEl || !(await loadScript())) {
    return;
  }

  const header = document.createElement('bluecore-header');
  header.setAttribute('app-name', APP_NAME);
  const username = getUsername();
  if (username) {
    header.setAttribute('logout', '');
    header.addEventListener('bluecore-logout', () => {
      logout();
    });
  }
  const footer = document.createElement('bluecore-footer');

  const apply = () => {
    const mode = readHeaderFooterMode();
    if (mode === 'hidden') {
      // removing them also clears their height variables, so #app gets the whole window
      header.remove();
      footer.remove();
      return;
    }
    header.toggleAttribute('slim', mode === 'slim');
    footer.toggleAttribute('slim', mode === 'slim');
    if (!header.isConnected) {
      appEl.before(header);
    }
    if (!footer.isConnected) {
      appEl.after(footer);
    }
  };

  apply();
  // fires when another tab (e.g. Marva) changes localStorage
  window.addEventListener('storage', (event) => {
    if (event.key === MARVA_PREFERENCES_KEY || event.key === null) {
      apply();
    }
  });
}
