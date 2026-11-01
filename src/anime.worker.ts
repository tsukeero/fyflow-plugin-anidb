// The `AniDBAnime` Worker: looks an anime up on AniDB through the Session, by its aid or any of its titles. The
// result keeps the rest of the input.
import type { TaskEnvelope, Worker, WorkerContext } from "fyflow-plugin-sdk";
import { ANIME_FIELDS, chosenFields, DEFAULT_ANIME_FIELDS } from "./fields.ts";
import { isId } from "./ids.ts";
import { unlessNotFound } from "./not-found.ts";
import { type SessionConfig, session } from "./session.ts";

type Settings = { fields?: string[] };
type Input = { aid?: unknown; title?: unknown; [field: string]: unknown } | null | undefined;

type AnimeRef = { aid: number } | { title: string };

/** The anime by its aid when the input has one, otherwise by its title. */
function animeOf(input: Input): AnimeRef {
  const { aid, title } = input ?? {};
  if (isId(aid)) return { aid };
  // anidb-udp-client keys its Cache by aid or title alike: an all-digit title would read that aid's record.
  if (aid === undefined && typeof title === "string" && /^\d+$/.test(title))
    throw new Error(
      `AniDBAnime cannot look up the title ${title}, which reads as an aid: give its \`aid\` instead`,
    );
  if (aid === undefined && typeof title === "string" && title !== "") return { title };
  throw new Error("AniDBAnime needs `aid`, or `title`, in its input: the anime's id, or any of its titles");
}

export default class Anime implements Worker<Settings, Input> {
  readonly #config: SessionConfig;

  constructor(config: SessionConfig) {
    this.#config = config;
  }

  async run({ settings, input }: TaskEnvelope<Settings, Input>, context: WorkerContext) {
    const ref = animeOf(input);
    const anime = "aid" in ref ? ref.aid : ref.title;
    // Tagged, so a title that is a number, such as 86, is never taken for an aid.
    const key = "aid" in ref ? `ANIME:aid=${ref.aid}` : `ANIME:title=${ref.title}`;
    const fields = chosenFields("AniDBAnime", settings.fields, ANIME_FIELDS, DEFAULT_ANIME_FIELDS);
    const answer = await session().request(
      this.#config,
      ({ client, cache }) => unlessNotFound(cache, key, () => client.anime(anime, fields)),
      context,
    );
    if (answer === undefined) return { ...input, found: false };
    // Only the fields asked for: an answer from the Cache may hold more, kept from a wider request.
    const chosen = Object.fromEntries(
      fields.map((field) => [field, (answer as Record<string, unknown>)[field]]),
    );
    return { ...input, found: true, anime: { aid: answer.aid, ...chosen } };
  }
}
