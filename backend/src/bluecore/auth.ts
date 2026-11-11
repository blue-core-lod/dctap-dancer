// BLUECORE: optional Keycloak (OpenID Connect) authentication for the API.
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify, JWTPayload, JWTVerifyGetKey } from 'jose';
import { AppError } from '../middleware/error-handler.js';

/**
 * Auth is enabled only when KEYCLOAK_URL is set, so a standalone install keeps
 * working without an identity provider.
 *
 *   KEYCLOAK_URL           Browser-facing Keycloak base URL (e.g. http://localhost/keycloak)
 *   KEYCLOAK_INTERNAL_URL  Server-side Keycloak base URL used to fetch signing keys
 *                          (defaults to KEYCLOAK_URL)
 *   KEYCLOAK_REALM         Realm name (default: bluecore)
 *   KEYCLOAK_CLIENT_ID     Public client the frontend logs in with (default: bluecore_api)
 *   KEYCLOAK_ISSUER        Expected token issuer (default: <KEYCLOAK_URL>/realms/<KEYCLOAK_REALM>)
 */
export interface AuthConfig {
  enabled: boolean;
  url: string;
  realm: string;
  clientId: string;
  issuer: string;
  jwksUrl: string;
}

export interface AuthUser {
  sub?: string;
  username?: string;
  email?: string;
  claims: JWTPayload;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

/**
 * Cookie the frontend keeps in sync with its access token. Browsers send it
 * with links they open directly (CSV/DB/profile downloads), which can't carry
 * an Authorization header. Accepted for GET requests only.
 */
export const TOKEN_COOKIE = 'dancer_access_token';

// Paths (relative to the /api mount) reachable without a token
const PUBLIC_PATHS = [/^\/health$/, /^\/auth\/config$/, /^\/serve(\/|$)/];

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const url = trimSlash(env.KEYCLOAK_URL || '');
  const internalUrl = trimSlash(env.KEYCLOAK_INTERNAL_URL || url);
  const realm = env.KEYCLOAK_REALM || 'bluecore';
  return {
    enabled: url !== '',
    url,
    realm,
    clientId: env.KEYCLOAK_CLIENT_ID || 'bluecore_api',
    issuer: env.KEYCLOAK_ISSUER || `${url}/realms/${realm}`,
    jwksUrl: `${internalUrl}/realms/${realm}/protocol/openid-connect/certs`
  };
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(value.join('='));
    }
  }
  return null;
}

/** The bearer token from the Authorization header, or the token cookie on GET */
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  if (req.method === 'GET') {
    return readCookie(req, TOKEN_COOKIE);
  }
  return null;
}

export function createAuthMiddleware(config: AuthConfig, getKey?: JWTVerifyGetKey): RequestHandler {
  if (!config.enabled) {
    return (_req, _res, next) => next();
  }

  const keys = getKey ?? createRemoteJWKSet(new URL(config.jwksUrl));

  return async (req: Request, _res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS' || PUBLIC_PATHS.some(pattern => pattern.test(req.path))) {
      return next();
    }

    const token = extractToken(req);
    if (!token) {
      return next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
    }

    try {
      const { payload } = await jwtVerify(token, keys, { issuer: config.issuer });
      req.user = {
        sub: payload.sub,
        username: payload.preferred_username as string | undefined,
        email: payload.email as string | undefined,
        claims: payload
      };
      next();
    } catch (error) {
      // jose errors carry ERR_J* codes; anything else (e.g. ECONNREFUSED) or a
      // JWKS timeout means the signing keys were unreachable, not a bad token
      const code = (error as { code?: string }).code || '';
      if (code === 'ERR_JWKS_TIMEOUT' || !code.startsWith('ERR_J')) {
        console.error('Unable to fetch Keycloak signing keys:', error);
        return next(new AppError(503, 'Authentication service unavailable', 'AUTH_UNAVAILABLE'));
      }
      next(new AppError(401, 'Invalid or expired token', 'UNAUTHORIZED'));
    }
  };
}

/** Public settings the frontend needs to start the Keycloak login flow */
export function publicAuthConfig(config: AuthConfig) {
  return {
    enabled: config.enabled,
    url: config.url,
    realm: config.realm,
    clientId: config.clientId
  };
}
