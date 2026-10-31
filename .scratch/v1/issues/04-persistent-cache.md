# 04: Persistent Cache

**What to build:** AniDB answers are kept in a Cache in the Cache directory set on the Profile, so the same data is never asked for twice within its lifetime, even across a Host restart, as AniDB requires. Without a Cache directory the Cache is in memory and the user is told. See ADR-0004 and the glossary for Cache and Cache directory.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The Plugin declares a `cacheDir` Profile field (start-up, absolute path, optional), taken by every Session Worker.
- [ ] The Cache implements anidb-udp-client's cache interface on `node:sqlite` in the Cache directory, writing as it goes (nothing depends on `beforeExit`), and works on Node and Deno.
- [ ] Lifetimes: anime, episode and group answers 7 days; file answers 30 days; Not found 1 day; MyList never cached.
- [ ] An answer asked for again within its lifetime, including after the Session and the Cache are recreated over the same directory, sends no packet to the fake AniDB; after its lifetime it is asked for again.
- [ ] With no `cacheDir` the Cache is in memory, and Session Workers' progress messages and the Host's log say answers will not persist.
- [ ] A relative `cacheDir`, or one that cannot be created or written, fails the Task saying so.
