# 10: `AniDBStatus`

**What to build:** A user or an Agent can see whether AniDB is usable by running a Flow with `AniDBStatus`, which returns the Session snapshot: its state, Session account, queue length, next send time and any Circuit breaker block. See the glossary for Session snapshot.

**Blocked by:** 03, 08

**Status:** ready-for-agent

- [ ] `AniDBStatus` (Session Worker, no input) returns `{ state, account, queued, nextSendAt, blockedUntil }`, with `state` one of disconnected, connecting, connected, blocked.
- [ ] Running it never connects the Session, never queues behind other Tasks and never sends a packet.
- [ ] It reports a Circuit breaker block, including one restored from the Cache directory.
- [ ] No secret appears in its result.
