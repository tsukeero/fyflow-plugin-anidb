// The Session: the one AniDB UDP connection a Host process holds, borrowed by every Session Worker (ADR-0001). It
// lives on `globalThis`, so every copy of this module (one per Plugin entry stamp, after a Reload) finds the same one.
// Tasks wait their turn in its Request queue, sent one at a time; the library spaces them at AniDB's pace.
import { isAbsolute } from "node:path";
import { AnidbUDPClient } from "anidb-udp-client";
import type { WorkerContext } from "fyflow-plugin-sdk";
import { Cache } from "./cache.ts";

/** The Profile's start-up fields the Session is opened with. */
export const SESSION_FIELDS = ["username", "password", "udpApiKey", "cacheDir"] as const;

export type SessionFields = Partial<Record<(typeof SESSION_FIELDS)[number], string>>;

/** The time anidb-udp-client leaves between requests (its own, not configurable), to AniDB's long-term limit. */
const SPACING_MS = 4_000;

export interface SessionOptions {
  /** How long the Session stays logged in with no requests. */
  idleMs?: number;
  /** The clock the Cache keeps time by. */
  now?: () => number;
}

const NOT_PERSISTED = "AniDB answers will not persist: set `cacheDir` on this Task's Profile";
/** Whether the Host's log has been told answers will not persist: once per process is enough. */
let warnedNotPersisted = false;

/** What a request is sent over: the logged-in client, and the Cache it keeps its answers in. */
export interface Connection {
  client: AnidbUDPClient;
  cache: Cache;
}

/** A Task's request, waiting in the Request queue or being sent. */
interface QueuedRequest {
  fields: SessionFields;
  call: (connection: Connection) => Promise<unknown>;
  context: WorkerContext;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  /** The place in the queue the Task was last told. */
  toldPlace?: number;
}

const required = (fields: SessionFields, name: "username" | "password") => {
  const value = fields[name];
  if (value === undefined || value === "")
    throw new Error(`No AniDB ${name}: set \`${name}\` in the anidb section of this Task's Profile`);
  return value;
};

const cacheDirOf = ({ cacheDir }: SessionFields) => {
  if (cacheDir !== undefined && !isAbsolute(cacheDir))
    throw new Error(
      `The Cache directory ${cacheDir} is not an absolute path: fix \`cacheDir\` on this Task's Profile`,
    );
  return cacheDir;
};

/** Progress is the Host's to show; a Task that cannot take it must not stall the queue. */
const tell = (context: WorkerContext, message: string) => {
  try {
    context.sendProgress(0, message);
  } catch {}
};

class Session {
  readonly #idleMs: number;
  readonly #now: (() => number) | undefined;
  /** The login, pending or done; undefined while logged out. */
  #login: Promise<Connection> | undefined;
  /** The logged-in client, once the login is done. */
  #client: AnidbUDPClient | undefined;
  /** The Session account. */
  #account: string | undefined;
  /** Whether the login's Cache is in a Cache directory, so its answers persist. */
  #persisted = false;
  /** The last logout, which a new login waits for, so two sessions never overlap. */
  #loggingOut: Promise<void> = Promise.resolve();
  readonly #queue: QueuedRequest[] = [];
  #sending: QueuedRequest | undefined;
  #idle: ReturnType<typeof setTimeout> | undefined;

  constructor({ idleMs = 10 * 60_000, now }: SessionOptions = {}) {
    this.#idleMs = idleMs;
    this.#now = now;
  }

  /**
   * Queues `call` for the login, telling the Task its place as the queue moves. A Task Cancelled while
   * queued leaves without sending anything; one Cancelled while its request is out stops waiting for the reply.
   */
  request<T>(
    fields: SessionFields,
    call: (connection: Connection) => Promise<T>,
    context: WorkerContext,
  ): Promise<T> {
    required(fields, "username");
    required(fields, "password");
    cacheDirOf(fields);
    context.signal.throwIfAborted();
    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest = {
        fields,
        call,
        context,
        resolve: (value) => {
          context.signal.removeEventListener("abort", abort);
          resolve(value as T);
        },
        reject: (reason) => {
          context.signal.removeEventListener("abort", abort);
          reject(reason);
        },
      };
      const abort = () => {
        const index = this.#queue.indexOf(request);
        if (index !== -1) {
          this.#queue.splice(index, 1);
          this.#tellQueued();
        }
        request.reject(context.signal.reason);
      };
      context.signal.addEventListener("abort", abort, { once: true });
      this.#queue.push(request);
      clearTimeout(this.#idle);
      if (this.#sending === undefined) void this.#next();
      else this.#tellQueued();
    });
  }

