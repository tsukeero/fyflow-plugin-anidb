# One HTTP API client per Host, with a Circuit breaker of its own

AniDB's HTTP API gives an anime's full data (all titles, tags, creators, characters, episodes, related and similar
anime), which UDP's ANIME does not. Like UDP, it bans a client that asks too fast (more than one request every 2
seconds) or asks for the same data twice in a day. anidb-udp-client's `AnidbHTTPClient` paces only its own requests and
remembers a ban only in memory. So, as with the Session (ADR-0001), no Worker owns a client: the Host process holds one,
kept on `globalThis`, and `AniDBHTTPAnime` runs inline to share it. The client keeps its answers in the Plugin's Cache
(ADR-0004). The Plugin sends one request at a time, ahead of the library's queue, so a Task Cancelled while waiting
sends nothing and a block stops the requests still waiting.

The HTTP API is banned apart from UDP, so it has a Circuit breaker of its own (ADR-0003), kept in
`anidb-http-block.json`. A ban on one API does not stop the other.

## Consequences

- It needs no AniDB account, so `AniDBHTTPAnime` takes no Profile field and is not a Session Worker.
- The client name and version are built in (`HTTP_CLIENT`, `HTTP_CLIENT_VERSION` in `src/http.ts`): anidb-udp-client's
  HTTP registration, `anidbhttclientjs`, as the UDP side uses its `anidbudpclientjs`. AniDB paces and bans by client,
  so the Plugin shares both with every other app using that name.
- After a ban the library refuses every request for the rest of the process, so the Plugin drops the client when the
  breaker trips and builds a new one once the block lifts.
- An answer stays in the Cache 7 days (the lifetime of any data without its own), and Not found 1 day, as for UDP.
- The HTTP API is plain HTTP, so it is never sent anything secret: MyList requests, which need the password, stay on UDP.
- It adds `fast-xml-parser`, the client's optional peer, as a dependency of the Plugin.
- The Plugin's status reports only the Session, not this client or its block.
- `AniDBHTTPAnime` takes an aid only. A title would need AniDB's titles dump, which `AnidbTitles` loads but this Plugin
  does not fetch.
