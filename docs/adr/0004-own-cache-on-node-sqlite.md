# Our own Cache on node:sqlite, in a Profile-set Cache directory

AniDB requires clients to cache, and may ban those asking for the same data again. anidb-udp-client's default cache writes `.cache` into the process's working directory, which fyflow-app forbids, and saves only on `beforeExit`, which a Host stopping by signal never fires. fyflow-app gives Plugins no data directory. So the Plugin passes the library its own Cache, on `node:sqlite` (on Node 26 and Deno, no native addon), writing as it goes, in a Cache directory set as a Profile start-up field. With none set the Cache is in memory and the Plugin warns. Entries last 7 days for anime, episode and group data, 30 days for file data and 1 day for Not found; MyList is never cached.

## Consequences

- fyflow-app is asked for a per-Plugin data directory; once a Host provides one, it becomes the default Cache directory.
