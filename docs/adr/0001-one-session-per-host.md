# One Session per Host, borrowed by inline Session Workers

AniDB bans clients that flood it or juggle sessions and ports, but a fyflow-app Host builds one Worker pool per Node Type and Profile, may hold several instances per pool, and keeps the old Runtime's Workers running beside the new one after a Reload. So no Worker owns a connection: one Session per Host process, held in its own module and keyed on `globalThis`, is borrowed by every Session Worker. Session Workers are `inline`, because only on the Host's thread do they share a module; the Host stamps only the Plugin entry and Worker modules on Reload, so the Session's module survives it, at the cost that a change to its code needs a Host restart.

## Consequences

- Rate limiting is the Session's Request queue, not a Resource Group: groups reset at each Reload and their window is not strict.
- Each Session Worker pool is `maxThreads: 1` with a high `maxConcurrentTasks`, so waiting Tasks reach `run()` and can report their place in the queue.
- The Session connects on the first Task and disconnects after 10 minutes with no Tasks, not when the last Worker instance retires: instances come and go far more often than AniDB tolerates logins.
- `AniDBHashFile` is the exception: it never touches the Session, so it is threaded.
