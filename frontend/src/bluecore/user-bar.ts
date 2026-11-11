// BLUECORE: "Signed in as <user> · Log out" strip, added outside the Vue app so
import { getUsername, logout } from './auth';

const BAR_HEIGHT = '28px';

const STYLE = `
:root { --bluecore-bar-height: ${BAR_HEIGHT}; }
.bluecore-user-bar {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  height: var(--bluecore-bar-height); padding: 0 12px; box-sizing: border-box;
  background: #2c3e50; color: #e0e6ec; font-size: 12px;
}
.bluecore-user-bar strong { color: #fff; }
.bluecore-user-bar button {
  font-size: 12px; padding: 1px 8px; cursor: pointer;
  background: transparent; color: #fff; border: 1px solid #8a9bab; border-radius: 3px;
}
.bluecore-user-bar button:hover { background: rgba(255, 255, 255, 0.12); }
/* upstream App.vue: #app { min-height: 100vh } */
#app { min-height: calc(100vh - var(--bluecore-bar-height)); }
/* upstream WorkspaceView.vue (scoped): .workspace-view { height: 100vh } */
.workspace-view { height: calc(100vh - var(--bluecore-bar-height)) !important; }
`;

export function mountUserBar(): void {
  const username = getUsername();
  if (!username) {
    return;
  }

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);

  const bar = document.createElement('div');
  bar.className = 'bluecore-user-bar';

  const label = document.createElement('span');
  label.append('Signed in as ');
  const name = document.createElement('strong');
  name.textContent = username;
  label.append(name);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Log out';
  button.addEventListener('click', () => {
    logout();
  });

  bar.append(label, button);
  document.body.prepend(bar);
}
