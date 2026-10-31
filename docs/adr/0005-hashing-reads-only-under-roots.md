# Hashing reads only under Roots, with MD4 from hash-wasm

A fyflow-app Host has no sandbox, so `AniDBHashFile` could read any file a Flow names, including one an Agent built. Like fyflow.fs's Allowed roots, it reads only under the Roots its Profile grants (a Profile-only field), and with none set refuses every path. ed2k needs MD4, which Node 26's OpenSSL no longer offers and Web Crypto never did, so MD4 comes from `hash-wasm`: WebAssembly, so the same on Node and Deno, and fast enough for multi-gigabyte files.

## Considered Options

- `js-md4` or our own MD4: pure JS, several times slower on large video files.
