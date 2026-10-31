# 12: Register the AniDB client

**What to build:** AniDB authenticates only registered client name and version pairs. The maintainer registers this Plugin as a client at anidb.net/software/add, at version 1 because anidb-udp-client hard-codes `clientver=1`, and the Session sends that name instead of the library's default.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] A client is registered on AniDB at version 1, under the maintainer's account.
- [ ] The Session passes the registered name to anidb-udp-client; a test against the fake AniDB checks the name sent in `AUTH`.
