# 05: `AniDBIdentifyFile`

**What to build:** A Flow author can identify a hashed file: `AniDBIdentifyFile` takes `{ ed2k, size }` and returns the file, anime, episode and group data, keeping every other field of its input (such as `path`) so later Nodes still know which file it was. A file AniDB does not know gives `found: false`. See the glossary for Identification and Not found, and ADR-0003.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `AniDBIdentifyFile` (Session Worker) with `{ ed2k, size, ...rest }` returns `{ ...rest, found: true, file, anime, episode, group }`.
- [ ] A `fields` setting chooses what comes back, validated against the library's field names; the default covers romaji and English titles, episode number and title, group short name, resolution, codecs, CRC and version.
- [ ] A file AniDB does not know returns `{ ...rest, found: false }`, not a failed Task.
- [ ] Missing or malformed `ed2k` or `size` fails the Task saying which.
- [ ] `AniDBHashFile`'s result fed straight in identifies the file (tested against the fake AniDB with a result of the same shape).
