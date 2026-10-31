// The `AniDBHashFile` Worker: the ed2k of a file under the Roots its Profile grants (ADR-0005). It never touches the
// Session, so it runs threaded.
import { type FileHandle, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import type { TaskEnvelope, Worker, WorkerContext } from "fyflow-plugin-sdk";
import { createMD4, type IHasher } from "hash-wasm";

/** ed2k hashes a file in chunks of this many bytes. */
const CHUNK = 9_728_000;

type Input = { path?: unknown } | null | undefined;
type ProfileFields = { roots?: string[] };

// On Windows `isAbsolute` also takes `\x`, relative to the current drive; only a drive or share path is absolute.
const absolute = (path: string) =>
  process.platform === "win32" ? /^([a-zA-Z]:[\\/]|[\\/]{2}[^\\/])/.test(path) : isAbsolute(path);

const under = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

/** The real path of `path`, refused unless it is absolute and, symlinks resolved, under one of `roots`. */
async function allowed(path: unknown, roots: string[] | undefined) {
  if (roots === undefined || roots.length === 0)
    throw new Error("No Roots to hash files under: set `roots` in the anidb section of this Task's Profile");
  const relativeRoot = roots.find((root) => !absolute(root));
  if (relativeRoot !== undefined)
    throw new Error(`The Root ${relativeRoot} is not an absolute path: fix \`roots\` on this Task's Profile`);
  if (typeof path !== "string" || !absolute(path))
    throw new Error("AniDBHashFile needs `path`, an absolute path, in its input");
  const real = await realpath(path);
  const realRoots = await Promise.all(roots.map((root) => realpath(root).catch(() => undefined)));
  if (!realRoots.some((root) => root !== undefined && under(root, real)))
    throw new Error(`${path} is not under any of the Roots this Task's Profile grants`);
  return real;
}

export default class HashFile implements Worker<object, Input, unknown, ProfileFields> {
  async run({ settings, input }: TaskEnvelope<object, Input, ProfileFields>, context: WorkerContext) {
    const path = input?.path;
    const real = await allowed(path, settings.profile.roots);
    const file = await open(real);
    try {
      const stat = await file.stat();
      // The path may have changed between the check and the open: read only the file the check allowed.
      const now = await realpath(real);
      if (now !== real || !stat.isFile()) throw new Error(`${path} is not a file under the Roots`);
      const { size } = stat;
      const md4 = await createMD4();
      const chunk = new Uint8Array(Math.min(CHUNK, size));
      const hashes: Uint8Array[] = [];
      for (let read = 0; read < size; ) {
        context.signal.throwIfAborted();
        const length = await fill(file, chunk, read, size);
        hashes.push(digest(md4, chunk.subarray(0, length)));
        read += length;
        context.sendProgress(read / size);
      }
      // An exact multiple of the chunk size, an empty file included, also counts an empty chunk.
      if (size % CHUNK === 0) hashes.push(digest(md4, new Uint8Array(0)));
      // A file under one chunk is its one chunk's MD4; a longer one the MD4 of its chunks' MD4s.
      const [only] = hashes;
      const ed2k = toHex(size < CHUNK && only !== undefined ? only : digest(md4, ...hashes));
      return { path, size, ed2k };
    } finally {
      await file.close();
    }
  }
}

/** Reads the next chunk into `chunk`, as much of it as the file has left. */
async function fill(file: FileHandle, chunk: Uint8Array, position: number, size: number) {
  const length = Math.min(chunk.length, size - position);
  for (let offset = 0; offset < length; ) {
    const { bytesRead } = await file.read(chunk, offset, length - offset, position + offset);
    if (bytesRead === 0) throw new Error("The file shrank while it was being hashed");
    offset += bytesRead;
  }
  return length;
}

function digest(md4: IHasher, ...parts: Uint8Array[]) {
  md4.init();
  for (const part of parts) md4.update(part);
  return md4.digest("binary");
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
