// The `AniDBStatus` Worker (named by the spec; the glossary's term is Session snapshot): the Session snapshot, so a user or an Agent can see whether AniDB is usable. It borrows
// the Session without queuing, connecting or sending, and takes no secret.
import type { TaskEnvelope, Worker, WorkerContext } from "fyflow-plugin-sdk";
import { type SessionFields, type SessionSnapshot, session } from "./session.ts";

export default class Status implements Worker<object, unknown, SessionSnapshot> {
  readonly #cacheDir: string | undefined;

  constructor({ cacheDir }: Pick<SessionFields, "cacheDir">) {
    this.#cacheDir = cacheDir;
  }

  async run(_task: TaskEnvelope<object, unknown>, _context: WorkerContext): Promise<SessionSnapshot> {
    return session().snapshot(this.#cacheDir);
  }
}
