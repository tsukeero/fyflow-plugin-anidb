// How a Task's input names a file on AniDB: by its fid, or by the ed2k and size AniDBHashFile gives.

export type FileByHash = { ed2k: string; size: number };
export type FileRef = { fid: number } | FileByHash;

type Input = { fid?: unknown; ed2k?: unknown; size?: unknown } | null | undefined;

/** The file's ed2k and size, lower-casing the hash: the library keys its Cache by the hash as given. */
export function fileByHash(nodeType: string, input: Input): FileByHash {
  const { ed2k, size } = input ?? {};
  if (typeof ed2k !== "string" || !/^[0-9a-f]{32}$/i.test(ed2k))
    throw new Error(`${nodeType} needs \`ed2k\`, the file's 32-character ed2k hash, in its input`);
  if (typeof size !== "number" || !Number.isInteger(size) || size < 0)
    throw new Error(`${nodeType} needs \`size\`, the file's size in bytes, in its input`);
  return { ed2k: ed2k.toLowerCase(), size };
}

/** The file by its fid when the input has one, otherwise by its ed2k and size. */
export function fileRef(nodeType: string, input: Input): FileRef {
  const fid = input?.fid;
  if (fid === undefined) return fileByHash(nodeType, input);
  if (typeof fid !== "number" || !Number.isInteger(fid) || fid < 1)
    throw new Error(
      `${nodeType} needs \`fid\`, a positive whole number, or \`ed2k\` and \`size\`, in its input`,
    );
  return { fid };
}
