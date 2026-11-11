// BLUECORE: tests for the Keycloak auth plugin (../auth.ts)
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, JWTVerifyGetKey, KeyLike } from 'jose';
import { loadAuthConfig, createAuthMiddleware, publicAuthConfig, TOKEN_COOKIE } from '../auth.js';
import { errorHandler } from '../../middleware/error-handler.js';

const config = loadAuthConfig({
  KEYCLOAK_URL: 'http://localhost/keycloak/',
  KEYCLOAK_INTERNAL_URL: 'http://keycloak:8080/keycloak/'
});

let privateKey: KeyLike;
let otherPrivateKey: KeyLike;
let getKey: JWTVerifyGetKey;

async function sign(key: KeyLike, claims: Record<string, unknown> = {}, issuer = config.issuer, expiresIn = '5m') {
  return new SignJWT({ preferred_username: 'developer', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject('user-1')
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

function createApp(middleware = createAuthMiddleware(config, getKey)) {
  const app = express();
  app.use('/api', middleware);
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/serve/workspaces', (_req, res) => res.json({ data: [] }));
  app.get('/api/workspaces', (req, res) => res.json({ user: req.user?.username }));
  app.post('/api/workspaces', (req, res) => res.json({ user: req.user?.username }));
  app.use(errorHandler);
  return app;
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  otherPrivateKey = (await generateKeyPair('RS256')).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' };
  getKey = createLocalJWKSet({ keys: [jwk] });
});

describe('loadAuthConfig', () => {
  it('is disabled without KEYCLOAK_URL', () => {
    expect(loadAuthConfig({}).enabled).toBe(false);
  });

  it('derives issuer from the external URL and JWKS from the internal URL', () => {
    expect(config.enabled).toBe(true);
    expect(config.issuer).toBe('http://localhost/keycloak/realms/bluecore');
    expect(config.jwksUrl).toBe('http://keycloak:8080/keycloak/realms/bluecore/protocol/openid-connect/certs');
    expect(config.clientId).toBe('bluecore_api');
  });

  it('only exposes public settings to the frontend', () => {
    expect(publicAuthConfig(config)).toEqual({
      enabled: true,
      url: 'http://localhost/keycloak',
      realm: 'bluecore',
      clientId: 'bluecore_api'
    });
  });
});

describe('createAuthMiddleware', () => {
  it('allows every request when auth is disabled', async () => {
    const app = createApp(createAuthMiddleware(loadAuthConfig({})));
    await request(app).get('/api/workspaces').expect(200);
  });

  it('allows public paths without a token', async () => {
    const app = createApp();
    await request(app).get('/api/health').expect(200);
    await request(app).get('/api/serve/workspaces').expect(200);
  });

  it('rejects requests without a token', async () => {
    const res = await request(createApp()).get('/api/workspaces').expect(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('accepts a valid bearer token and exposes the user', async () => {
    const token = await sign(privateKey);
    const res = await request(createApp())
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.user).toBe('developer');
  });

  it('accepts the token cookie on GET requests only', async () => {
    const token = await sign(privateKey);
    const cookie = `other=1; ${TOKEN_COOKIE}=${token}`;
    const res = await request(createApp()).get('/api/workspaces').set('Cookie', cookie).expect(200);
    expect(res.body.user).toBe('developer');
    await request(createApp()).post('/api/workspaces').set('Cookie', cookie).expect(401);
  });

  it('ignores ?access_token= so tokens stay out of URLs and logs', async () => {
    const token = await sign(privateKey);
    await request(createApp()).get(`/api/workspaces?access_token=${token}`).expect(401);
  });

  it('rejects tokens signed by an unknown key', async () => {
    const token = await sign(otherPrivateKey);
    await request(createApp()).get('/api/workspaces').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('rejects tokens from another issuer', async () => {
    const token = await sign(privateKey, {}, 'http://evil.example/realms/bluecore');
    await request(createApp()).get('/api/workspaces').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('rejects expired tokens', async () => {
    const token = await sign(privateKey, {}, config.issuer, '-1m');
    await request(createApp()).get('/api/workspaces').set('Authorization', `Bearer ${token}`).expect(401);
  });
});
