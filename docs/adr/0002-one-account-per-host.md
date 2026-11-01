# One AniDB account per Host

With one Session per Host, two Profiles naming different AniDB accounts cannot both be served. The first Profile to open the Session holds it; a Task whose Profile names another account, or another password or UDP API key, fails saying the Session is held by another account, until the Session disconnects when idle.

## Considered Options

- Swapping accounts when the Session goes idle: more logins, more ban risk.
- One Session per account under a shared send clock: several ports from one IP, itself a reported ban trigger.
