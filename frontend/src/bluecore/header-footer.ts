// BLUECORE: adds the Blue Core header above upstream's #app and the footer below it. They are
// the <bluecore-header> / <bluecore-footer> elements served by bluecore-stack (the same ones
// Marva's login page uses), so there is one copy for every Blue Core app. Without the stack
// (e.g. running the dancer on its own) the script isn't there and the dancer shows neither.
import { getUsername, logout } from './auth';
import './styles/bluecore-layout.css';

const SCRIPT_SRC = '/assets/bluecore/bluecore-header-footer.js';
const APP_NAME = 'DCTAP DANCER';

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

  appEl.before(header);
  appEl.after(document.createElement('bluecore-footer'));
}
