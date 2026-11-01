# fyflow-plugin-anidb

A [fyflow-app](https://www.npmjs.com/package/fyflow-plugin-sdk) Plugin for [AniDB](https://anidb.net)'s UDP API, built on
[anidb-udp-client](https://www.npmjs.com/package/anidb-udp-client).

Work in progress: what the Plugin contributes is still being designed.

## Develop

Needs Node 26 (`.node-version`) and pnpm.

```sh
pnpm install
pnpm check   # typecheck, lint, test
pnpm build   # makes the Plugin folder dist/anidb/
pnpm smoke   # runs that folder in a Host from ../fyflow-app, against a fake AniDB
```

`pnpm check` also runs the tests under Deno (`pnpm test:deno`), so it needs Deno 2 on the PATH. Tests talk only to
a fake AniDB on localhost, never to the real one.

## Install

Run `pnpm build` and pick `dist/anidb` with **Choose folder…** on the app's Plugins page. The folder holds what a Host
loads and nothing else: the compiled JavaScript, a package.json, and the Plugin's dependencies (`anidb-udp-client`,
`hash-wasm` and theirs) copied as files into its own `node_modules`, because the app's installer copies a folder
whole, runs no package manager and refuses a link. The Host provides the SDK.

On a server Host you can instead copy the folder into the Plugin directory, with `fyflow-plugin-sdk` installed there
(`npm install fyflow-plugin-sdk` in the Plugin directory), then Reload.
