// The `AniDBEpisode` Worker: looks an episode up on AniDB through the Session, by its eid, or by its anime's aid and
// its episode number. The result keeps the rest of the input.
import type { TaskEnvelope, Worker, WorkerContext } from "fyflow-plugin-sdk";
import { isId } from "./ids.ts";
import { unlessNotFound } from "./not-found.ts";
import { type SessionFields, session } from "./session.ts";

type Input = { eid?: unknown; aid?: unknown; epno?: unknown; [field: string]: unknown } | null | undefined;
type EpisodeRef = { eid: number } | { aid: number; epno: string };

function episodeOf(input: Input): EpisodeRef {
  const { eid, aid, epno } = input ?? {};
  if (isId(eid)) return { eid };
  // An episode number is AniDB's: 1, or S1 for a special, C1 for a credit and so on.
  if (eid === undefined && isId(aid) && (isId(epno) || (typeof epno === "string" && epno !== "")))
    return { aid, epno: String(epno) };
  throw new Error(
    "AniDBEpisode needs `eid`, or `aid` and `epno`, in its input: an episode's id, or its anime's id and its number, such as 1 or S1",
  );
}

export default class Episode implements Worker<object, Input> {
  readonly #fields: SessionFields;

  constructor(fields: SessionFields) {
    this.#fields = fields;
  }

  async run({ input }: TaskEnvelope<object, Input>, context: WorkerContext) {
    const ref = episodeOf(input);
    const episode = await session().request(
      this.#fields,
      ({ client, cache }) =>
        "eid" in ref
          ? unlessNotFound(cache, `EPISODE:${ref.eid}`, () => client.episode(ref.eid))
          : unlessNotFound(cache, `EPISODE:${ref.aid}:${ref.epno}`, () =>
              client.episode_by_anime(ref.aid, ref.epno),
            ),
      context,
    );
    if (episode === undefined) return { ...input, found: false };
    return { ...input, found: true, episode };
  }
}
