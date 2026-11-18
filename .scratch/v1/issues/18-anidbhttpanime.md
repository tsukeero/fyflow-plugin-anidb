# 18: AniDBHTTPAnime, an anime from AniDB's HTTP API

**What to build:** a Node Type that gets an anime by its aid from AniDB's HTTP API, through anidb-udp-client 2.1.0's
`AnidbHTTPClient`. It returns what UDP's ANIME does not: all titles, tags, creators, characters, episodes, and
related and similar anime. It needs no AniDB account.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `AniDBHTTPAnime` takes `{ aid }` and returns the input with `found`, and when found `anime` in the library's
      `HTTPAnimeResult` shape. Its input and output schemas have examples of each outcome.
- [x] One HTTP API client per Host process, on `globalThis`, shared by inline Workers (ADR-0006). Requests go one at a
      time; a Task Cancelled while waiting sends nothing.
- [x] Answers are kept in the Plugin's Cache (7 days), and Not found for a day (ADR-0003).
- [x] A ban, or 3 timeouts in a row, trips a Circuit breaker of its own, kept in `anidb-http-block.json`.
- [x] anidb-udp-client is upgraded to ^2.1.0, and `fast-xml-parser` (its optional peer) is added as a dependency, so
      the build copies it into the Plugin folder.
- [x] It sends anidb-udp-client's HTTP client registration, `anidbhttclientjs` version 1.
- [x] Tried against the real API once (`npm run smoke` covers only UDP): aid 1 came back found, and its answer meets
      the output schema.

## Comments

- The maintainer chose a built-in client registration over Profile fields, so nobody sets anything. It is the
  library's `anidbhttclientjs`, as the UDP side uses `anidbudpclientjs`.
- Not done: a title as input (it needs AniDB's titles dump), the Plugin's status reporting this client, and a
  version bump (left to the release).
- Comes out of the MyList export investigation (`.scratch/mylist-export/findings.md`): `AniDBExportAnime`, when it is
  built, is to follow this Node Type's `anime` shape where the export allows.
- The first live try sent `anidbhttpclientjs`, a typo for the registered name, and AniDB answered `client version
  missing or invalid` (code 670, UNKNOWN_API_ERROR). That answer trips no Circuit breaker, so a Flow would keep sending
  refused requests every 2 seconds. Worth a code of its own in anidb-udp-client (as it maps `Banned`), which the
  Circuit breaker could then block on.
