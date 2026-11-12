// BLUECORE: a read-only workspace (e.g. "LC Latest") kept in sync with LC's Marva profiles.
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { workspaceService } from '../services/database.js';
import { invalidateWorkspaceCache } from '../services/cache.js';
import { lockedWorkspacesService } from '../services/locked-workspaces.js';
import { importMarvaProfiles } from '../services/marva-profile.js';
import { importStartingPoints } from '../services/starting-point.js';
import { MarvaProfileDocument } from '../types/marva-profile.js';
import { StartingPointFile } from '../types/starting-point.js';
import { loadJson, loadMarvaSources } from './seed.js';

/**
 * "LC Latest": a workspace that always mirrors LC's Marva profiles
 * (https://github.com/lcnetdev/marva-profiles), so staff can see LC's newest
 * templates and duplicate them into editable workspaces.
 *
 * How it works
 * ------------
 * - Checks at startup, then hourly at 15 minutes past (LC's updates are
 *   committed on the hour).
 * - Each check first asks GitHub when LC last changed the files (a tiny
 *   request). If that matches our copy, nothing is downloaded. Otherwise (or
 *   if GitHub's API doesn't answer) it downloads the files and re-imports
 *   only if they really changed (or the workspace is missing).
 * - The import builds a new workspace, then replaces the old one, so nobody
 *   ever sees a half-imported workspace.
 * - The workspace is locked (read-only, see data/locked-workspaces.json): it
 *   can't be edited, renamed or deleted, because every sync would replace those
 *   edits. Duplicate it to get an editable copy; copies are never touched.
 * - A re-import gives the workspace a new ID. Blue Core Marva remembers the
 *   selected workspace by name too, so users stay on it.
 * - The editor's home page shows "Library of Congress Profiles last updated
 *   on: <date>" (the files' last commit on GitHub) on the workspace's card,
 *   instead of when the dancer created and imported it. The name links to
 *   LC's profiles on GitHub.
 * - If LC's files can't be loaded (GitHub down, network blocked, a bad
 *   file), the current workspace is kept as is, the error is logged, and the
 *   next check tries again.
 */
export interface SyncConfig {
  workspaceName: string;
  profilesSource: string;
  startingPointsSource?: string;
  checkAtMinute: number; // check hourly at this many minutes past the hour
  // GitHub API URLs listing the sources' commits, to find when they last changed
  commitHistory?: string[];
  // Shown on the workspace's card: "<sourceName> last updated on: <date>",
  // with sourceName linking to sourceUrl
  sourceName?: string;
  sourceUrl?: string;
}

/** The last import, saved in data/bluecore-sync-state.json */
export interface SyncState {
  workspaceName: string;
  workspaceId?: string;     // set once imported
  hash?: string;            // fingerprint of LC's files at the last import
  syncedAt?: string;        // when the dancer last imported them
  sourceUpdatedAt?: string; // when LC last changed them (last commit)
}

export interface SyncDeps {
  load: (source: string) => Promise<unknown>;
  listWorkspaces: () => Array<{ id: string; name: string }>;
  importProfiles: (name: string, profiles: MarvaProfileDocument[]) => { workspaceId: string };
  importStartingPoints: (workspaceId: string, data: StartingPointFile) => unknown;
  deleteWorkspace: (id: string) => unknown;
  renameWorkspace: (id: string, name: string) => unknown;
  lock: (name: string) => void;
  lastCommitDate: (commitHistoryUrls: string[]) => Promise<string | null>;
  readState: () => SyncState | null;
  writeState: (state: SyncState) => void;
  now: () => Date;
}

// Raw file URLs: GitHub serves files here, never folders, so the folder URL on
// its own is a 404. LC_PROFILES_PAGE is the folder to browse.
const LC_PROFILES_PAGE = 'https://github.com/lcnetdev/marva-profiles/tree/main/marva-prod';
const LC_PROFILES = 'https://raw.githubusercontent.com/lcnetdev/marva-profiles/refs/heads/main/marva-prod';
const LC_COMMITS = 'https://api.github.com/repos/lcnetdev/marva-profiles/commits?sha=main&per_page=1&path=marva-prod';

export const LC_LATEST: SyncConfig = {
  workspaceName: 'LC Latest',
  profilesSource: `${LC_PROFILES}/marva-profiles.json`,
  startingPointsSource: `${LC_PROFILES}/marva-starting.json`,
  checkAtMinute: 15,
  commitHistory: [`${LC_COMMITS}/marva-profiles.json`, `${LC_COMMITS}/marva-starting.json`],
  sourceName: 'Library of Congress Profiles',
  sourceUrl: LC_PROFILES_PAGE
};

export type SyncResult =
  | { status: 'unchanged'; workspaceName: string; workspaceId: string }
  | { status: 'synced'; workspaceName: string; workspaceId: string; replaced: number };

/** Milliseconds from `now` until the next time it's `minute` minutes past the hour */
export function msUntilNextCheck(minute: number, now: Date): number {
  const next = new Date(now);
  next.setUTCMinutes(minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCHours(next.getUTCHours() + 1);
  }
  return next.getTime() - now.getTime();
}

/** Name of the workspace while it is being imported, before it replaces the old one */
export function importingName(workspaceName: string): string {
  return `${workspaceName} (updating)`;
}

