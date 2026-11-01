// The `AniDBIdentifyFile` Worker: Identification of a file on AniDB, by its fid or else by the ed2k and size
// AniDBHashFile gives, through the Session. The result keeps the rest of the input, so later Nodes still know which file it was.
import { decodeFileState } from "anidb-udp-client";
import type { TaskEnvelope, Worker, WorkerContext } from "fyflow-plugin-sdk";
import {
  chosenFields,
  DEFAULT_FILE_FIELDS,
  FILE_FIELDS,
  FILE_FIELDS_BY_PART,
  type FileField,
  type Part,
} from "./fields.ts";
import { fileRef } from "./file-ref.ts";
import { unlessNotFound } from "./not-found.ts";
import { type SessionConfig, session } from "./session.ts";

const partOf = new Map<string, Part>(
  Object.entries(FILE_FIELDS_BY_PART).flatMap(([part, names]) => names.map((name) => [name, part as Part])),
);

/** The ids every result carries, and the part they belong in. */
const IDS = { aid: "anime", eid: "episode", gid: "group" } as const;
const ids = Object.keys(IDS) as Array<keyof typeof IDS>;

type Settings = { fields?: string[] };
type Input = { fid?: unknown; ed2k?: unknown; size?: unknown; [field: string]: unknown } | null | undefined;

/**
 * The library's flat file answer, split into the file, anime, episode and group it describes. Only the `fields` asked
 * for: an answer from the Cache may hold more, kept from a wider request.
 */
function split(answer: Record<string, unknown>, fields: readonly FileField[]) {
  const parts: Record<Part, Record<string, unknown>> = {
    file: { fid: Number(answer.fid) },
    anime: {},
    episode: {},
    group: {},
  };
  for (const [id, part] of Object.entries(IDS)) parts[part][id] = answer[id];
  for (const name of fields) {
    const part = partOf.get(name);
    if (part !== undefined) parts[part][name] = answer[name];
  }
  // The state is a bit field: decoded beside it, so a Flow can branch on `file.version` or `file.crc_err`.
  if (fields.includes("state")) Object.assign(parts.file, decodeFileState(answer.state as string));
  return parts;
}

export default class IdentifyFile implements Worker<Settings, Input> {
  readonly #config: SessionConfig;

  constructor(config: SessionConfig) {
    this.#config = config;
  }

  async run({ settings, input }: TaskEnvelope<Settings, Input>, context: WorkerContext) {
    const ref = fileRef("AniDBIdentifyFile", input);
    const fields = chosenFields("AniDBIdentifyFile", settings.fields, FILE_FIELDS, DEFAULT_FILE_FIELDS);
    const asked = [...ids, ...fields];
    const key = "fid" in ref ? `FILE:fid=${ref.fid}` : `FILE:s${ref.size}|h${ref.ed2k}`;
    const answer = await session().request(
      this.#config,
      ({ client, cache }) =>
        unlessNotFound(cache, key, () =>
          "fid" in ref ? client.file(ref.fid, asked) : client.file_by_hash(ref.ed2k, ref.size, asked),
        ),
      context,
    );
    if (answer === undefined) return { ...input, found: false };
    return { ...input, found: true, ...split(answer as Record<string, unknown>, fields) };
  }
}
