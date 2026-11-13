// BLUECORE: the dancer's release version, for the Blue Core dashboard.
import { execFileSync } from 'child_process';

/**
 * The release this dancer is running, shown on the Blue Core dashboard
 * ("DCTap Version: v0.1.03"):
 *   - the published image: DCTAP_DANCER_VERSION, set at build time from the
 *     GitHub Release tag (see Dockerfile and bluecore-publish.yml);
 *   - a local checkout (Blue Core's ./scripts/dev/run): the newest release tag
 *     in its Git history;
 *   - otherwise undefined, and the dashboard shows no version.
 */
export function dancerVersion(
  env: NodeJS.ProcessEnv = process.env,
  latestTag: () => string | undefined = latestGitTag
): string | undefined {
  const fromImage = env.DCTAP_DANCER_VERSION?.trim();
  if (fromImage && fromImage !== 'unversioned') {
    return fromImage;
  }
  return latestTag() || undefined;
}

/** The newest tag reachable from the checkout's HEAD, if there's a Git checkout */
export function latestGitTag(cwd: string = process.cwd()): string | undefined {
  try {
    return execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000
    }).trim() || undefined;
  } catch {
    return undefined; // no git, no checkout, or no tags
  }
}

/** Add `version` to a health payload when it's known */
export function withVersion<T extends object>(body: T, version: string | undefined): T & { version?: string } {
  return version ? { ...body, version } : body;
}
