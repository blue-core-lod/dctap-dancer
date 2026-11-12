// BLUECORE: Blue Core plugin for the DCTap Dancer backend.
import { Express } from 'express';
import { loadAuthConfig, createAuthMiddleware, publicAuthConfig } from './auth.js';
import { loadSeedConfig, seedWorkspace } from './seed.js';
import { LC_LATEST, syncStatus, syncWorkspace, withSourceUpdatedAt } from './sync.js';
import { workspaceService } from '../services/database.js';

const authConfig = loadAuthConfig();

/**
 * Add Keycloak authentication to the API: a public /api/auth/config route the
 * frontend reads to start its login, and a token check on every other /api
 * route (except /api/health and the /api/serve routes Marva reads).
 * A no-op check unless KEYCLOAK_URL is set.
 *
 * Call after the body parsers and before the API routes.
 */
export function addBluecoreAuth(app: Express): void {
  console.log(authConfig.enabled
    ? `Keycloak auth enabled (issuer: ${authConfig.issuer})`
    : 'Keycloak auth disabled (set KEYCLOAK_URL to enable)');

  app.get('/api/auth/config', (_req, res) => {
    res.json({ success: true, data: publicAuthConfig(authConfig) });
  });

  app.use('/api', createAuthMiddleware(authConfig));
}

/**
 * Add the "LC Latest" routes:
 *   - GET /api/bluecore/lc-latest: when it last synced with LC (shown in the
 *     Blue Core bar)
 *   - the workspace list shows its "Modified" as when LC last changed the
 *     files, not when the dancer imported them
 *
 * Call after addBluecoreAuth() and before the API routes.
 */
export function addLcLatestRoutes(app: Express): void {
  app.get('/api/bluecore/lc-latest', (_req, res) => {
    res.json({ success: true, data: syncStatus(LC_LATEST) });
  });

  app.get('/api/workspaces', (_req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body) => {
      if (body?.success && Array.isArray(body.data)) {
        const { sourceUpdatedAt } = syncStatus(LC_LATEST);
        body = { ...body, data: withSourceUpdatedAt(body.data, LC_LATEST.workspaceName, sourceUpdatedAt) };
      }
      return json(body);
    };
    next();
  });
}

/**
 * Prepare Blue Core's workspaces at startup:
 *   - "Blue Core" (SEED_*): created once from LC's profiles, then edited by
 *     staff. See seed.ts.
 *   - "LC Latest": read-only, kept in sync with LC's profiles at startup
 *     and every hour. See sync.ts.
 *
 * Call after the database is initialized and before the server listens, so
 * Marva never reads a half-imported workspace. Failures are logged but don't
 * stop the editor from starting.
 */
export async function setupBluecoreWorkspaces(): Promise<void> {
  try {
    const result = await seedWorkspace(loadSeedConfig());
    if (result.status === 'seeded') {
      console.log(`Seeded workspace "${result.workspaceName}" (${result.workspaceId})`);
    } else if (result.status === 'exists') {
      console.log(`Seed skipped: workspace "${result.workspaceName}" already exists`);
    }
  } catch (error) {
    console.error('Workspace seeding failed:', error);
  }

  const syncConfig = LC_LATEST;
  let running = false;
  const runSync = async () => {
    if (running) return;
    running = true;
    try {
      const result = await syncWorkspace(syncConfig);
      if (result.status === 'synced') {
        console.log(`Synced workspace "${result.workspaceName}" (${result.workspaceId})`);
      }
    } catch (error) {
      console.error(`Syncing workspace "${syncConfig.workspaceName}" failed:`, error);
    } finally {
      running = false;
    }
  };

  // Wait for the first sync only when the workspace doesn't exist yet;
  // otherwise serve the current copy while checking for updates.
  const exists = workspaceService.list().some(ws => ws.name === syncConfig.workspaceName);
  if (exists) {
    void runSync();
  } else {
    await runSync();
  }
  if (syncConfig.intervalMinutes > 0) {
    setInterval(runSync, syncConfig.intervalMinutes * 60_000).unref();
  }
}
