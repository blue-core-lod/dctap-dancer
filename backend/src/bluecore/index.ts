// BLUECORE: Blue Core plugin for the DCTap Dancer backend.
import { Express } from 'express';
import { loadAuthConfig, createAuthMiddleware, publicAuthConfig } from './auth.js';
import { loadSeedConfig, seedWorkspace } from './seed.js';

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
 * Create the default workspace (SEED_WORKSPACE_NAME, e.g. "Blue Core") from
 * Marva profile JSON if it doesn't exist yet. A no-op unless the SEED_*
 * variables are set.
 *
 * Call after the database is initialized and before the server listens, so
 * Marva never reads a half-imported workspace. A failed seed is logged but
 * doesn't stop the editor from starting.
 */
export async function seedBluecoreWorkspace(): Promise<void> {
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
}
