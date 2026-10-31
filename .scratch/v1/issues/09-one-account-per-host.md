# 09: One account per Host

**What to build:** A user with two Profiles naming different AniDB accounts gets a clear failure, not a ban: while one Profile's account holds the Session, a Task from the other fails saying which account holds it. Once the Session idles out, the other Profile can open it. See ADR-0002 and the glossary for Session account.

**Blocked by:** 03

**Status:** done

- [x] The Session is opened with the start-up fields of the first Profile to use it.
- [x] A Task whose Profile differs in username, credentials or `cacheDir` fails at once, naming the account holding the Session and when it would idle out; no packet is sent.
- [x] Profiles with identical Session fields share the Session freely.
- [x] After the Session logs out when idle, the next Task's Profile opens it with its own fields.
- [x] No secret appears in the failure message.

## Comments

- The first Profile to use the Session holds it with its Session fields (username, password, UDP API key, Cache directory; an empty field counts as unset) from its first Task until the Session shuts down, as when it idles out. Its username is the Session account (GLOSSARY.md updated). A Task whose Profile differs fails before it is queued, naming the Session account and the fields that differ, never their values, and when the Session idles out: the time when it is idle, "once its Tasks are done" while it is busy.
- The holder keeps the Session across a disconnect the library makes by itself (a fatal reply, a Circuit breaker trip): another account taking over straight after a ban sign is what ADR-0002 guards against. It is freed at once only when its login is refused, having never held a session.
- From review: a request still out when the Session shuts down never logs in again on a `501`/`506` retry, so a shut-down holder's fields cannot open the Session under the next one.
