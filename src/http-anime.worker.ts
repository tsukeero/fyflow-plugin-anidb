// The `AniDBHTTPAnime` Worker: an anime by its aid, as AniDB's HTTP API describes it, through the Host's one HTTP API
// client (ADR-0006). It needs no AniDB account. The result keeps the rest of the input.
import type { TaskEnvelope, Worker, WorkerContext } from "fyflow-plugin-sdk";
import { type HttpConfig, httpApi } from "./http.ts";
import { isId } from "./ids.ts";

type Input = { aid?: unknown; [field: string]: unknown } | null | undefined;

export default class HttpAnime implements Worker<object, Input> {
  readonly #config: HttpConfig;

  constructor(config: HttpConfig) {
    this.#config = config;
  }

  async run({ input }: TaskEnvelope<object, Input>, context: WorkerContext) {
    const aid = input?.aid;
    if (!isId(aid)) throw new Error("AniDBHTTPAnime needs `aid` in its input: the anime's AniDB id");
    const anime = await httpApi().anime(aid, this.#config, context);
    return anime === undefined ? { ...input, found: false } : { ...input, found: true, anime };
  }
}
