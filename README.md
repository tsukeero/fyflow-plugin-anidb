# fyflow-plugin-anidb

A [fyflow-app](https://www.npmjs.com/package/fyflow-plugin-sdk) Plugin for [AniDB](https://anidb.net)'s UDP API, built on
[anidb-udp-client](https://www.npmjs.com/package/anidb-udp-client).

Its Plugin id is `fyflow-ext.anidb`: Flows record it, and the Host keeps its data under `plugin-data/fyflow-ext.anidb/`.
(Builds before the first release used `anidb`: a Flow saved with one names a Plugin that no longer exists.)

A Flow typically hashes a file, identifies it, then adds it to MyList: AniDBHashFile → AniDBIdentifyFile →
AniDBMyListAdd, each Node's result being the next one's input.

## Develop

Needs Node 26 (`.node-version`) and npm.

```sh
npm install
npm run check   # typecheck, lint, test
npm run build   # makes the Plugin folder dist/anidb/
npm run smoke   # runs that folder in a Host from ../fyflow-app, against a fake AniDB
```

`npm run check` also runs the tests under Deno (`npm run test:deno`), so it needs Deno 2 on the PATH. Tests talk only
to a fake AniDB on localhost, never to the real one.

### The lockfile

A Host installs the Plugin's dependencies with npm, from the `npm-shrinkwrap.json` that `fyflow-plugin pack` writes
from the Plugin folder's `package-lock.json`. `npm run build` derives that one from the repository's: the same
versions, with the dependencies, the SDK as a peer (npm requires it in the lockfile; a Host's `npm ci --omit=peer`
leaves it out), and no development tools. So the versions tested are the versions shipped. The build refuses a
`package-lock.json` out of step with `package.json` or with `node_modules`: run `npm install`.

## Release

The Plugin is released into the official fyflow Plugin repository,
[fyflow/fyflow-plugins](https://github.com/fyflow/fyflow-plugins), by `.github/workflows/release.yml`, which calls its
reusable workflow on a tag `<id>@<version>`. That workflow builds the Plugin (`fyflow.build` in package.json), packs
`dist/anidb` (`fyflow.pack`), creates a GitHub Release with the tarball, and opens the PR adding the version to the
index, using the `FYFLOW_PLUGINS_TOKEN` secret (a classic token with `public_repo`). The index shows `fyflow.name`,
`fyflow.icon`, `description` and `homepage`. CI's `pack` job checks every push packs the same way.

1. Set the version in `package.json` and in `src/plugin.ts` (they must agree), and commit.
2. Check it packs and installs: `npm run build`, then `npx -p fyflow-plugin-sdk@^0.10.0 fyflow-plugin pack --out <dir>`
   in `dist/anidb`, and upload the tarball on a Host's Plugins page (`FYFLOW_PLUGINS_INSTALL=any`).
3. `git tag fyflow-ext.anidb@<version> && git push origin fyflow-ext.anidb@<version>`, and watch the PR the run's
   summary links: `gh pr checks <url> --repo fyflow/fyflow-plugins --watch`.

A published version never changes: to fix one, release the next.

## Install

Run `npm run build` and pick `dist/anidb` with **Choose folder…** on the app's Plugins page. The folder holds what a Host
loads and nothing else: the compiled JavaScript, a package.json, and the Plugin's dependencies (`anidb-udp-client`,
`hash-wasm` and theirs) copied as files into its own `node_modules`, because the app's installer copies a folder
whole, runs no package manager and refuses a link. The Host provides the SDK.

On a server Host you can instead copy the folder into the Plugin directory, with `fyflow-plugin-sdk` installed there
(`npm install fyflow-plugin-sdk` in the Plugin directory), then Reload.

## Node Types

Each Node Type's input is the Task input: the Run's input for the first Node of a Flow, the Node before it's result
after that. Every Node Type also declares its input and its result as schemas, with an example of each form and each
outcome, which the editor and Agents see: the editor suggests a result's paths (`found`, `added`, `anime.aid`) for an
Edge's condition. Where a Node Type takes one of two forms, the first one present wins. The AniDB Node Types return
their input with their answer added, so later Nodes still know which file or anime it was.

| Node Type | Input | Result |
| --- | --- | --- |
| `AniDBHashFile` | `path`: the file's absolute path, under one of the Profile's `roots` | `path`, `size` (bytes), `ed2k` |
| `AniDBIdentifyFile` | `fid`, or else `ed2k` and `size` as AniDBHashFile gives them | `found`; when found, `file` (`fid`…; with `state`, also its `version`, `crc_ok`, `crc_err`, `censored`, `uncensored`), `anime` (`aid`…), `episode` (`eid`…), `group` (`gid`…) |
| `AniDBAnime` | `aid`, or else `title` (one of its titles on AniDB) | `found`; when found, `anime` |
| `AniDBEpisode` | `eid`, or else `aid` and `epno` (its number in the anime: `1`, or `S1` for a special, `C1` a credit, `T1` a trailer, `P1` a parody, `O1` another) | `found`; when found, `episode` |
| `AniDBMyListGet` | `fid`, or else `ed2k` and `size` | `found`; when found, `entry` |
| `AniDBMyListAdd` | `fid`, or else `ed2k` and `size` | `added`, and `lid` unless the file is not on AniDB (`found: false`); when the file was already in MyList, its `entry`, or `edited: true` with `edit` set |

Settings, set on the Node: `fields` on AniDBAnime and AniDBIdentifyFile chooses which fields AniDB is asked for; on
AniDBMyListAdd, the entry's values (`state`, `viewed`, `viewdate`, `source`, `storage`, `other`), and `edit` to update
an entry already in MyList instead of leaving it as it is.

Examples of input:

- `{ "eid": 1 }` or `{ "aid": 1, "epno": "S1" }` for AniDBEpisode
- `{ "ed2k": "fc21d9af828f92a8df64beac3357425d", "size": 9728000 }` for AniDBIdentifyFile or MyList, or `{ "fid": 1 }`
- `{ "path": "D:\\Anime\\Cowboy Bebop\\01.mkv" }` for AniDBHashFile
