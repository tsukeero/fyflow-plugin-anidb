# fyflow-plugin-anidb

A fyflow-app **Plugin** for AniDB's UDP API, built on [anidb-udp-client](https://www.npmjs.com/package/anidb-udp-client) and written against the published [fyflow-plugin-sdk](https://www.npmjs.com/package/fyflow-plugin-sdk). It will ship to npm as a package named `fyflow-plugin-anidb`, which a Host loads from its Plugin directory's `node_modules`.

## Where to look

- **The Plugin contract**: `node_modules/fyflow-plugin-sdk/README.md` (Workers, their lifecycle, Profiles and secrets, Resource Groups) and its `UPGRADING.md`.
- **The Host**: `../fyflow-app`, the app's repo. Its `CLAUDE.md`, `GLOSSARY.md` and `docs/adr/` explain how Plugins are loaded and run; `examples/plugins/signer` is a Plugin to compare against. Read it, never edit it from here.
- **fyflow behaviour**: `node_modules/fyflow-orchestration/AGENTS.md`.
- **The AniDB client**: `node_modules/anidb-udp-client/`.

## Rules

- **Ship JavaScript.** A Host does not strip TypeScript under `node_modules`, so `pnpm build` compiles `src/` to `dist/`, and `package.json` `exports` point there.
- **The SDK is a peer, never bundled.** Import it for types (`import type`) wherever possible: the Host provides it at run time.
- **Runtime-neutral where the Host is.** A Host runs on Node 26 and on Deno; anything a Worker uses has to work on both, or the gap is stated.
- **Never commit AniDB credentials.** They belong in Profile secrets (`writeOnly`), and test credentials in `.env`, which git ignores.

## Code conventions

Same as fyflow-app: TypeScript strict, ESM only, relative imports with `.ts` extensions (rewritten to `.js` on build), erasable syntax only (no `enum`, `namespace`, or constructor parameter properties). Biome formats and lints. Node 26 is pinned in `.node-version`. Name domain concepts with fyflow-app's `GLOSSARY.md` terms (Node Type, Worker, Profile, Task…) and this repo's own `GLOSSARY.md` once it exists.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
