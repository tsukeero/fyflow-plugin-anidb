# 10: `AniDBStatus`

**What to build:** A user or an Agent can see whether AniDB is usable by running a Flow with `AniDBStatus`, which returns the Session snapshot: its state, Session account, queue length, next send time and any Circuit breaker block. See the glossary for Session snapshot.

**Blocked by:** 03, 08

**Status:** done

- [x] `AniDBStatus` (Session Worker, no input) returns `{ state, account, queued, nextSendAt, blockedUntil }`, with `state` one of disconnected, connecting, connected, blocked.
- [x] Running it never connects the Session, never queues behind other Tasks and never sends a packet.
- [x] It reports a Circuit breaker block, including one restored from the Cache directory.
- [x] No secret appears in its result.

## Comments

- `AniDBStatus` takes only `cacheDir` from its Profile (checked absolute), never the account's secrets, and runs inline on its own default pool: it answers from the Session's state at once, never connecting, queuing or sending. Without a `cacheDir` of its own it reads the Session account's Profile's.
- `queued` counts the requests waiting, not the one being sent. `nextSendAt` is an estimate: AniDB's 4 s after the Session's last request, its last session's end, or now while a request is out; the library keeps when it last sent private, and its keep-alive pings are not counted. During a block it is the block's end.
- Reading a block kept in a Cache directory takes it in for the whole Session, as any Task's check does: a Status Task can thus restore a block that then fails other Tasks at once.
- From review: a login that completes after the Session was shut down now disconnects at once rather than showing as connected.
- The Node Type keeps the spec's name `AniDBStatus`; the glossary's term for what it returns is the Session snapshot (`SessionSnapshot`).
