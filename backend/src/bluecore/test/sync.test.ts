import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// sync.ts imports the real services; keep them from touching ./data
vi.mock('../../services/database.js', () => ({ workspaceService: { list: vi.fn(() => []) } }));
vi.mock('../../services/cache.js', () => ({ invalidateWorkspaceCache: vi.fn() }));
vi.mock('../../services/locked-workspaces.js', () => ({ lockedWorkspacesService: { reload: vi.fn() } }));
vi.mock('../../services/marva-profile.js', () => ({ importMarvaProfiles: vi.fn() }));
vi.mock('../../services/starting-point.js', () => ({ importStartingPoints: vi.fn() }));

import {
  LC_LATEST, fetchLastCommitDate, lockWorkspaceName, msUntilNextCheck, readSourceUpdatedAt, syncWorkspace, withSourceInfo, SyncDeps, SyncState
} from '../sync.js';

const profiles = [{ id: 'p1', json: { Profile: { id: 'lc:RT:bf2:Monograph' } } }];
const newerProfiles = [{ id: 'p1', json: { Profile: { id: 'lc:RT:bf2:Monograph', title: 'v2' } } }];
const startingPoints = [{ id: 'sp', name: 'config', configType: 'startingPoints', json: [{ menuGroup: 'M', menuItems: [] }] }];

const config = {
  workspaceName: 'LC Latest', profilesSource: 'p.json', startingPointsSource: 's.json', checkAtMinute: 15,
  commitHistory: ['commits/p.json', 'commits/s.json']
};

/** In-memory workspaces and state, with the same steps the real services take */
function makeDeps(sources: Record<string, unknown>, initial: Array<{ id: string; name: string }> = []) {
  let workspaces = [...initial];
  let state: SyncState | null = null;
  let nextId = 1;
  const clock = { now: '2026-11-12T10:00:00.000Z' };
  const commit = { date: '2026-10-01T12:00:00Z' }; // LC's last commit to the files
  const deps: SyncDeps = {
    load: vi.fn(async (source: string) => {
      if (!(source in sources)) throw new Error(`missing ${source}`);
      return sources[source];
    }),
    listWorkspaces: () => workspaces,
    importProfiles: vi.fn((name: string) => {
      const id = `ws-${nextId++}`;
      workspaces = [...workspaces, { id, name }];
      return { workspaceId: id };
    }),
    importStartingPoints: vi.fn(),
    deleteWorkspace: vi.fn((id: string) => { workspaces = workspaces.filter(ws => ws.id !== id); }),
    renameWorkspace: vi.fn((id: string, name: string) => {
      workspaces = workspaces.map(ws => (ws.id === id ? { ...ws, name } : ws));
    }),
    lock: vi.fn(),
    lastCommitDate: vi.fn(async () => commit.date),
    readState: () => state,
    writeState: vi.fn((s: SyncState) => { state = s; }),
    now: () => new Date(clock.now)
  };
  return { deps, names: () => workspaces.map(ws => ws.name), sources, state: () => state, clock, commit };
}

describe('LC_LATEST', () => {
  it('follows LC\'s marva-prod profiles hourly, at 15 past', () => {
    expect(LC_LATEST.workspaceName).toBe('LC Latest');
    expect(LC_LATEST.profilesSource).toMatch(/lcnetdev\/marva-profiles\/.*\/marva-prod\/marva-profiles\.json$/);
    expect(LC_LATEST.startingPointsSource).toMatch(/marva-prod\/marva-starting\.json$/);
    expect(LC_LATEST.checkAtMinute).toBe(15);
  });
});

describe('msUntilNextCheck', () => {
  it('waits until the next 15 minutes past the hour', () => {
    expect(msUntilNextCheck(15, new Date('2026-11-12T10:00:00Z'))).toBe(15 * 60_000);
    expect(msUntilNextCheck(15, new Date('2026-11-12T10:20:00Z'))).toBe(55 * 60_000);
    expect(msUntilNextCheck(15, new Date('2026-11-12T10:15:00Z'))).toBe(60 * 60_000);
    expect(msUntilNextCheck(15, new Date('2026-11-12T23:30:00Z'))).toBe(45 * 60_000);
  });
});

