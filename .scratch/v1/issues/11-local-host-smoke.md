# 11: Local Host smoke (`pnpm smoke`)

**What to build:** Before a release, the maintainer can prove the built package works in a real Host: `pnpm smoke` installs it into the Plugin directory of a Host built from `../fyflow-app`, as npm would, and runs a Flow that hashes a file, identifies it and adds it to MyList against the fake AniDB, on Node and on Deno.

**Blocked by:** 02, 05, 06

**Status:** done

- [x] `pnpm smoke` builds and packs this package, lays it out with the SDK under a temporary Plugin directory's `node_modules`, and starts a Host from `../fyflow-app` on it, with a Profile pointing at the fake AniDB and granting a temporary Root.
- [x] A Flow hash → identify → MyList add runs to the end on Node 26 and on Deno, and the fake AniDB received the expected packets.
- [x] The Host's Plugin list (`GET /api/plugins`) shows the Plugin with its Node Types and no warnings.
- [x] It fails clearly when `../fyflow-app` is missing or not built; it is not part of `pnpm check` or CI.
- [x] How the Session is pointed at the fake AniDB (an address override for tests) is not a user-visible Profile field.

## Comments

- `pnpm smoke` (scripts/smoke.ts) builds and packs this package, npm-installs it with `fyflow-plugin-sdk` into a temporary Plugin directory, and starts `packages/server/src/cli.ts` from ../fyflow-app on Node 26, then on Deno (`deno run -A`), each with a fake AniDB, a Profile (account, Cache directory, a temporary Root) and a Flow hash → identify → MyList add. It checks `/api/plugins` (loaded, the Node Types, no warnings), that the password is never shown back, that the Run completes with `added: true` and the file's path kept, and that the fake received exactly `AUTH, FILE, MYLISTADD`. Passed on both runtimes.
- fyflow-app's server runs from its TypeScript source, so "built" means installed: the smoke fails clearly when ../fyflow-app or its `node_modules` is missing. The web UI build is not needed headless. Installing the SDK needs the npm registry.
- The fake is reached without any override in the Plugin: the smoke preloads test/smoke-preload.ts into the Host (`node --import`, `deno run --preload`), which redirects the Host's sends to api.anidb.net:9000 to the fake named by `FYFLOW_PLUGIN_ANIDB_FAKE_UDP`, and refuses to let the Host start without it, so a smoke never reaches the real AniDB. Review found that a first version, an environment override inside the Session, shipped in `dist`: any Host started with the variable would have sent the account's login to a local port. Nothing of it is in `dist` now (checked).
- Each Host is killed and awaited (a hard kill on Windows, as fyflow-app's own smoke accepts); Deno is spawned without a shell so the kill reaches it.
