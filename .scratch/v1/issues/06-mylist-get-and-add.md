# 06: MyList: `AniDBMyListGet` and `AniDBMyListAdd`

**What to build:** A Flow author can check whether a file is in their MyList and add it, by `fid` or by `{ ed2k, size }`. Adding a file already there succeeds without changing it, unless the Flow asks to edit the entry, so re-running a Flow is harmless. See the glossary for MyList.

**Blocked by:** 01

**Status:** done

- [x] `AniDBMyListGet` with `{ fid }` or `{ ed2k, size }` returns `{ found: true, entry }`, or `{ found: false }`.
- [x] `AniDBMyListAdd` with `{ fid }` or `{ ed2k, size }`, and settings for state, watched and the other MyList fields the library takes, returns `{ added: true, lid }`.
- [x] A file already in MyList (`310`) returns `{ added: false, lid, entry }`; with `edit: true` the entry is updated instead, and the result says so.
- [x] Neither ever reads from or writes to the Cache.
- [x] Both pass other input fields through, as `AniDBIdentifyFile` does.

## Comments

- The library's MyList calls never touch its cache; the tests run each twice and count two packets.
- anidb-udp-client's `mylist_add_by_file` sends nothing and answers `undefined` unless given an options object, so the Worker always passes one.
- `edit: true` costs two requests when the entry exists: an add answered `310`, then an edit by its `lid` (`311`). Editing by fid alone would answer `411` for a file not yet in MyList. The edited result is `{ added: false, edited: true, lid }`, without the entry, which would show the values before the edit.
- Not found is a result (ADR-0003): `321` on get gives `{ found: false }`; `320` on add, and `410`/`411` on an edit whose entry left MyList in between, give `{ added: false, found: false }`. MyList Not found is never remembered.
- Naming a file by `{ fid }` or `{ ed2k, size }` is shared with `AniDBIdentifyFile` (fid wins when both are given), as are the MyList settings, kept apart from the Worker so the Plugin's entry offers them as `settingsSchema` without loading it.
