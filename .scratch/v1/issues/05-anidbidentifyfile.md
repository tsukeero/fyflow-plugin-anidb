# 05: `AniDBIdentifyFile`

**What to build:** A Flow author can identify a hashed file: `AniDBIdentifyFile` takes `{ ed2k, size }` and returns the file, anime, episode and group data, keeping every other field of its input (such as `path`) so later Nodes still know which file it was. A file AniDB does not know gives `found: false`. See the glossary for Identification and Not found, and ADR-0003.

**Blocked by:** 01

**Status:** done

- [x] `AniDBIdentifyFile` (Session Worker) with `{ ed2k, size, ...rest }` returns `{ ...rest, found: true, file, anime, episode, group }`.
- [x] A `fields` setting chooses what comes back, validated against the library's field names; the default covers romaji and English titles, episode number and title, group short name, resolution, codecs, CRC and version.
- [x] A file AniDB does not know returns `{ ...rest, found: false }`, not a failed Task.
- [x] Missing or malformed `ed2k` or `size` fails the Task saying which.
- [x] `AniDBHashFile`'s result fed straight in identifies the file (tested against the fake AniDB with a result of the same shape).

## Comments

- Not found is remembered for a day under `NOTFOUND:FILE:s<size>|h<ed2k>`, read and written inside the queued request, so a file already known to be missing still waits its turn and may cost a login (AniDB answers from the Cache cost one too, see ticket 04). The helper also covers anime, episode and group codes, for ticket 07.
- The `ed2k` is lower-cased before use: the library keys its Cache by the hash as given.
- The result holds only the fields asked for: the library's Cache merges answers, so an answer it holds may carry more from a wider request.
- `mylist_*` fields are not offered: they come back inside the FILE answer, which is cached for 30 days, and MyList answers must never be cached (ticket 06 gets them through MYLIST).
- `version` comes from `state` (bits 4/8/16/32 → v2–v5, else v1) and is only present when `state` is asked for, as it is by default. `file.fid` is a number, for MyList add.
- The field table lives in its own module so the Plugin's entry offers it in `settingsSchema` without loading the Worker. A Session request now gets a Connection (the client and its Cache), so Workers can mark Not found.
- The fed-straight-in criterion is tested with an input of `AniDBHashFile`'s result shape, not by running it.
