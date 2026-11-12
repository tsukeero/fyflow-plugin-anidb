# Hashing reads only under Roots, with MD4 from hash-wasm

A fyflow-app Host has no sandbox, so `AniDBHashFile` could read any file a Flow names, including one an Agent built. It reads only under the Allowed roots its Task's Profile grants, which the Host keeps (fyflow-app's ADR-0030) and hands each Task as `settings.roots`, checked with the SDK's `allowedPath`; with none set it refuses every path. The Plugin first had a Profile-only `roots` field of its own, checked by its own code; it moved to the Host's when SDK 0.11 offered them, so a person sets their folders once for every Plugin and the check, links included, is the Host's. The Worker still re-checks after `open` that the file it opened is the one allowed. ed2k needs MD4, which Node 26's OpenSSL no longer offers and Web Crypto never did, so MD4 comes from `hash-wasm`: WebAssembly, so the same on Node and Deno, and fast enough for multi-gigabyte files.

## Considered Options

- `js-md4` or our own MD4: pure JS, several times slower on large video files.
