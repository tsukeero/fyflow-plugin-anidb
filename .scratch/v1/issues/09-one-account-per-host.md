# 09: One account per Host

**What to build:** A user with two Profiles naming different AniDB accounts gets a clear failure, not a ban: while one Profile's account holds the Session, a Task from the other fails saying which account holds it. Once the Session idles out, the other Profile can open it. See ADR-0002 and the glossary for Session account.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] The Session is opened with the start-up fields of the first Profile to use it.
- [ ] A Task whose Profile differs in username, credentials or `cacheDir` fails at once, naming the account holding the Session and when it would idle out; no packet is sent.
- [ ] Profiles with identical Session fields share the Session freely.
- [ ] After the Session logs out when idle, the next Task's Profile opens it with its own fields.
- [ ] No secret appears in the failure message.