describe('syncWorkspace', () => {
  it('creates and locks the workspace on first run', async () => {
    const { deps, names } = makeDeps({ 'p.json': profiles, 's.json': startingPoints });
    expect(await syncWorkspace(config, deps)).toEqual({
      status: 'synced', workspaceName: 'LC Latest', workspaceId: 'ws-1', replaced: 0
    });
    expect(names()).toEqual(['LC Latest']);
    expect(deps.lock).toHaveBeenCalledWith('LC Latest');
    expect(deps.importStartingPoints).toHaveBeenCalledWith('ws-1', startingPoints);
  });

  it('leaves the workspace alone when the sources have not changed', async () => {
    const { deps } = makeDeps({ 'p.json': profiles, 's.json': startingPoints });
    await syncWorkspace(config, deps);
    expect(await syncWorkspace(config, deps)).toEqual({
      status: 'unchanged', workspaceName: 'LC Latest', workspaceId: 'ws-1'
    });
    expect(deps.importProfiles).toHaveBeenCalledTimes(1);
  });

  it('replaces the workspace when the sources change, keeping other workspaces', async () => {
    const { deps, names, sources, commit } = makeDeps(
      { 'p.json': profiles, 's.json': startingPoints },
      [{ id: 'bc', name: 'Blue Core' }]
    );
    await syncWorkspace(config, deps);
    sources['p.json'] = newerProfiles;
    commit.date = '2026-11-12T14:00:03Z';
    expect(await syncWorkspace(config, deps)).toEqual({
      status: 'synced', workspaceName: 'LC Latest', workspaceId: 'ws-2', replaced: 1
    });
    expect(deps.importProfiles).toHaveBeenLastCalledWith('LC Latest (updating)', newerProfiles);
    expect(names()).toEqual(['Blue Core', 'LC Latest']);
  });

  it('recreates the workspace if it went missing', async () => {
    const { deps, names } = makeDeps({ 'p.json': profiles, 's.json': startingPoints });
    await syncWorkspace(config, deps);
    deps.deleteWorkspace('ws-1');
    expect((await syncWorkspace(config, deps)).status).toBe('synced');
    expect(names()).toEqual(['LC Latest']);
  });

  it('keeps the current workspace when a source fails to load', async () => {
    const { deps, names, sources, commit } = makeDeps({ 'p.json': profiles, 's.json': startingPoints });
    await syncWorkspace(config, deps);
    sources['p.json'] = { not: 'profiles' };
    commit.date = '2026-11-12T14:00:03Z';
    await expect(syncWorkspace(config, deps)).rejects.toThrow('not a Marva profiles array');
    expect(names()).toEqual(['LC Latest']);
  });

  it('removes a half-imported copy when the import fails', async () => {
    const { deps, names } = makeDeps({ 'p.json': profiles, 's.json': startingPoints }, [{ id: 'old', name: 'LC Latest' }]);
    vi.mocked(deps.importStartingPoints).mockImplementation(() => { throw new Error('bad starting points'); });
    await expect(syncWorkspace(config, deps)).rejects.toThrow('bad starting points');
    expect(names()).toEqual(['LC Latest']);
  });

  it('clears out a copy left by an earlier failed run', async () => {
    const { deps, names } = makeDeps(
      { 'p.json': profiles, 's.json': startingPoints },
      [{ id: 'leftover', name: 'LC Latest (updating)' }]
    );
    await syncWorkspace(config, deps);
    expect(names()).toEqual(['LC Latest']);
  });
});

describe('readSourceUpdatedAt', () => {
  it('reads when LC last changed the files, once known', async () => {
    const { deps } = makeDeps({ 'p.json': profiles, 's.json': startingPoints });
    expect(readSourceUpdatedAt(config, deps)).toBeNull();
    await syncWorkspace(config, deps);
    expect(readSourceUpdatedAt(config, deps)).toBe('2026-10-01T12:00:00Z');
  });
});

