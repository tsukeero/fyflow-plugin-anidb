// The `AniDBMyListGet` Worker: a file's MyList entry, by fid or by ed2k and size, asked of AniDB every time, since
// MyList is never cached. The result keeps the rest of the input.
import type { TaskEnvelope, Worker, WorkerContext } from "fyflow-plugin-sdk";
import { fileRef } from "./file-ref.ts";
import { isNotFound } from "./not-found.ts";
import { type SessionFields, session } from "./session.ts";

type Input = { [field: string]: unknown } | null | undefined;

export default class MyListGet implements Worker<object, Input> {
  readonly #fields: SessionFields;

  constructor(fields: SessionFields) {
    this.#fields = fields;
  }

  async run({ input }: TaskEnvelope<object, Input>, context: WorkerContext) {
    const file = fileRef("AniDBMyListGet", input);
    try {
      const entry = await session().request(
        this.#fields,
        ({ client }) =>
          "fid" in file
            ? client.mylist_by_file_id(file.fid)
            : client.mylist_by_file_hash(file.ed2k, file.size),
        context,
      );
      return { ...input, found: true, entry };
    } catch (error) {
      if (isNotFound(error)) return { ...input, found: false };
      throw error;
    }
  }
}
