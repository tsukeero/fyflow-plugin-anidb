// The Cache: AniDB answers kept so the same data is never asked for twice within its lifetime (ADR-0004). It
// implements anidb-udp-client's cache interface on node:sqlite, in the Cache directory or in memory, writing as it
// goes.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { AnidbCacheImplType } from "anidb-udp-client";

const DAY = 24 * 60 * 60_000;

/**
 * How long an answer is kept, by the command its key starts with; any other command's for 7 days, and MyList's never.
 * `NOTFOUND:<key>` marks an answer AniDB said does not exist, which the library itself does not keep.
 */
const LIFETIMES: Record<string, number> = { FILE: 30 * DAY, NOTFOUND: DAY, MYLIST: 0 };
const DEFAULT_LIFETIME = 7 * DAY;

const lifetime = (key: string) => LIFETIMES[key.split(":", 1)[0] ?? ""] ?? DEFAULT_LIFETIME;

/** The Cache's file in a Cache directory. */
export const CACHE_FILE = "anidb-cache.sqlite";

type Cachable = Parameters<AnidbCacheImplType["set"]>[1];

export class Cache implements AnidbCacheImplType {
  readonly #db: DatabaseSync;
  readonly #now: () => number;
  readonly #get: StatementSync;
  readonly #delete: StatementSync;
  readonly #set: StatementSync;
  #open = true;

  /** A Cache in `dir`, created if missing, or in memory without one. */
  constructor(dir: string | undefined, now: () => number = Date.now) {
    if (dir !== undefined) mkdirSync(dir, { recursive: true });
    this.#db = new DatabaseSync(dir === undefined ? ":memory:" : join(dir, CACHE_FILE));
    // Another Host process may share the directory: let it read while one writes, and wait out its writes.
    this.#db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000");
    this.#db.exec(
      "CREATE TABLE IF NOT EXISTS answers (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL)",
    );
    this.#now = now;
    this.#db.prepare("DELETE FROM answers WHERE expires <= ?").run(now());
    this.#get = this.#db.prepare("SELECT value, expires FROM answers WHERE key = ?");
    this.#delete = this.#db.prepare("DELETE FROM answers WHERE key = ?");
    // Widening an answer with more fields keeps it only as long as the answer it widened.
    this.#set = this.#db.prepare(
      `INSERT INTO answers (key, value, expires) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value,
         expires = CASE WHEN answers.expires > ? THEN answers.expires ELSE excluded.expires END`,
    );
  }

  async get<T extends Cachable>(key: string): Promise<T | undefined> {
    if (!this.#open) return undefined;
    const row = this.#get.get(key) as { value: string; expires: number } | undefined;
    if (row === undefined) return undefined;
    if (row.expires <= this.#now()) {
      this.#delete.run(key);
      return undefined;
    }
    return JSON.parse(row.value) as T;
  }

  async set(key: string, value: Cachable) {
    const keep = lifetime(key);
    if (!this.#open || keep === 0 || value === undefined) return;
    const now = this.#now();
    this.#set.run(key, JSON.stringify(value), now + keep, now);
  }

  /** Closes the Cache: from then on it answers nothing and keeps nothing. */
  close() {
    if (!this.#open) return;
    this.#open = false;
    this.#db.close();
  }
}
