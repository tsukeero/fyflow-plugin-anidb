# 12: Register the AniDB client

**What to build:** AniDB authenticates only registered client name and version pairs. The maintainer registers this Plugin as a client at anidb.net/software/add, at version 1 because anidb-udp-client hard-codes `clientver=1`, and the Session sends that name instead of the library's default.

**Blocked by:** None (can start immediately)

**Status:** wontfix

- [ ] A client is registered on AniDB at version 1, under the maintainer's account.
- [ ] The Session passes the registered name to anidb-udp-client; a test against the fake AniDB checks the name sent in `AUTH`.

## Comments

- 2026-10-31, maintainer: not doing this. The Plugin uses anidb-udp-client's default client name for the foreseeable future, so the Session passes no client name of its own. Reopen if AniDB refuses that name or the Plugin needs its own identity.
