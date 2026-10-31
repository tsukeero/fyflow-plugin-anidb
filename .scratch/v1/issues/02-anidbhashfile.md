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

- The expected ed2k values come from Deno's `node:crypto` MD4, independent of `hash-wasm`, but the exact-multiple-of-a-chunk rule (append the empty chunk's MD4) is the one the spec states, checked since (2026-10-31) against AniDB's own: AniDB keeps the "red" variant, the empty chunk counted. Its wiki's Ed2k-hash page publishes both variants for files of zeros, and says Avdump2 change-requests files from blue to red, keeping blue only as an "Alternative ed2k" in the file's description; AVDump3 issue #48 shows AniDB's primary `<ed2k>` is red and `<ed2k_alt>` blue for a 252,928,000-byte file. The wiki's zero-file values are now test vectors.
- Beyond the ticket, from review: Roots and paths must be absolute (on Windows a drive or share path, not `\x`), a Root that is not absolute refuses every path (as fyflow.fs does), only regular files are read, and the real path is checked again after opening. A swap racing the check and the open is narrowed, not closed, as in fyflow.fs.
- The path comes from the Task input only; a `path` Node setting was dropped as not asked for.
