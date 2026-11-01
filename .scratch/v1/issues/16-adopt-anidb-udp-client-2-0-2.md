# 16: Adopt anidb-udp-client 2.0.2 and decode a file's state with it

**What to build:** AniDBIdentifyFile decodes a file's `state` with the library's `decodeFileState` instead of its own
bit table, and returns everything it decodes: besides `version`, whether the CRC matches (`crc_ok`, `crc_err`) and
whether AniDB flags the file censored or uncensored. The Plugin folder ships anidb-udp-client 2.0.2.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The Plugin depends on anidb-udp-client `^2.0.2`, and `dist/anidb` carries it.
- [x] With `state` among its `fields`, AniDBIdentifyFile's `file` holds `version`, `crc_ok`, `crc_err`, `censored` and
      `uncensored`, decoded by the library.
- [x] The output schema, its example and the README describe them.

## Comments

- 2.0.2 also gives `FAILED_TO_INITIALIZE` its own code (673; it shared 672 with `NOT_CONNECTED`). Nothing here refers
  to either, so no change follows from it.
- `decodeFileState` throws on a state that is not a whole number of 0 or more, where the old table read it as version
  1; AniDB sends a number, so a Task would fail only on an answer that is broken anyway.
- Version bumped to 0.0.3: the result gained fields.