describe('when LC last changed the files', () => {
  it('skips the download when LC\'s last commit is the one we have', async () => {
    const { deps, state } = makeDeps({ 'p.json': profiles, 's.json': startingPoints });
    await syncWorkspace(config, deps);
    expect(deps.lastCommitDate).toHaveBeenCalledWith(['commits/p.json', 'commits/s.json']);
    expect(state()?.sourceUpdatedAt).toBe('2026-10-01T12:00:00Z');
    expect(deps.load).toHaveBeenCalledTimes(2);

    expect((await syncWorkspace(config, deps)).status).toBe('unchanged');
    expect(deps.load).toHaveBeenCalledTimes(2);
  });

  it('downloads and re-imports after a new commit', async () => {
    const { deps, state, sources, commit } = makeDeps({ 'p.json': profiles, 's.json': startingPoints });
    await syncWorkspace(config, deps);
    commit.date = '2026-11-12T14:00:03Z';
    sources['p.json'] = newerProfiles;
    expect((await syncWorkspace(config, deps)).status).toBe('synced');
    expect(state()?.sourceUpdatedAt).toBe('2026-11-12T14:00:03Z');
  });

  it('falls back to downloading and comparing when GitHub\'s API fails', async () => {
    const { deps, state } = makeDeps({ 'p.json': profiles, 's.json': startingPoints });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await syncWorkspace(config, deps);

    vi.mocked(deps.lastCommitDate).mockRejectedValueOnce(new Error('HTTP 403 rate limited'));
    expect((await syncWorkspace(config, deps)).status).toBe('unchanged');
    expect(deps.load).toHaveBeenCalledTimes(4);
    expect(state()?.sourceUpdatedAt).toBe('2026-10-01T12:00:00Z');
  });

  it('leaves the date unknown on a first import without GitHub\'s API, and fills it in later', async () => {
    const { deps, state } = makeDeps({ 'p.json': profiles, 's.json': startingPoints });
    vi.mocked(deps.lastCommitDate).mockRejectedValueOnce(new Error('HTTP 403 rate limited'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await syncWorkspace(config, deps)).status).toBe('synced');
    expect(state()?.sourceUpdatedAt).toBeUndefined();

    expect((await syncWorkspace(config, deps)).status).toBe('unchanged');
    expect(state()?.sourceUpdatedAt).toBe('2026-10-01T12:00:00Z');
    expect(deps.importProfiles).toHaveBeenCalledTimes(1);
  });

  it('adds the source and its date to the synced workspace only, for its card', () => {
    const list = [{ name: 'LC Latest', updatedAt: 1 }, { name: 'Blue Core', updatedAt: 2 }];
    expect(withSourceInfo(list, LC_LATEST, '2026-10-01T12:00:00Z')).toEqual([
      {
        name: 'LC Latest', updatedAt: 1,
        sourceName: 'Library of Congress Profiles',
        sourceUrl: 'https://github.com/lcnetdev/marva-profiles/tree/main/marva-prod',
        sourceUpdatedAt: Date.parse('2026-10-01T12:00:00Z') / 1000
      },
      { name: 'Blue Core', updatedAt: 2 }
    ]);
  });

  it('adds nothing while the date is unknown', () => {
    const list = [{ name: 'LC Latest', updatedAt: 1 }];
    expect(withSourceInfo(list, LC_LATEST, null)).toBe(list);
  });

  it('takes the newest commit across the files', async () => {
    const dates: Record<string, string> = { a: '2026-09-01T00:00:00Z', b: '2026-11-12T14:00:03Z' };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true, json: async () => [{ commit: { committer: { date: dates[url] } } }]
    })));
    try {
      expect(await fetchLastCommitDate(['a', 'b'])).toBe('2026-11-12T14:00:03Z');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('lockWorkspaceName', () => {
  it('adds the name and keeps existing locks', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'lock-')), 'locked-workspaces.json');
    writeFileSync(file, JSON.stringify({ lockedWorkspaceIds: ['abc'], lockedWorkspaceNames: ['Public'] }));
    expect(lockWorkspaceName('LC Latest', file)).toBe(true);
    expect(lockWorkspaceName('LC Latest', file)).toBe(false);
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({
      lockedWorkspaceIds: ['abc'], lockedWorkspaceNames: ['Public', 'LC Latest']
    });
  });

  it('creates the file when missing', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'lock-')), 'locked-workspaces.json');
    lockWorkspaceName('LC Latest', file);
    expect(JSON.parse(readFileSync(file, 'utf-8')).lockedWorkspaceNames).toEqual(['LC Latest']);
  });
});
