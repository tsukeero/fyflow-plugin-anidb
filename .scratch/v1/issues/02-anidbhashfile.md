# 02: `AniDBHashFile`

**What to build:** A Flow author can hash a video file with `AniDBHashFile`: `{ path }` in, `{ path, size, ed2k }` out, ready for Identification. It reads only under the Roots granted on the Task's Profile, shows progress as it reads, stops promptly on Cancel, and shares the Host's `disk` and `cpu` budgets. See ADR-0005 and the glossary for ed2k and Roots.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The Plugin declares a `roots` Profile field (Profile-only, per-Task, a list of absolute paths) and the `AniDBHashFile` Node Type, threaded, in the `disk` and `cpu` groups, taking `roots`.
- [ ] ed2k is MD4 over 9,728,000-byte chunks via `hash-wasm`, streamed, never reading a whole file into memory; it is correct for an empty file, a file under one chunk, exactly one chunk, several chunks, and an exact multiple of the chunk size (the empty-chunk rule), checked against known vectors.
- [ ] A relative path, a path outside every Root, and one escaping a Root through `..` or a symlink are refused; with no Roots set, every path is refused with a message naming the `roots` field.
- [ ] Progress is reported by bytes read; a Cancel mid-file stops reading within one chunk.
- [ ] Tests run on Node and Deno.
