// BLUECORE: tests for the release version on /api/health (../version.ts)
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { dancerVersion, latestGitTag, withVersion } from '../version.js';

describe('dancerVersion', () => {
  it('uses the version baked into the image', () => {
    expect(dancerVersion({ DCTAP_DANCER_VERSION: 'v0.1.03' }, () => 'v0.0.1')).toBe('v0.1.03');
  });

  it('falls back to the checkout\'s newest tag', () => {
    expect(dancerVersion({}, () => 'v0.1.02')).toBe('v0.1.02');
  });

  it('ignores the image default "unversioned" when a tag is known', () => {
    expect(dancerVersion({ DCTAP_DANCER_VERSION: 'unversioned' }, () => 'v0.1.02')).toBe('v0.1.02');
  });

  it('is undefined when neither is known', () => {
    expect(dancerVersion({ DCTAP_DANCER_VERSION: ' ' }, () => undefined)).toBeUndefined();
  });
});

describe('latestGitTag', () => {
  it('is undefined outside a Git checkout', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dancer-version-'));
    try {
      expect(latestGitTag(dir)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('withVersion', () => {
  it('adds the version when known', () => {
    expect(withVersion({ status: 'ok' }, 'v0.1.03')).toEqual({ status: 'ok', version: 'v0.1.03' });
  });

  it('leaves the payload alone when unknown', () => {
    expect(withVersion({ status: 'ok' }, undefined)).toEqual({ status: 'ok' });
  });
});
