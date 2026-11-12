// The `AniDBHashFile` Worker: the ed2k of a file under the Allowed roots its Task's Profile grants (ADR-0005). It never
// touches the Session, so it runs threaded.
import { type FileHandle, open, realpath } from "node:fs/promises";
import { allowedPath, type TaskEnvelope, type Worker, type WorkerContext } from "fyflow-plugin-sdk";
import { createMD4, type IHasher } from "hash-wasm";

/** ed2k hashes a file in chunks of this many bytes. */
const CHUNK = 9_728_000;

type Input = { path?: unknown } | null | undefined;

export default class HashFile implements Worker<object, Input> {
  async run({ settings, input }: TaskEnvelope<object, Input>, context: WorkerContext) {
    const path = input?.path;
    if (typeof path !== "string")
      throw new Error("AniDBHashFile needs `path`, an absolute path, in its input");
    // Where the path really leads, refused unless an Allowed root with read access holds it, links followed.
    const real = await allowedPath(settings.roots, path, "read");
    const file = await open(real);
    try {
      const stat = await file.stat();
      // The path may have changed between the check and the open: read only the file the check allowed.
      const now = await realpath(real);
      if (now !== real || !stat.isFile()) throw new Error(`${path} is not a file under the Allowed roots`);
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
