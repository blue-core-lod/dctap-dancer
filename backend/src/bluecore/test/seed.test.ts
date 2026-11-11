import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// seed.ts imports the real services; keep them from touching ./data
vi.mock('../../services/database.js', () => ({ workspaceService: { list: vi.fn(() => []) } }));
vi.mock('../../services/marva-profile.js', () => ({ importMarvaProfiles: vi.fn() }));
vi.mock('../../services/starting-point.js', () => ({ importStartingPoints: vi.fn() }));

import { loadSeedConfig, loadJson, seedWorkspace, SeedDeps } from '../seed.js';

const profiles = [{ id: 'p1', json: { Profile: { id: 'lc:RT:bf2:Monograph' } } }];
const startingPoints = [{ id: 'sp', name: 'config', configType: 'startingPoints', json: [{ menuGroup: 'M', menuItems: [] }] }];

function makeDeps(existing: string[] = [], sources: Record<string, unknown> = {}): SeedDeps {
  return {
    load: vi.fn(async (source: string) => {
      if (!(source in sources)) throw new Error(`missing ${source}`);
      return sources[source];
    }),
    listWorkspaces: vi.fn(() => existing.map(name => ({ name }))),
    importProfiles: vi.fn(() => ({ workspaceId: 'ws-1' })),
    importStartingPoints: vi.fn()
  };
}

const config = { workspaceName: 'Blue Core', profilesSource: 'p.json', startingPointsSource: 's.json' };

describe('loadSeedConfig', () => {
  it('is disabled unless both the name and profiles source are set', () => {
    expect(loadSeedConfig({})).toBeNull();
    expect(loadSeedConfig({ SEED_WORKSPACE_NAME: 'Blue Core' })).toBeNull();
    expect(loadSeedConfig({ SEED_PROFILES_SOURCE: 'p.json' })).toBeNull();
  });

  it('reads the seed settings', () => {
    expect(loadSeedConfig({
      SEED_WORKSPACE_NAME: ' Blue Core ',
      SEED_PROFILES_SOURCE: 'p.json',
      SEED_STARTING_POINTS_SOURCE: ''
    })).toEqual({ workspaceName: 'Blue Core', profilesSource: 'p.json', startingPointsSource: undefined });
  });
});

describe('loadJson', () => {
  it('reads a local file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'seed-'));
    const file = join(dir, 'p.json');
    writeFileSync(file, JSON.stringify(profiles));
    expect(await loadJson(file)).toEqual(profiles);
  });
});

describe('seedWorkspace', () => {
  it('does nothing when disabled', async () => {
    const deps = makeDeps();
    expect(await seedWorkspace(null, deps)).toEqual({ status: 'disabled' });
    expect(deps.load).not.toHaveBeenCalled();
  });

  it('skips an existing workspace so edits survive restarts', async () => {
    const deps = makeDeps(['Blue Core']);
    expect(await seedWorkspace(config, deps)).toEqual({ status: 'exists', workspaceName: 'Blue Core' });
    expect(deps.load).not.toHaveBeenCalled();
    expect(deps.importProfiles).not.toHaveBeenCalled();
  });

  it('imports profiles and starting points into a new workspace', async () => {
    const deps = makeDeps([], { 'p.json': profiles, 's.json': startingPoints });
    expect(await seedWorkspace(config, deps)).toEqual({
      status: 'seeded', workspaceName: 'Blue Core', workspaceId: 'ws-1', startingPoints: true
    });
    expect(deps.importProfiles).toHaveBeenCalledWith('Blue Core', profiles);
    expect(deps.importStartingPoints).toHaveBeenCalledWith('ws-1', startingPoints);
  });

  it('seeds profiles alone when no starting points source is set', async () => {
    const deps = makeDeps([], { 'p.json': profiles });
    const result = await seedWorkspace({ workspaceName: 'Blue Core', profilesSource: 'p.json' }, deps);
    expect(result).toMatchObject({ status: 'seeded', startingPoints: false });
    expect(deps.importStartingPoints).not.toHaveBeenCalled();
  });

  it('creates nothing when a source cannot be loaded', async () => {
    const deps = makeDeps([], { 'p.json': profiles });
    await expect(seedWorkspace(config, deps)).rejects.toThrow('missing s.json');
    expect(deps.importProfiles).not.toHaveBeenCalled();
  });

  it('rejects data that is not a Marva profiles array', async () => {
    const deps = makeDeps([], { 'p.json': { not: 'an array' }, 's.json': startingPoints });
    await expect(seedWorkspace(config, deps)).rejects.toThrow('not a Marva profiles array');
    expect(deps.importProfiles).not.toHaveBeenCalled();
  });
});
