# 06: MyList: `AniDBMyListGet` and `AniDBMyListAdd`

**What to build:** A Flow author can check whether a file is in their MyList and add it, by `fid` or by `{ ed2k, size }`. Adding a file already there succeeds without changing it, unless the Flow asks to edit the entry, so re-running a Flow is harmless. See the glossary for MyList.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `AniDBMyListGet` with `{ fid }` or `{ ed2k, size }` returns `{ found: true, entry }`, or `{ found: false }`.
- [ ] `AniDBMyListAdd` with `{ fid }` or `{ ed2k, size }`, and settings for state, watched and the other MyList fields the library takes, returns `{ added: true, lid }`.
- [ ] A file already in MyList (`310`) returns `{ added: false, lid, entry }`; with `edit: true` the entry is updated instead, and the result says so.
- [ ] Neither ever reads from or writes to the Cache.
- [ ] Both pass other input fields through, as `AniDBIdentifyFile` does.