  /** Sends the next queued request, once the one being sent is answered. */
  async #next() {
    const request = this.#queue.shift();
    if (request === undefined) {
      if (this.#login !== undefined) this.#armIdle();
      return;
    }
    this.#sending = request;
    this.#tellQueued();
    try {
      const login = this.#connect(request.fields);
      tell(request.context, `Asking AniDB as ${this.#account}`);
      if (!this.#persisted) tell(request.context, NOT_PERSISTED);
      request.resolve(await request.call(await login));
    } catch (error) {
      request.reject(error);
    } finally {
      this.#sending = undefined;
      void this.#next();
    }
  }

  /** Logs out once no request has come for the idle time, without keeping the Host's process alive for it. */
  #armIdle() {
    this.#idle = setTimeout(() => void this.shutdown(), this.#idleMs);
    (this.#idle as { unref?: () => void }).unref?.();
  }

  /** Tells each queued Task whose place changed its new place and expected wait. */
  #tellQueued() {
    this.#queue.forEach((request, index) => {
      const place = index + 1;
      if (request.toldPlace === place) return;
      request.toldPlace = place;
      const account = this.#account ?? request.fields.username;
      tell(
        request.context,
        `Queued #${place} for AniDB as ${account}, about ${(place * SPACING_MS) / 1000} s`,
      );
    });
  }

  /** The login, starting one if logged out. */
  #connect(fields: SessionFields): Promise<Connection> {
    if (this.#login === undefined) {
      const login = this.#loggingOut.then(() => this.#logIn(fields));
      this.#login = login;
      this.#account = fields.username;
      this.#persisted = fields.cacheDir !== undefined;
      login.catch(() => {
        if (this.#login === login) this.#loggedOut();
      });
    }
    return this.#login;
  }

  async #logIn({ username, password, udpApiKey, cacheDir }: SessionFields) {
    let cache: Cache;
    try {
      cache = new Cache(cacheDir, this.#now);
    } catch (error) {
      throw new Error(
        `Cannot keep the Cache in ${cacheDir}: ${(error as Error).message}: fix \`cacheDir\` on this Task's Profile`,
      );
    }
    if (cacheDir === undefined && !warnedNotPersisted) {
      warnedNotPersisted = true;
      console.warn(`fyflow-plugin-anidb: ${NOT_PERSISTED}`);
    }
    // Never the library's default cache: it writes into the working directory (ADR-0004).
    const client = new AnidbUDPClient(undefined, { cache, logger: false });
    // The library disconnects by itself on a fatal reply: the next request then logs in again. The login's Cache
    // closes only once its client is done with it.
    client.on(AnidbUDPClient.EVENTS.DISCONNECT, () => {
      cache.close();
      if (this.#client === client) this.#loggedOut();
    });
    try {
      await client.connect(username, password, udpApiKey);
    } catch (error) {
      cache.close();
      throw error;
    }
    this.#client = client;
    return { client, cache };
  }

  #loggedOut() {
    this.#login = undefined;
    this.#client = undefined;
    this.#account = undefined;
  }

  /** Rejects every request queued or being sent, and logs out; the next request logs in again. */
  async shutdown() {
    clearTimeout(this.#idle);
    const error = new Error("The AniDB Session was shut down");
    for (const request of this.#queue.splice(0)) request.reject(error);
    this.#sending?.reject(error);
    const login = this.#login;
    this.#loggedOut();
    if (login === undefined) return;
    this.#loggingOut = login.then(
      ({ client }) => client.disconnect(),
      () => {}, // It never logged in: nothing to close.
    );
    await this.#loggingOut;
  }
}

const KEY = Symbol.for("fyflow-plugin-anidb.session");
const shared = globalThis as { [KEY]?: Session };

/** The Host's one Session. */
export const session = (): Session => (shared[KEY] ??= new Session());

/** Shuts the Host's Session down and replaces it with a new one: for tests. */
export async function resetSession(options?: SessionOptions) {
  await shared[KEY]?.shutdown();
  shared[KEY] = new Session(options);
}
