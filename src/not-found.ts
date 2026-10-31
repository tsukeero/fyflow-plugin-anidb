// Not found is a result, never a failed Task (ADR-0003). Lookups remember it for a day so AniDB is not asked again;
// MyList, never cached, does not.
import { AnidbError, RESPONSE_CODE } from "anidb-udp-client";
import type { Cache } from "./cache.ts";

/** AniDB's answers that what was asked for does not exist. */
const NOT_FOUND = new Set<number>([
  RESPONSE_CODE.NO_SUCH_FILE,
  RESPONSE_CODE.NO_SUCH_ENTRY,
  RESPONSE_CODE.NO_SUCH_MYLIST_FILE,
  RESPONSE_CODE.NO_SUCH_MYLIST_ENTRY,
  RESPONSE_CODE.NO_SUCH_ANIME,
  RESPONSE_CODE.NO_SUCH_EPISODE,
  RESPONSE_CODE.NO_SUCH_GROUP,
]);

/** Whether `error` is AniDB saying what was asked for does not exist. */
export const isNotFound = (error: unknown): error is AnidbError =>
  error instanceof AnidbError && NOT_FOUND.has(error.code);

/** What `ask` answers, or undefined when AniDB said, within the last day, there is no such `key`. */
export async function unlessNotFound<T>(
  cache: Cache,
  key: string,
  ask: () => Promise<T>,
): Promise<T | undefined> {
  const remembered = `NOTFOUND:${key}`;
  if ((await cache.get(remembered)) !== undefined) return undefined;
  try {
    return await ask();
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await cache.set(remembered, 1);
    return undefined;
  }
}
