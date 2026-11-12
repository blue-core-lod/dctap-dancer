import express from 'express';
import cors from 'cors';
import { join } from 'path';
import { existsSync } from 'fs';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import workspacesRouter from './routes/workspaces.js';
import shapesRouter from './routes/shapes.js';
import rowsRouter from './routes/rows.js';
import namespacesRouter from './routes/namespaces.js';
import foldersRouter from './routes/folders.js';
import importExportRouter from './routes/import-export.js';
import marvaProfileRouter from './routes/marva-profile.js';
import startingPointRouter from './routes/starting-point.js';
import serveRouter from './routes/serve.js';
import { workspaceService } from './services/database.js';
import { addBluecoreAuth, addLcLatestRoutes, setupBluecoreWorkspaces } from './bluecore/index.js'; // BLUECORE

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
addBluecoreAuth(app); // BLUECORE: require a Keycloak login on /api (see src/bluecore)
addLcLatestRoutes(app); // BLUECORE: "LC Latest" sync status and dates (see src/bluecore)

// API Routes
app.use('/api/workspaces', workspacesRouter);
app.use('/api/workspaces/:workspaceId/shapes', shapesRouter);
app.use('/api/workspaces/:workspaceId/shapes/:shapeId/rows', rowsRouter);
app.use('/api/workspaces/:workspaceId/namespaces', namespacesRouter);
app.use('/api/workspaces/:workspaceId/folders', foldersRouter);
app.use('/api', importExportRouter);
app.use('/api/marva-profile', marvaProfileRouter);
app.use('/api/starting-point', startingPointRouter);
app.use('/api/serve', serveRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Serve frontend static files
const frontendPath = join(process.cwd(), 'frontend', 'dist');
if (existsSync(frontendPath)) {
  app.use(express.static(frontendPath));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(join(frontendPath, 'index.html'));
  });
} else {
  console.warn(`Frontend not found at ${frontendPath}. Run 'npm run build' in frontend directory.`);
}

// Error handling (only for API routes now)
app.use('/api', notFoundHandler);
app.use(errorHandler);

// Initialize database and start server
async function start() {
  await workspaceService.init();
  await setupBluecoreWorkspaces(); // BLUECORE: create "Blue Core" and sync "LC Latest" (see src/bluecore)
  app.listen(PORT, () => {
    console.log(`DCTap Editor API running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);

export default app;
