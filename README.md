# fyflow-plugin-anidb

A [fyflow-app](https://www.npmjs.com/package/fyflow-plugin-sdk) Plugin for [AniDB](https://anidb.net)'s UDP API, built on
[anidb-udp-client](https://www.npmjs.com/package/anidb-udp-client).

A Flow typically hashes a file, identifies it, then adds it to MyList: AniDBHashFile → AniDBIdentifyFile →
AniDBMyListAdd, each Node's result being the next one's input.

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

## Node Types

Each Node Type's input is the Task input: the Run's input for the first Node of a Flow, the Node before it's result
after that. Every Node Type also declares it as an input schema, with examples, which the editor and Agents see. Where
a Node Type takes one of two forms, the first one present wins. The AniDB Node Types return their input with their
answer added, so later Nodes still know which file or anime it was.

| Node Type | Input | Result |
| --- | --- | --- |
| `AniDBHashFile` | `path`: the file's absolute path, under one of the Profile's `roots` | `path`, `size` (bytes), `ed2k` |
| `AniDBIdentifyFile` | `ed2k` and `size`, as AniDBHashFile gives them | `found`; when found, `file` (`fid`…), `anime` (`aid`…), `episode` (`eid`…), `group` (`gid`…) |
| `AniDBAnime` | `aid`, or else `title` (one of its titles on AniDB) | `found`; when found, `anime` |
| `AniDBEpisode` | `eid`, or else `aid` and `epno` (its number in the anime: `1`, or `S1` for a special, `C1` a credit, `T1` a trailer, `P1` a parody, `O1` another) | `found`; when found, `episode` |
| `AniDBMyListGet` | `fid`, or else `ed2k` and `size` | `found`; when found, `entry` |
| `AniDBMyListAdd` | `fid`, or else `ed2k` and `size` | `added`, and `lid` unless the file is not on AniDB (`found: false`); when the file was already in MyList, its `entry`, or `edited: true` with `edit` set |

Settings, set on the Node: `fields` on AniDBAnime and AniDBIdentifyFile chooses which fields AniDB is asked for; on
AniDBMyListAdd, the entry's values (`state`, `viewed`, `viewdate`, `source`, `storage`, `other`), and `edit` to update
an entry already in MyList instead of leaving it as it is.

Examples of input:

- `{ "eid": 1 }` or `{ "aid": 1, "epno": "S1" }` for AniDBEpisode
- `{ "ed2k": "fc21d9af828f92a8df64beac3357425d", "size": 9728000 }` for AniDBIdentifyFile or MyList
- `{ "path": "D:\\Anime\\Cowboy Bebop\\01.mkv" }` for AniDBHashFile
