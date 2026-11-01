# Request to fyflow-app: author, package and test a Plugin from the SDK alone

From fyflow-plugin-anidb. The goal: an agent (or a person) given only the published `fyflow-plugin-sdk` can build a
Plugin that installs and runs, and can prove that before release, without a checkout of fyflow-app. Today the SDK's
README explains the contract well, but the last two steps, packaging and testing in a Host, take reading
fyflow-app's source.

## 1. Packaging a Plugin folder

**Need.** The README says a Plugin's imports resolve from the Plugin directory's `node_modules`, "so `npm install`
your other dependencies there (or bundle them)". That covers a server Host. It does not cover installing from the
app, which is how most users will install: the installer (`packages/server/src/install.ts`) copies the folder whole,
runs no package manager, and refuses a folder holding a link. So a Plugin with dependencies must carry them in its
own `node_modules`, as files, and a pnpm repo's `node_modules` (all links) cannot be picked as it is. We learned this
by reading `install.ts` and fyflow-plugin-video-thumbnail's `plugin-folder` script; fyflow-plugin-anidb now builds
`dist/anidb/` that way (compiled JS, a trimmed package.json, its dependencies copied with links followed).

**Proposal.**

- The README states the layout of a folder to install from the app: `plugin.js` (or a package.json whose entry
  resolves), dependencies in the folder's own `node_modules` as files, no links, no SDK, the archive size limit.
- One of: a CLI in the SDK (`npx fyflow-plugin-sdk pack <dir>`) that makes that folder or a `.tgz` the installer
  takes, following links and leaving the SDK out; or a documented recipe that gives the same result (we have not
  checked whether `npm install --omit=dev --omit=peer --install-links` in a copy does).
- A check an author can run on the folder before release, as the installer would: loads it, lists Node Types and
  warnings, refuses what the installer or the Host would (links, TypeScript in a package, a `host` field with
  `dataDir: true`, a peer range the Host does not satisfy). `checkStaged` already does most of this inside the
  Host.

## 2. Testing a Plugin in a Host

**Need.** A Worker can be unit-tested by calling `run(envelope, context)` directly, but then the test builds the
envelope, context, Profile split (start-up vs per-Task fields), `host.dataDir` and `status()` context by hand, and
can drift from what a Host does. Proving the Plugin loads and runs in a real Host needs fyflow-app itself, which is
not on npm: fyflow-plugin-anidb's `pnpm smoke` starts `../fyflow-app/packages/server/src/cli.ts` from a sibling
checkout, on Node and on Deno, and drives it over the HTTP API.

**Proposal**, in order of value:

- **A test kit in the SDK** (`fyflow-plugin-sdk/testing`): load a Plugin from a folder or module as the Host does,
  apply a Profile (start-up fields to config, per-Task fields to `settings.profile`, secrets kept out of results),
  give it a temporary data directory, run a Task of a Node Type with an envelope and an abortable context, call
  `status()`, and Reload (setup/teardown, two Runtimes overlapping). Inline and threaded pools both, so a Plugin
  sharing state on `globalThis` sees what it will see in a Host.
- **A headless Host on npm** (for example `fyflow-host` with the CLI the smoke uses: `--port 0 --data-dir
  --plugin-dir --no-auto-resume`), so a smoke test installs it as a dev dependency instead of cloning fyflow-app,
  pinned to the Host versions the Plugin supports.
- **A documented smoke recipe** using either: start the Host, install the folder through the same path as "Choose
  folder…" (the install API), create a Profile, run a small Flow, read the Run and `/api/plugins/status`. The
  routes it needs are the contract a Plugin author tests against, so naming them stable (or versioning them) is
  part of this.

## What fyflow-plugin-anidb does meanwhile

`pnpm build` makes the Plugin folder `dist/anidb/`; `pnpm check:dist` loads it and checks it has no links and loads
its dependencies from its own `node_modules`; `pnpm smoke` copies it into a Plugin directory as the installer does
and runs a Flow through a Host from `../fyflow-app` on Node and Deno, against a fake AniDB.
