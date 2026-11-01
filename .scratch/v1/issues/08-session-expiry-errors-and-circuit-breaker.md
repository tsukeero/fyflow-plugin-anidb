# 08: Session expiry, errors and the Circuit breaker

**What to build:** A long-running Host keeps working when AniDB expires its session, and at the first sign of a ban stops talking to AniDB entirely: every AniDB Task fails at once with the time the block lifts, sending nothing, and a restart does not resume hammering. Repeated bans block for longer. See ADR-0003 and the glossary for Circuit breaker.

**Blocked by:** 03, 04

**Status:** done

- [x] On `501` or `506` the Session logs in again once and retries the request; if that fails too, the Task fails with the AniDB code and label.
- [x] `555`, a run of timeouts, or `503`/`504` trips the Circuit breaker: queued requests are rejected, and every AniDB Task fails at once with the block-until time, sending no packet.
- [x] The first block lasts 30 minutes, doubling on each further trip up to 24 hours; the trip count resets after a clean period.
- [x] The block is kept in the Cache directory, so a Session recreated before it lifts is still blocked (in memory only when no `cacheDir` is set).
- [x] Any other AniDB error fails the Task with the AniDB code and label, and changes nothing else in the Session.
- [x] No Node Type declares a default `retryPolicy`.

## Comments

- The block lasts 30 minutes, doubling per trip up to 24 hours; trips are forgotten once a day passes after a block lifts with no new trip (ADR-0003 updated). It is kept as `anidb-block.json` in every Cache directory the process has seen, and read from a Profile's Cache directory the first time it is used, so after a restart a Profile with another, or no, Cache directory is not blocked until it trips again.
- A run of timeouts is 3 in a row (a `SessionOptions` setting, 2 in the test). anidb-udp-client waits a fixed 30 s for a reply, so the timeout test takes about a minute of real time. The library gives a lost reply as `670 UNKNOWN_API_ERROR` with the message `Timeout`, not `671 CONNECTION_TIMEOUT`; both count, and only that message text tells the first apart.
- A ban the library meets on its own keep-alive PING arrives only as a `DISCONNECT` event, which carries the error: it trips the Circuit breaker too (not tested: the library's ping interval is not shortened in tests).
- A new client paces itself afresh, so the Session keeps 4 s between a disconnect and the next login (tested on the 501 retry).
- Library behaviour left to the user:
  - On every code in its fatal list (bans, timeouts, 501/506, and also 502, 505, 600, 601, 602, 604…) the library disconnects, sending a raw `LOGOUT`, unpaced, even after a ban; after a timeout that `LOGOUT` may itself wait 30 s. So "changes nothing else in the Session" holds only for non-fatal codes (tested with `598`): after a fatal one the next Task logs in again.
  - Each timeout below the trip threshold therefore costs a new login.
- Not tested: an answer ending a run of timeouts (it would take a further 30 s wait).
- 2026-11-01, ticket 13: the `cacheDir` Profile field is gone; the Cache and the block now live in the data directory the Host gives the Plugin (SDK 0.6).
