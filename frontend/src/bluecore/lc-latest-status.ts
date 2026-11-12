// BLUECORE: "LC Latest" sync status shown in the Blue Core bar (see backend/src/bluecore/sync.ts).
import { getToken } from './auth';
import { getBasePath } from './base-path';

export interface LcLatestStatus {
  workspaceName: string;
  available: boolean;
  intervalMinutes: number;
  syncedAt: string | null;        // last import (LC's files had changed)
  sourceUpdatedAt: string | null; // when LC last changed the files (last commit)
  checkedAt: string | null;       // last check, whether or not it reached LC
  lastSuccessAt: string | null;   // last check that reached LC
  lastError: string | null;       // why the last check failed
}

// Re-read the status this often, so an open page notices the hourly checks
const REFRESH_MS = 5 * 60_000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

/** The bar's text and tooltip, or null when there's nothing to show yet */
export function describeLcLatest(status: LcLatestStatus): { text: string; title: string; warning: boolean } | null {
  const name = status.workspaceName;
  const every = `LC's GitHub is checked every ${status.intervalMinutes} minutes.`;
  const lastChange = status.sourceUpdatedAt ? ` Last changed by LC: ${formatTime(status.sourceUpdatedAt)}.` : '';

  if (status.lastError) {
    const tried = status.checkedAt ? ` at ${formatTime(status.checkedAt)}` : '';
    const text = status.available && status.lastSuccessAt
      ? `⚠ ${name}: couldn't reach LC${tried}; showing LC's templates as of ${formatTime(status.lastSuccessAt)}`
      : `⚠ ${name} isn't available yet: couldn't reach LC${tried}`;
    return { text, title: `${status.lastError}. ${every} It will try again on the next check.${lastChange}`, warning: true };
  }
  if (status.available && status.checkedAt) {
    return {
      text: `${name}: up to date with LC as of ${formatTime(status.checkedAt)}`,
      title: `${every}${lastChange}`,
      warning: false
    };
  }
  return null;
}

async function fetchStatus(): Promise<LcLatestStatus | null> {
  const token = await getToken();
  const response = await fetch(`${getBasePath()}api/bluecore/lc-latest`, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()).data as LcLatestStatus;
}

/** Fill `element` with the status now and every few minutes */
export function showLcLatestStatus(element: HTMLElement): void {
  const update = async () => {
    try {
      const status = await fetchStatus();
      const shown = status && describeLcLatest(status);
      element.textContent = shown ? shown.text : '';
      element.title = shown ? shown.title : '';
      element.classList.toggle('bluecore-warning', Boolean(shown?.warning));
    } catch (error) {
      console.error('Unable to load the LC Latest status:', error);
    }
  };
  void update();
  window.setInterval(update, REFRESH_MS);
}
