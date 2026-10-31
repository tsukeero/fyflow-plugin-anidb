# 02: `AniDBHashFile`

**What to build:** A Flow author can hash a video file with `AniDBHashFile`: `{ path }` in, `{ path, size, ed2k }` out, ready for Identification. It reads only under the Roots granted on the Task's Profile, shows progress as it reads, stops promptly on Cancel, and shares the Host's `disk` and `cpu` budgets. See ADR-0005 and the glossary for ed2k and Roots.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The Plugin declares a `roots` Profile field (Profile-only, per-Task, a list of absolute paths) and the `AniDBHashFile` Node Type, threaded, in the `disk` and `cpu` groups, taking `roots`.
- [x] ed2k is MD4 over 9,728,000-byte chunks via `hash-wasm`, streamed, never reading a whole file into memory; it is correct for an empty file, a file under one chunk, exactly one chunk, several chunks, and an exact multiple of the chunk size (the empty-chunk rule), checked against known vectors.
- [x] A relative path, a path outside every Root, and one escaping a Root through `..` or a symlink are refused; with no Roots set, every path is refused with a message naming the `roots` field.
- [x] Progress is reported by bytes read; a Cancel mid-file stops reading within one chunk.
- [x] Tests run on Node and Deno.

## Comments

- The expected ed2k values come from Deno's `node:crypto` MD4, independent of `hash-wasm`, but the exact-multiple-of-a-chunk rule (append the empty chunk's MD4) is the one the spec states, not checked against a hash AniDB itself published. Before release, compare one file of exactly 9,728,000 bytes (or a multiple) with AniDB's own ed2k.
- Beyond the ticket, from review: Roots and paths must be absolute (on Windows a drive or share path, not `\x`), a Root that is not absolute refuses every path (as fyflow.fs does), only regular files are read, and the real path is checked again after opening. A swap racing the check and the open is narrowed, not closed, as in fyflow.fs.
- The path comes from the Task input only; a `path` Node setting was dropped as not asked for.
