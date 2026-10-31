# 08: Session expiry, errors and the Circuit breaker

**What to build:** A long-running Host keeps working when AniDB expires its session, and at the first sign of a ban stops talking to AniDB entirely: every AniDB Task fails at once with the time the block lifts, sending nothing, and a restart does not resume hammering. Repeated bans block for longer. See ADR-0003 and the glossary for Circuit breaker.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] On `501` or `506` the Session logs in again once and retries the request; if that fails too, the Task fails with the AniDB code and label.
- [ ] `555`, a run of timeouts, or `503`/`504` trips the Circuit breaker: queued requests are rejected, and every AniDB Task fails at once with the block-until time, sending no packet.
- [ ] The first block lasts 30 minutes, doubling on each further trip up to 24 hours; the trip count resets after a clean period.
- [ ] The block is kept in the Cache directory, so a Session recreated before it lifts is still blocked (in memory only when no `cacheDir` is set).
- [ ] Any other AniDB error fails the Task with the AniDB code and label, and changes nothing else in the Session.
- [ ] No Node Type declares a default `retryPolicy`.
