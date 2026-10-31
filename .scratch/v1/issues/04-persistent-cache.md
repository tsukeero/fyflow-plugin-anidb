# 04: Persistent Cache

**What to build:** AniDB answers are kept in a Cache in the Cache directory set on the Profile, so the same data is never asked for twice within its lifetime, even across a Host restart, as AniDB requires. Without a Cache directory the Cache is in memory and the user is told. See ADR-0004 and the glossary for Cache and Cache directory.

**Blocked by:** 01

**Status:** done

- [x] The Plugin declares a `cacheDir` Profile field (start-up, absolute path, optional), taken by every Session Worker.
- [x] The Cache implements anidb-udp-client's cache interface on `node:sqlite` in the Cache directory, writing as it goes (nothing depends on `beforeExit`), and works on Node and Deno.
- [x] Lifetimes: anime, episode and group answers 7 days; file answers 30 days; Not found 1 day; MyList never cached.
- [x] An answer asked for again within its lifetime, including after the Session and the Cache are recreated over the same directory, sends no packet to the fake AniDB; after its lifetime it is asked for again.
- [x] With no `cacheDir` the Cache is in memory, and Session Workers' progress messages and the Host's log say answers will not persist.
- [x] A relative `cacheDir`, or one that cannot be created or written, fails the Task saying so.

## Comments

- An answer from the Cache still costs one login (`AUTH`), but no request for the data: anidb-udp-client reads its cache only through a logged-in client. Tests assert the full packet list, so the cost stays visible.
- The Not found lifetime (1 day) is in the Cache under `NOTFOUND:<key>`; the Session Workers that report Not found (tickets 05 and 07) write those entries.
- A Cache directory that exists but cannot be written is not tested: Windows does not enforce read-only directories. Opening the database or writing its table fails in that case, and the Task fails with the `cacheDir` message.
- From review: each login owns its Cache, closed only once its client has disconnected (never under a request still running); a closed Cache answers and keeps nothing; the database uses WAL with a busy timeout, since another Host process may share the directory; expired answers are purged when the Cache opens; widening an answer with more fields does not extend its lifetime; the Host's log is told once per process that answers will not persist.