export async function syncWorkspace(config: SyncConfig, deps: SyncDeps = defaultDeps): Promise<SyncResult> {
  const { workspaceName } = config;
  const saved = deps.readState();
  const state: SyncState = saved?.workspaceName === workspaceName ? saved : { workspaceName };
  deps.lock(workspaceName);
  const ourCopy = () => {
    const named = deps.listWorkspaces().filter(ws => ws.name === workspaceName);
    return named.length === 1 && state.hash && state.workspaceId === named[0].id ? named[0] : null;
  };

  // When LC last changed the files. If our copy is from then, skip the download.
  const sourceUpdatedAt = await findSourceUpdatedAt(config, deps);
  const copy = ourCopy();
  if (copy && sourceUpdatedAt && sourceUpdatedAt === state.sourceUpdatedAt) {
    return { status: 'unchanged', workspaceName, workspaceId: copy.id };
  }

  const sources = await loadMarvaSources(config, deps.load);
  const hash = createHash('sha256').update(JSON.stringify(sources)).digest('hex');

  const current = deps.listWorkspaces().filter(ws => ws.name === workspaceName);
  if (ourCopy() && state.hash === hash) {
    // Same files: just remember the date (kept as is if GitHub's API failed)
    if (sourceUpdatedAt && sourceUpdatedAt !== state.sourceUpdatedAt) {
      deps.writeState({ ...state, sourceUpdatedAt });
    }
    return { status: 'unchanged', workspaceName, workspaceId: current[0].id };
  }

  // Everything below is synchronous, so no request sees it half done.
  // Clear out a copy left by an import that failed part way.
  const tempName = importingName(workspaceName);
  const removeTemp = () => deps.listWorkspaces()
    .filter(ws => ws.name === tempName)
    .forEach(ws => deps.deleteWorkspace(ws.id));
  removeTemp();

  let workspaceId: string;
  try {
    workspaceId = deps.importProfiles(tempName, sources.profiles).workspaceId;
    if (sources.startingPoints) {
      deps.importStartingPoints(workspaceId, sources.startingPoints);
    }
  } catch (error) {
    removeTemp();
    throw error;
  }

  current.forEach(ws => deps.deleteWorkspace(ws.id));
  deps.renameWorkspace(workspaceId, workspaceName);
  deps.writeState({ workspaceName, workspaceId, hash, syncedAt: deps.now().toISOString(), sourceUpdatedAt });

  return { status: 'synced', workspaceName, workspaceId, replaced: current.length };
}

/**
 * When the sources last changed, from their commit history. Undefined when
 * unknown (no history configured, or GitHub's API failed or hit its rate
 * limit); the check then downloads the files to compare them instead.
 */
async function findSourceUpdatedAt(config: SyncConfig, deps: SyncDeps): Promise<string | undefined> {
  if (!config.commitHistory?.length) {
    return undefined;
  }
  try {
    return (await deps.lastCommitDate(config.commitHistory)) ?? undefined;
  } catch (error) {
    console.error(`Unable to find when "${config.workspaceName}" last changed:`, error);
    return undefined;
  }
}

/** The newest commit date across GitHub "list commits" API URLs */
export async function fetchLastCommitDate(urls: string[]): Promise<string | null> {
  let newest: string | null = null;
  for (const url of urls) {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dctap-dancer' },
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }
    const commits = await response.json() as Array<{ commit?: { committer?: { date?: string } } }>;
    const date = commits[0]?.commit?.committer?.date;
    if (date && (!newest || Date.parse(date) > Date.parse(newest))) {
      newest = date;
    }
  }
  return newest;
}

/**
 * For the editor's workspace list: add the source's name and when it last
 * changed (in seconds, like updatedAt) to the synced workspace, for its card.
 * Left out while the date is unknown, so the card shows Created/Modified.
 */
export function withSourceInfo<T extends { name: string }>(
  workspaces: T[],
  config: SyncConfig,
  sourceUpdatedAt: string | null
): Array<T & { sourceName?: string; sourceUrl?: string; sourceUpdatedAt?: number }> {
  const time = sourceUpdatedAt ? Math.floor(Date.parse(sourceUpdatedAt) / 1000) : NaN;
  if (!config.sourceName || Number.isNaN(time)) {
    return workspaces;
  }
  return workspaces.map(ws => (
    ws.name === config.workspaceName
      ? { ...ws, sourceName: config.sourceName, sourceUrl: config.sourceUrl, sourceUpdatedAt: time }
      : ws
  ));
}

/** When the synced workspace's source last changed, as last looked up */
export function readSourceUpdatedAt(config: SyncConfig, deps: Pick<SyncDeps, 'readState'> = defaultDeps): string | null {
  const state = deps.readState();
  return (state?.workspaceName === config.workspaceName && state.sourceUpdatedAt) || null;
}

const DATA_DIR = join(process.cwd(), 'data');
const STATE_FILE = join(DATA_DIR, 'bluecore-sync-state.json');
const LOCK_FILE = join(DATA_DIR, 'locked-workspaces.json');

/** Add a workspace name to the dancer's locked-workspaces.json (keeps what's there) */
export function lockWorkspaceName(name: string, file: string = LOCK_FILE): boolean {
  const config = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {};
  const names: string[] = config.lockedWorkspaceNames || [];
  if (names.includes(name)) {
    return false;
  }
  config.lockedWorkspaceIds = config.lockedWorkspaceIds || [];
  config.lockedWorkspaceNames = [...names, name];
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  return true;
}

const defaultDeps: SyncDeps = {
  load: loadJson,
  listWorkspaces: () => workspaceService.list(),
  importProfiles: importMarvaProfiles,
  importStartingPoints,
  deleteWorkspace: id => {
    workspaceService.delete(id);
    invalidateWorkspaceCache(id);
  },
  renameWorkspace: (id, name) => workspaceService.update(id, name),
  lastCommitDate: fetchLastCommitDate,
  lock: name => {
    if (lockWorkspaceName(name)) {
      lockedWorkspacesService.reload();
    }
  },
  readState: () => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf-8')) : null),
  writeState: state => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n'),
  now: () => new Date()
};
