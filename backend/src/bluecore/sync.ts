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
 * - Checks LC's files at startup and then every hour (LC_LATEST below).
 * - Only re-imports when the sources changed since the last sync (or the
 *   workspace is missing). The import builds a new workspace, then replaces the
 *   old one, so nobody ever sees a half-imported workspace.
 * - The workspace is locked (read-only, see data/locked-workspaces.json): it
 *   can't be edited, renamed or deleted, because every sync would replace those
 *   edits. Duplicate it to get an editable copy; copies are never touched.
 * - A re-import gives the workspace a new ID. Blue Core Marva remembers the
 *   selected workspace by name too, so users stay on it.
 * - "Modified" on the editor's home page shows when LC last changed the files
 *   (their last commit on GitHub), not when the dancer imported them.
 * - If LC's files can't be loaded (GitHub down, network blocked, a bad
 *   file), the current workspace is kept as is and the next hourly check
 *   tries again. The failure is recorded, and the dancer's Blue Core bar
 *   shows it (GET /api/bluecore/lc-latest).
 */
export interface SyncConfig {
  workspaceName: string;
  profilesSource: string;
  startingPointsSource?: string;
  intervalMinutes: number;
  // GitHub API URLs listing the sources' commits, to find when they last changed
  commitHistory?: string[];
}

/** What the last checks did, saved in data/bluecore-sync-state.json */
export interface SyncState {
  workspaceName: string;
  workspaceId?: string;   // set once imported
  hash?: string;          // fingerprint of LC's files at the last import
  syncedAt?: string;      // last import (LC's files had changed)
  sourceUpdatedAt?: string; // when LC last changed the files (last commit)
  checkedAt?: string;     // last check, whether or not it reached LC
  lastSuccessAt?: string; // last check that reached LC
  lastError?: string;     // why the last check failed (cleared on success)
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

const LC_PROFILES = 'https://raw.githubusercontent.com/lcnetdev/marva-profiles/refs/heads/main/marva-prod';
const LC_COMMITS = 'https://api.github.com/repos/lcnetdev/marva-profiles/commits?sha=main&per_page=1&path=marva-prod';

export const LC_LATEST: SyncConfig = {
  workspaceName: 'LC Latest',
  profilesSource: `${LC_PROFILES}/marva-profiles.json`,
  startingPointsSource: `${LC_PROFILES}/marva-starting.json`,
  intervalMinutes: 60,
  commitHistory: [`${LC_COMMITS}/marva-profiles.json`, `${LC_COMMITS}/marva-starting.json`]
};

export type SyncResult =
  | { status: 'unchanged'; workspaceName: string; workspaceId: string }
  | { status: 'synced'; workspaceName: string; workspaceId: string; replaced: number };

/** Name of the workspace while it is being imported, before it replaces the old one */
export function importingName(workspaceName: string): string {
  return `${workspaceName} (updating)`;
}

export async function syncWorkspace(config: SyncConfig, deps: SyncDeps = defaultDeps): Promise<SyncResult> {
  const { workspaceName } = config;
  const saved = deps.readState();
  const state: SyncState = saved?.workspaceName === workspaceName ? saved : { workspaceName };
  const checkedAt = deps.now().toISOString();

  try {
    return await checkAndImport(config, deps, state, checkedAt);
  } catch (error) {
    // Keep the current workspace; record why so the editor can show it
    deps.writeState({ ...state, checkedAt, lastError: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function checkAndImport(
  config: SyncConfig,
  deps: SyncDeps,
  state: SyncState,
  checkedAt: string
): Promise<SyncResult> {
  const { workspaceName } = config;
  deps.lock(workspaceName);

  const sources = await loadMarvaSources(config, deps.load);
  const hash = createHash('sha256').update(JSON.stringify(sources)).digest('hex');

  const current = deps.listWorkspaces().filter(ws => ws.name === workspaceName);
  const unchanged = current.length === 1 && state.hash === hash && state.workspaceId === current[0].id;

  // Look the date up again only when the files changed (or it's still unknown)
  const sourceUpdatedAt = unchanged && state.sourceUpdatedAt
    ? state.sourceUpdatedAt
    : await findSourceUpdatedAt(config, deps);

  if (unchanged) {
    deps.writeState({ ...state, sourceUpdatedAt, checkedAt, lastSuccessAt: checkedAt, lastError: undefined });
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
  deps.writeState({ workspaceName, workspaceId, hash, syncedAt: checkedAt, sourceUpdatedAt, checkedAt, lastSuccessAt: checkedAt });

  return { status: 'synced', workspaceName, workspaceId, replaced: current.length };
}

/**
 * When the sources last changed, from their commit history. Undefined when
 * unknown (no history configured, or GitHub's API failed or hit its rate
 * limit); the editor then shows the import date, and the next check retries.
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
 * For the editor's workspace list: show the synced workspace's "Modified" as
 * when the source last changed, instead of when the dancer imported it.
 */
export function withSourceUpdatedAt<T extends { name: string; updatedAt: number }>(
  workspaces: T[],
  workspaceName: string,
  sourceUpdatedAt: string | null
): T[] {
  const time = sourceUpdatedAt ? Math.floor(Date.parse(sourceUpdatedAt) / 1000) : NaN;
  if (Number.isNaN(time)) {
    return workspaces;
  }
  return workspaces.map(ws => (ws.name === workspaceName ? { ...ws, updatedAt: time } : ws));
}

/** For the editor: the saved state of the last checks, plus how often they run */
export function syncStatus(config: SyncConfig, deps: Pick<SyncDeps, 'readState' | 'listWorkspaces'> = defaultDeps) {
  const saved = deps.readState();
  const state = saved?.workspaceName === config.workspaceName ? saved : null;
  return {
    workspaceName: config.workspaceName,
    available: deps.listWorkspaces().some(ws => ws.name === config.workspaceName),
    intervalMinutes: config.intervalMinutes,
    syncedAt: state?.syncedAt ?? null,
    sourceUpdatedAt: state?.sourceUpdatedAt ?? null,
    checkedAt: state?.checkedAt ?? null,
    lastSuccessAt: state?.lastSuccessAt ?? state?.syncedAt ?? null,
    lastError: state?.lastError ?? null
  };
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
