// The `AniDBIdentifyFile` Worker: Identification of a hashed file on AniDB, by its ed2k and size, through the
// Session. The result keeps the rest of the input, so later Nodes still know which file it was.
import type { TaskEnvelope, Worker, WorkerContext } from "fyflow-plugin-sdk";
import { DEFAULT_FILE_FIELDS, FIELDS, type FileField, type Part } from "./file-fields.ts";
import { fileByHash } from "./file-ref.ts";
import { unlessNotFound } from "./not-found.ts";
import { type SessionFields, session } from "./session.ts";

const partOf = new Map<string, Part>(
  Object.entries(FIELDS).flatMap(([part, names]) => names.map((name) => [name, part as Part])),
);

/** The ids every result carries, and the part they belong in. */
const IDS = { aid: "anime", eid: "episode", gid: "group" } as const;
const ids = Object.keys(IDS) as Array<keyof typeof IDS>;

/** AniDB's file state bits for versions 2 to 5; a file with none is version 1. */
const VERSIONS: Array<[bit: number, version: number]> = [
  [32, 5],
  [16, 4],
  [8, 3],
  [4, 2],
];

type Settings = { fields?: string[] };
type Input = { ed2k?: unknown; size?: unknown; [field: string]: unknown } | null | undefined;

function fieldsOf(settings: Settings): FileField[] {
  const fields = settings.fields ?? DEFAULT_FILE_FIELDS;
  if (fields.length === 0) throw new Error("AniDBIdentifyFile needs at least one field: fix `fields`");
  const unknown = fields.filter((field) => !partOf.has(field));
  if (unknown.length > 0) throw new Error(`AniDB files have no ${unknown.join(", ")}: fix \`fields\``);
  return fields as FileField[];
}

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
  if (fields.includes("state")) {
    const state = Number(answer.state);
    parts.file.version = VERSIONS.find(([bit]) => (state & bit) !== 0)?.[1] ?? 1;
  }
  return parts;
}

export default class IdentifyFile implements Worker<Settings, Input> {
  readonly #fields: SessionFields;

  constructor(fields: SessionFields) {
    this.#fields = fields;
  }

  async run({ settings, input }: TaskEnvelope<Settings, Input>, context: WorkerContext) {
    const { ed2k, size } = fileByHash("AniDBIdentifyFile", input);
    const fields = fieldsOf(settings);
    const answer = await session().request(
      this.#fields,
      ({ client, cache }) =>
        unlessNotFound(cache, `FILE:s${size}|h${ed2k}`, () =>
          client.file_by_hash(ed2k, size, [...ids, ...fields]),
        ),
      context,
    );
    if (answer === undefined) return { ...input, found: false };
    return { ...input, found: true, ...split(answer as Record<string, unknown>, fields) };
  }
}
