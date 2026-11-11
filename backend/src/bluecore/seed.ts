// BLUECORE: startup seeding of a workspace (e.g. "Blue Core") from Marva profile JSON.
import { readFile } from 'fs/promises';
import { workspaceService } from '../services/database.js';
import { importMarvaProfiles } from '../services/marva-profile.js';
import { importStartingPoints } from '../services/starting-point.js';
import { MarvaProfileDocument } from '../types/marva-profile.js';
import { StartingPointFile } from '../types/starting-point.js';

/**
 * Optional startup seeding of a workspace from Marva profile and starting
 * point JSON (e.g. LC's https://github.com/lcnetdev/marva-profiles).
 *
 *   SEED_WORKSPACE_NAME          Workspace to create (e.g. Blue Core)
 *   SEED_PROFILES_SOURCE         URL or file path of a Marva profiles JSON array
 *   SEED_STARTING_POINTS_SOURCE  URL or file path of a starting points JSON file (optional)
 *
 * When it runs
 * ------------
 * Only at server startup (never on a page load), only when SEED_WORKSPACE_NAME
 * and SEED_PROFILES_SOURCE are set, and only if NO workspace is named exactly
 * SEED_WORKSPACE_NAME. If one exists, seeding stops before loading anything,
 * so an existing workspace is never overwritten: edits survive restarts,
 * rebuilds, and image upgrades.
 *
 * Because the check is by exact, case-sensitive name, a fresh copy of the
 * sources is created whenever no workspace has that name:
 *
 *   Edit "Blue Core", restart       -> kept, seeding skipped
 *   Delete "Blue Core", restart     -> fresh copy created (the intended way to reseed)
 *   Rename "Blue Core" (even to     -> a NEW unedited "Blue Core" is created next to it.
 *     "blue core"), restart            Blue Core Marva picks its default workspace by
 *                                      this name (dancerDefaultWorkspace), so users
 *                                      without their own selection quietly switch to
 *                                      the fresh copy. Don't rename the default.
 *   Data directory lost             -> fresh copy created; all edits are gone
 *   SEED_WORKSPACE_NAME changed     -> a new workspace is created alongside the old
 *                                      one; update Marva's dancerDefaultWorkspace too
 *
 * Seeding is a one-time copy: later changes to the sources (e.g. LC updating
 * marva-profiles) never reach an existing workspace. Bring them in by importing
 * the new file as a separate workspace and copying shapes across.
 */
export interface SeedConfig {
  workspaceName: string;
  profilesSource: string;
  startingPointsSource?: string;
}

export interface SeedDeps {
  load: (source: string) => Promise<unknown>;
  listWorkspaces: () => Array<{ name: string }>;
  importProfiles: (name: string, profiles: MarvaProfileDocument[]) => { workspaceId: string };
  importStartingPoints: (workspaceId: string, data: StartingPointFile) => unknown;
}

export type SeedResult =
  | { status: 'disabled' }
  | { status: 'exists'; workspaceName: string }
  | { status: 'seeded'; workspaceName: string; workspaceId: string; startingPoints: boolean };

export function loadSeedConfig(env: NodeJS.ProcessEnv = process.env): SeedConfig | null {
  const workspaceName = env.SEED_WORKSPACE_NAME?.trim();
  const profilesSource = env.SEED_PROFILES_SOURCE?.trim();
  if (!workspaceName || !profilesSource) {
    return null;
  }
  return {
    workspaceName,
    profilesSource,
    startingPointsSource: env.SEED_STARTING_POINTS_SOURCE?.trim() || undefined
  };
}

/** Read JSON from an http(s) URL or a local file path */
export async function loadJson(source: string): Promise<unknown> {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${source}`);
    }
    return response.json();
  }
  return JSON.parse(await readFile(source, 'utf-8'));
}

const defaultDeps: SeedDeps = {
  load: loadJson,
  listWorkspaces: () => workspaceService.list(),
  importProfiles: importMarvaProfiles,
  importStartingPoints
};

export async function seedWorkspace(config: SeedConfig | null, deps: SeedDeps = defaultDeps): Promise<SeedResult> {
  if (!config) {
    return { status: 'disabled' };
  }

  const { workspaceName } = config;
  if (deps.listWorkspaces().some(ws => ws.name === workspaceName)) {
    return { status: 'exists', workspaceName };
  }

  // Load everything before creating the workspace so a bad source leaves no half-seeded workspace
  const profiles = await deps.load(config.profilesSource);
  if (!Array.isArray(profiles) || profiles.length === 0 || !profiles.every(p => p?.json?.Profile)) {
    throw new Error(`${config.profilesSource} is not a Marva profiles array`);
  }
  const startingPoints = config.startingPointsSource
    ? await deps.load(config.startingPointsSource)
    : undefined;
  if (startingPoints !== undefined && (!Array.isArray(startingPoints) || startingPoints.length === 0)) {
    throw new Error(`${config.startingPointsSource} is not a starting points file`);
  }

  const { workspaceId } = deps.importProfiles(workspaceName, profiles as MarvaProfileDocument[]);
  if (startingPoints) {
    deps.importStartingPoints(workspaceId, startingPoints as StartingPointFile);
  }

  return { status: 'seeded', workspaceName, workspaceId, startingPoints: Boolean(startingPoints) };
}
