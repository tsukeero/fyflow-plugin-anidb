# fyflow-plugin-anidb

A fyflow-app Plugin that lets Flows identify anime video files on AniDB and manage the user's MyList, over AniDB's UDP API. Terms from fyflow-app (Plugin, Node Type, Worker, Task, Profile, Host, Reload) keep the meanings in fyflow-app's `GLOSSARY.md`.

## Language

### The connection to AniDB

**Session**:
The one logged-in AniDB UDP connection a Host process holds, shared by every AniDB Task across Node Types, Profiles and Runtimes. It owns the Request queue and is the only thing that talks to AniDB.
_Avoid_: connection, client, login (for the shared object)

**Session Worker**:
A Worker that borrows the Session for its Tasks instead of owning a connection; every Node Type that talks to AniDB uses one, inline on the Host's thread.
_Avoid_: AniDB worker, client worker

**Session account**:
The AniDB username of the Profile holding the Session: the first Profile to use it holds it, with its Session fields, until the Session idles out (or that Profile's login is refused). A Task whose Profile differs in any Session field is refused meanwhile.
_Avoid_: user, login

**Request queue**:
The Session's own cancel-aware queue of AniDB requests, sending one at a time at AniDB's allowed pace. Tasks wait here, not in a Resource Group.
_Avoid_: rate limiter, throttle

**Circuit breaker**:
The Session state that refuses every AniDB Task without sending a packet, from a sign of a ban until a block time passes. It survives a Host restart.
_Avoid_: ban mode, cooldown

**Session snapshot**:
What the Session reports about itself: state, Session account, queue length, the next send time and any Circuit breaker block. The Plugin's status shows it on the Plugin's card and to Agents.
_Avoid_: health, status object

**Plugin status**:
The Session snapshot as the Host shows it, on the Plugin's card on the Plugins page and in MCP's `list_plugins`: a level, a one-line summary, and details. Asked for every few seconds; it never connects, queues or sends.
_Avoid_: health check, AniDBStatus

### AniDB data

**ed2k**:
AniDB's file identity hash: MD4 over 9,728,000-byte chunks. With the file's size it identifies a file on AniDB.
_Avoid_: hash, checksum (unqualified)

**Identification**:
Finding a local file on AniDB by its ed2k and size, and returning its file, anime, episode and group data.
_Avoid_: lookup, matching, scan

**MyList**:
The user's own AniDB list of the files and episodes they hold or have watched. Never cached.
_Avoid_: library, collection

**Not found**:
An AniDB answer that the asked-for thing does not exist; a Task result (`found: false`), never a failure.

**Cache**:
The persistent store of AniDB answers the Session keeps in the Plugin's data directory, so the same data is not asked for twice; AniDB requires one.
_Avoid_: store, database

**Data directory**:
The folder the Host gives this Plugin (`plugin-data/anidb/` under the Host's data directory), where the Cache and the Circuit breaker's block live. No Profile sets it; a Worker given none keeps the Cache in memory only.
_Avoid_: Cache directory, cacheDir, state dir

**Roots**:
The folders, a Profile-only field, under which `AniDBHashFile` may read files. A path outside every Root is refused.
_Avoid_: allowed paths, whitelist
