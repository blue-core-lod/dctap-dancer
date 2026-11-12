# Blue Core changes

Blue Core's copy of [LC's DCTap Dancer](https://github.com/lcnetdev/dctap-dancer).
It's the template editor for Blue Core's Marva, served at `/marva/dancer/`.

We keep our code separate from LC's so we can pull in their updates easily.
Search for `BLUECORE` to find everything we changed.

## Branches

- **`main`**: an exact copy of LC's code. Never put Blue Core work here.
- **`bluecore-dev-mvp`**: our branch. All Blue Core work goes here.

## Blue Core code

All of it lives in two folders:

- `backend/src/bluecore/`: login check, the starting "Blue Core" workspace, the "LC Latest" workspace, and tests (`test/`)
- `frontend/src/bluecore/`: Keycloak login and the top bar ("LC Latest" status, "Signed in as…")

## LC files we touched

Just a few lines each, marked `BLUECORE`:

- `backend/src/index.ts`, `frontend/src/main.ts`, `frontend/src/services/api.ts`: one-line hooks that switch on our code
- `backend/package.json`, `frontend/package.json`, `package-lock.json`: two added libraries (`jose`, `keycloak-js`)
- `.github/workflows/test.yml`: also runs the tests on `bluecore-dev-mvp`

Adding something new? Put it in a `bluecore/` folder, and only touch LC's files if you have to.

## Settings
Set these when the container starts, not when building the image

| Setting | What it does |
|---|---|
| `KEYCLOAK_URL` | Turns on login (leave unset for no login) |
| `KEYCLOAK_INTERNAL_URL` | Keycloak address from inside Docker (defaults to `KEYCLOAK_URL`) |
| `KEYCLOAK_REALM` / `KEYCLOAK_CLIENT_ID` | Defaults: `bluecore` / `bluecore_api` |
| `SEED_WORKSPACE_NAME` | Workspace to create on first start, e.g. `Blue Core` |
| `SEED_PROFILES_SOURCE` / `SEED_STARTING_POINTS_SOURCE` | Where to get its profiles (URL or file) |

The starting workspace is only created if it doesn't exist yet. Edits are never overwritten.

## LC Latest

A read-only workspace that always matches LC's newest Marva profiles. It's
always on, and its settings are in `backend/src/bluecore/sync.ts`.

- Checked at startup and every hour; re-imported only when LC's files changed
- Its "Modified" date on the home page is LC's last commit to the files, not the import time
- The top bar shows when it last matched LC, or a yellow warning if LC's GitHub couldn't be reached (the current copy is kept, and the next check tries again)
- Locked, so nobody's edits get wiped by the next update. Duplicate it to edit.

## Tests

`npm test --workspace=backend` runs LC's tests and Blue Core's. They also run on GitHub for every push and pull request to `bluecore-dev-mvp`.

## Publishing the Docker image

Never automatic. From `bluecore-dev-mvp`, either:

- **Actions → Build and Release Docker Image → Run workflow** (updates `:latest`), or
- **Publish a GitHub Release** (updates `:latest` and adds a version tag)

## Getting LC's updates

1. On GitHub, click **Sync fork** on `main`.
2. Merge `main` into `bluecore-dev-mvp` with a pull request:

   ```bash
   git fetch origin
   git checkout -b sync-upstream origin/bluecore-dev-mvp
   git merge origin/main
   npm install && npm test --workspace=backend
   git push -u origin sync-upstream
   ```

If there's a conflict, it will be in one of the `BLUECORE` lines listed above.
