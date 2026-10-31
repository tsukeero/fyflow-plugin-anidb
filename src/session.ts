// The Session: the one AniDB UDP connection a Host process holds, borrowed by every Session Worker (ADR-0001). It
// lives on `globalThis`, so every copy of this module (one per Plugin entry stamp, after a Reload) finds the same one.
import { AnidbUDPClient } from "anidb-udp-client";

/** The Profile's start-up fields the Session is opened with. */
export const SESSION_FIELDS = ["username", "password", "udpApiKey"] as const;

export type SessionFields = Partial<Record<(typeof SESSION_FIELDS)[number], string>>;

const required = (fields: SessionFields, name: "username" | "password") => {
  const value = fields[name];
  if (value === undefined || value === "")
    throw new Error(`No AniDB ${name}: set \`${name}\` in the anidb section of this Task's Profile`);
  return value;
};

class Session {
  #client: Promise<AnidbUDPClient> | undefined;

  /** The logged-in client, connecting on first use. */
  client(fields: SessionFields): Promise<AnidbUDPClient> {
    required(fields, "username");
    required(fields, "password");
    this.#client ??= this.#connect(fields).catch((error: unknown) => {
      this.#client = undefined;
      throw error;
    });
    return this.#client;
  }

  async #connect({ username, password, udpApiKey }: SessionFields) {
    // Never the library's default cache: it writes into the working directory (ADR-0004).
    const client = new AnidbUDPClient(undefined, { cache: false, logger: false });
    await client.connect(username, password, udpApiKey);
    return client;
  }

  /** Logs out and closes the connection; the next use connects again. */
  async shutdown() {
    const connecting = this.#client;
    this.#client = undefined;
    if (connecting === undefined) return;
    let client: AnidbUDPClient;
    try {
      client = await connecting;
    } catch {
      return; // It never connected: nothing to close.
    }
    await client.disconnect();
  }
}

const KEY = Symbol.for("fyflow-plugin-anidb.session");
const shared = globalThis as { [KEY]?: Session };

/** The Host's one Session. */
export const session = (): Session => (shared[KEY] ??= new Session());
