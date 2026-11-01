# Our own Cache on node:sqlite, in the Plugin's data directory

AniDB requires clients to cache, and may ban those asking for the same data again. anidb-udp-client's default cache writes `.cache` into the process's working directory, which fyflow-app forbids, and saves only on `beforeExit`, which a Host stopping by signal never fires. So the Plugin passes the library its own Cache, on `node:sqlite` (on Node 26 and Deno, no native addon), writing as it goes, in the data directory the Host gives the Plugin (`dataDir: true`, SDK 0.6), which every Profile shares and no user sets. A Worker given none, as in tests, keeps the Cache in memory and warns. Entries last 7 days for anime, episode and group data, 30 days for file data and 1 day for Not found; MyList is never cached.

## Consequences

- The Plugin needs a Host on fyflow-plugin-sdk 0.6 or later (peer range `^0.6.0`).
- Until SDK 0.6 the Cache was in a Cache directory set on each Profile (`cacheDir`); it was dropped before the first release, so no existing cache is carried over.
- Another Host process sharing the data directory may open the database too: it uses WAL and a busy timeout.
