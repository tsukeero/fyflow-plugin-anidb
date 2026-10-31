// The `AniDBAnime` Worker: looks an anime up on AniDB through the Session.
import type { TaskEnvelope, Worker, WorkerContext } from "fyflow-plugin-sdk";
import { type SessionFields, session } from "./session.ts";

/** The anime fields a Task gets back. */
const FIELDS = ["year", "type", "romanji_name", "english_name", "episodes"] as const;

type Input = { aid?: unknown };

export default class Anime implements Worker<object, Input> {
  readonly #fields: SessionFields;

  constructor(fields: SessionFields) {
    this.#fields = fields;
  }

  async run({ input }: TaskEnvelope<object, Input>, context: WorkerContext) {
    const aid = input?.aid;
    if (typeof aid !== "number" || !Number.isInteger(aid) || aid < 1)
      throw new Error("AniDBAnime needs `aid`, a positive whole number, in its input");
    const anime = await session().request(
      this.#fields,
      ({ client }) => client.anime(aid, [...FIELDS]),
      context,
    );
    return { found: true, anime };
  }
}
