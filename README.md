# fyflow-plugin-anidb

A [fyflow-app](https://www.npmjs.com/package/fyflow-plugin-sdk) Plugin for [AniDB](https://anidb.net)'s UDP API, built on
[anidb-udp-client](https://www.npmjs.com/package/anidb-udp-client).

Its Plugin id is `fyflow-ext.anidb`: Flows record it, and the Host keeps its data under `plugin-data/fyflow-ext.anidb/`.

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
[fyflow/fyflow-plugins](https://github.com/fyflow/fyflow-plugins). On a tag `<id>@<version>`,
`.github/workflows/release.yml` calls its reusable workflow, which builds the Plugin (`fyflow.build` in package.json),
packs `dist/anidb` (`fyflow.pack`) and creates a GitHub Release with the tarball. The index shows `fyflow.name`,
`fyflow.icon`, `description` and `homepage`. CI's `pack` job checks every push packs the same way.

The repository has no `FYFLOW_PLUGINS_TOKEN` secret, so the workflow stops after the Release, and the PR adding the
version to the index is opened by hand, from the run's own artifacts, so it holds exactly what the workflow would have
sent.

1. Set the version in `package.json` and in `src/plugin.ts` (they must agree), and commit.
2. Check it packs and installs: `npm run build`, then `npx -p fyflow-plugin-sdk@^0.10.0 fyflow-plugin pack --out <dir>`
   in `dist/anidb`, and upload the tarball on a Host's Plugins page (`FYFLOW_PLUGINS_INSTALL=any`).
3. Tag and push: `git tag fyflow-ext.anidb@<version> && git push origin fyflow-ext.anidb@<version>`. Wait for the
   Release run to pass: `gh run watch <run> --repo tsukeero/fyflow-plugin-anidb`.
4. Open the PR, with `gh` signed in as an account that may fork `fyflow/fyflow-plugins` (in a temporary folder):

   ```sh
   TAG=fyflow-ext.anidb@<version>
   gh run download <run> --repo tsukeero/fyflow-plugin-anidb --pattern 'pack-*' --dir dist   # the tarball and its entry
   git clone --depth 1 --branch v1 https://github.com/fyflow/fyflow-plugins tools
   npm ci --ignore-scripts --prefix tools
   node tools/scripts/release/cli.ts merge --dist dist/pack-0 --repo tsukeero/fyflow-plugin-anidb --out release.json
   gh repo fork fyflow/fyflow-plugins --clone=false --default-branch-only
   git clone --depth 1 https://github.com/fyflow/fyflow-plugins index
   node tools/scripts/release/cli.ts apply --release release.json --index index   # writes plugins/<id>.json
   cd index && git checkout -b "release/$TAG" && git add plugins && git commit -m "$TAG"
   git push "https://github.com/<account>/fyflow-plugins.git" "HEAD:refs/heads/release/$TAG"
   gh pr create --repo fyflow/fyflow-plugins --base main --head "<account>:release/$TAG" --title "Add fyflow-ext.anidb ($TAG)"      --body "Release: https://github.com/tsukeero/fyflow-plugin-anidb/releases/tag/$(node -p 'encodeURIComponent(process.argv[1])' "$TAG")"
   ```

   For a later version, the title is just `$TAG`. Then watch its checks: `gh pr checks <url> --repo
   fyflow/fyflow-plugins --watch`. Its **admit** check must pass, and a maintainer merges it.

A published version never changes: to fix one, release the next.

## Install

In the app, install **AniDB** from **Browse** on the Plugins page: it is in the official Plugin repository, and the
Host installs its dependencies with npm. The Host provides the SDK.

To try a build of your own, run `npm run build` and pick `dist/anidb` with **Choose folder…**. The folder holds the
compiled JavaScript, a package.json, and the Plugin's dependencies (`anidb-udp-client`, `hash-wasm` and theirs) copied
as files into its own `node_modules`, since the app refuses a folder holding a link. Or pack it as in
[Release](#release) and upload the tarball.

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
| `AniDBHashFile` | `path`: the file's absolute path, under an Allowed root with `read` access | `path`, `size` (bytes), `ed2k` |
| `AniDBIdentifyFile` | `fid`, or else `ed2k` and `size` as AniDBHashFile gives them | `found`; when found, `file` (`fid`…; with `state`, also its `version`, `crc_ok`, `crc_err`, `censored`, `uncensored`), `anime` (`aid`…), `episode` (`eid`…), `group` (`gid`…) |
| `AniDBAnime` | `aid`, or else `title` (one of its titles on AniDB) | `found`; when found, `anime` |
| `AniDBEpisode` | `eid`, or else `aid` and `epno` (its number in the anime: `1`, or `S1` for a special, `C1` a credit, `T1` a trailer, `P1` a parody, `O1` another) | `found`; when found, `episode` |
| `AniDBMyListGet` | `fid`, or else `ed2k` and `size` | `found`; when found, `entry` |
| `AniDBMyListAdd` | `fid`, or else `ed2k` and `size` | `added`, and `lid` unless the file is not on AniDB (`found: false`); when the file was already in MyList, its `entry`, or `edited: true` with `edit` set |

AniDBHashFile reads only under the Profile's **Allowed roots**, the folders set on the Profiles page: the Profile's
own, which every Plugin that takes them shares, or ones for this Plugin alone, in its section. `read` access is
enough. With none, it refuses every path, and its error says where to add one.

Settings, set on the Node: `fields` on AniDBAnime and AniDBIdentifyFile chooses which fields AniDB is asked for; on
AniDBMyListAdd, the entry's values (`state`, `viewed`, `viewdate`, `source`, `storage`, `other`), and `edit` to update
an entry already in MyList instead of leaving it as it is.

Examples of input:

- `{ "eid": 1 }` or `{ "aid": 1, "epno": "S1" }` for AniDBEpisode
- `{ "ed2k": "fc21d9af828f92a8df64beac3357425d", "size": 9728000 }` for AniDBIdentifyFile or MyList, or `{ "fid": 1 }`
- `{ "path": "D:\\Anime\\Cowboy Bebop\\01.mkv" }` for AniDBHashFile
