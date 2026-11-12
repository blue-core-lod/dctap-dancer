# Dependencies are installed with `npm ci` from the committed workspace
# package-lock.json so builds are reproducible and don't re-resolve the
# dependency tree on every build (a fresh resolve with npm 10.9 currently
# crashes with "Cannot read properties of null (reading 'edgesOut')").

# Frontend build stage
FROM node:24-alpine AS frontend-builder

# npm 10.9 (bundled with node:22) crashes resolving some trees; use npm 12
RUN npm install -g npm@12


ARG VITE_BASE_PATH=./
ENV VITE_BASE_PATH=$VITE_BASE_PATH

WORKDIR /app

# Copy workspace manifests and lockfile
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install frontend dependencies from the lockfile
RUN npm ci --workspace=frontend

# Copy frontend source
COPY frontend/ ./frontend/

# Build frontend
WORKDIR /app/frontend
RUN npm run build

# Backend build stage
FROM node:24-alpine AS backend-builder

# npm 10.9 (bundled with node:22) crashes resolving some trees; use npm 12
RUN npm install -g npm@12

WORKDIR /app

# Copy workspace manifests and lockfile
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install backend dependencies (including dev for building) from the lockfile
RUN npm ci --workspace=backend

# Copy backend source code
COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src

# Build TypeScript
WORKDIR /app/backend
RUN npm run build

# Production stage
FROM node:24-alpine AS production

# npm 10.9 (bundled with node:22) crashes resolving some trees; use npm 12
RUN npm install -g npm@12

WORKDIR /app

# Create non-root user for security and install su-exec for entrypoint
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    apk add --no-cache su-exec

# Copy workspace manifests and lockfile
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install production dependencies only, then strip the workspace scaffolding
# so /app ends up as a plain backend package (cwd-relative paths rely on this)
RUN npm ci --workspace=backend --omit=dev && \
    npm cache clean --force && \
    rm -rf node_modules/backend node_modules/frontend backend frontend package-lock.json

# Backend package.json provides "type": "module" for dist/index.js
COPY backend/package.json ./package.json

# Copy built backend files
COPY --from=backend-builder /app/backend/dist ./dist

# Copy built frontend files
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create data directory for SQLite databases
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start via entrypoint (runs as root to fix permissions, then drops to nodejs)
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
