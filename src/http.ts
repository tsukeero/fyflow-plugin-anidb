// AniDB's HTTP API: one client per Host process, shared by every HTTP Task (ADR-0006). Like the Session, it lives on
// `globalThis`, so every copy of this module (one per Plugin entry stamp, after a Reload) finds the same one, and
// AniDB's pace (a request every 2 seconds) and a ban hold for the whole process. Its answers go into the Plugin's
// Cache. A ban, or a run of timeouts, trips a Circuit breaker of its own (the HTTP API is banned apart from UDP), kept
// in the data directory, so a restart does not resume either.
import { AnidbHTTPClient, type HTTPAnimeResult } from "anidb-udp-client";
import type { HostConfig, WorkerContext } from "fyflow-plugin-sdk";
import { Cache } from "./cache.ts";
import { CircuitBreaker } from "./circuit-breaker.ts";
import { unlessNotFound } from "./not-found.ts";

/**
 * The client registered for AniDB's HTTP API: anidb-udp-client's, as the UDP side uses its `anidbudpclientjs`. It is a
 * registration apart from the UDP one, and AniDB refuses a request from a client it does not know.
 */
export const HTTP_CLIENT = "anidbhttclientjs";
export const HTTP_CLIENT_VERSION = 1;

/** The file in the data directory the HTTP API's block is kept in, apart from the Session's. */
export const HTTP_BLOCK_FILE = "anidb-http-block.json";

/** An HTTP Worker's config: no Profile field, only the Plugin's data directory the Host gives it. */
export type HttpConfig = { host?: HostConfig };

export interface HttpOptions {
  /** The clock the Cache and the Circuit breaker keep time by. */
  now?: () => number;
  /** How many requests in a row AniDB may leave unanswered before the Circuit breaker trips. */
  timeoutsToTrip?: number;
}

/** Waits for `promise`, or rejects at once when `signal` aborts, leaving it to settle on its own. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Progress is the Host's to show; a Task that cannot take it must not stall the queue. */
const tell = (context: WorkerContext, message: string) => {
  try {
    context.sendProgress(0, message);
  } catch {}
};

class HttpApi {
  readonly #now: (() => number) | undefined;
  readonly #breaker: CircuitBreaker;
  /** The Cache, opened in the data directory the first Task names, or in memory without one. */
  #cache: Cache | undefined;
  /** The client: dropped when a ban trips the Circuit breaker, as the library refuses everything after one. */
  #client: AnidbHTTPClient | undefined;
  /** The last request handed to the client: each waits for it, so at most one is ever out. */
  #tail: Promise<void> = Promise.resolve();
  /** How many Tasks wait for, or are in, a request. */
  #waiting = 0;

  constructor({ now, timeoutsToTrip = 3 }: HttpOptions = {}) {
    this.#now = now;
    this.#breaker = new CircuitBreaker(now ?? Date.now, timeoutsToTrip, {
      file: HTTP_BLOCK_FILE,
      what: "AniDB's HTTP API",
    });
  }

  /**
   * The anime `aid`, from the Cache or else from AniDB, or undefined when AniDB said, within the last day, there is no
   * such anime. Requests go one at a time, so the Circuit breaker can stop the ones still waiting; a Task Cancelled
   * while waiting leaves without sending anything, and one Cancelled while its request is out stops waiting for it.
   */
  async anime(aid: number, config: HttpConfig, context: WorkerContext): Promise<HTTPAnimeResult | undefined> {
    context.signal.throwIfAborted();
    const dataDir = config.host?.dataDir;
    this.#breaker.check(dataDir);
    const cache = this.#openCache(dataDir);
    const key = `HTTP_ANIME:${aid}`;
    // A remembered answer, or Not found, sends nothing: no need to wait for the requests ahead.
    if ((await cache.get(key)) !== undefined || (await cache.get(`NOTFOUND:${key}`)) !== undefined)
      return unlessNotFound(cache, key, () => this.#openClient(cache).anime(aid));
    return this.#inTurn(context, () => {
      this.#breaker.check(dataDir);
      return this.#sent(
        dataDir,
        unlessNotFound(cache, key, () => this.#openClient(cache).anime(aid)),
      );
    });
  }

  /** Runs `send` once the requests ahead of it are done, unless the Task is Cancelled first. */
  #inTurn<T>(context: WorkerContext, send: () => Promise<T>): Promise<T> {
    const { signal } = context;
    if (this.#waiting > 0) tell(context, `Waiting for AniDB's HTTP API: ${this.#waiting} ahead`);
    this.#waiting++;
    const sent = this.#tail.then(() => {
      signal.throwIfAborted();
      return send();
    });
    const done = () => {
      this.#waiting--;
    };
    this.#tail = sent.then(done, done);
    return abortable(sent, signal);
  }

  /** `request`'s answer, telling the Circuit breaker how it went. */
  async #sent<T>(dataDir: string | undefined, request: Promise<T>): Promise<T> {
    try {
      const answer = await request;
      this.#breaker.answered();
      return answer;
    } catch (error) {
      const block = this.#breaker.failed(error, dataDir);
      if (block === undefined) throw error;
      this.#client = undefined;
      throw block;
    }
  }

  #openCache(dataDir: string | undefined): Cache {
    if (this.#cache !== undefined) return this.#cache;
    try {
      this.#cache = new Cache(dataDir, this.#now);
    } catch (error) {
      throw new Error(`Cannot keep the Cache in ${dataDir}: ${(error as Error).message}`);
    }
    if (dataDir === undefined)
      console.warn(
        "fyflow-plugin-anidb: AniDB HTTP answers will not persist: the Host gave this Plugin no data directory",
      );
    return this.#cache;
  }

  // Never the library's default cache: it writes into the working directory (ADR-0004).
  #openClient(cache: Cache): AnidbHTTPClient {
    this.#client ??= new AnidbHTTPClient(HTTP_CLIENT, HTTP_CLIENT_VERSION, { cache, logger: false });
    return this.#client;
  }

  /** Closes the Cache: for tests. */
  close() {
    this.#cache?.close();
  }
}

const KEY = Symbol.for("fyflow-plugin-anidb.http");
const shared = globalThis as { [KEY]?: HttpApi };

/** The Host's one HTTP API client. */
export const httpApi = (): HttpApi => (shared[KEY] ??= new HttpApi());

/** Replaces the Host's HTTP API client with a new one: for tests. */
export function resetHttpApi(options?: HttpOptions) {
  shared[KEY]?.close();
  shared[KEY] = new HttpApi(options);
}
