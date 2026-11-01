// The Circuit breaker: at the first sign of a ban, the Session stops talking to AniDB until the block lifts, and every
// AniDB Task fails at once (ADR-0003). The block is kept in the Plugin's data directory, so a restart does not resume.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AnidbError, RESPONSE_CODE } from "anidb-udp-client";

const MINUTE = 60_000;
const FIRST_BLOCK_MS = 30 * MINUTE;
const LONGEST_BLOCK_MS = 24 * 60 * MINUTE;
/** How long after a block lifts, with no trip, the trips before it are forgotten. */
const CLEAN_MS = 24 * 60 * MINUTE;

export const BLOCK_FILE = "anidb-block.json";

/** AniDB's answers that say the client or its user is banned, or must stop. */
const BANS = new Set<number>([
  RESPONSE_CODE.BANNED,
  RESPONSE_CODE.CLIENT_VERSION_OUTDATED,
  RESPONSE_CODE.CLIENT_BANNED,
]);

/** A request AniDB never answered: anidb-udp-client gives a lost reply as an unknown error saying so. */
const isTimeout = (error: unknown) =>
  error instanceof AnidbError &&
  (error.code === RESPONSE_CODE.CONNECTION_TIMEOUT ||
    (error.code === RESPONSE_CODE.UNKNOWN_API_ERROR && error.message === "Timeout"));

type Block = { until: number; trips: number };

const readKept = (dataDir: string): Block | undefined => {
  try {
    const { until, trips } = JSON.parse(readFileSync(join(dataDir, BLOCK_FILE), "utf8"));
    if (typeof until === "number" && typeof trips === "number") return { until, trips };
  } catch {}
  return undefined;
};

export class CircuitBreaker {
  readonly #now: () => number;
  readonly #timeoutsToTrip: number;
  #block: Block = { until: 0, trips: 0 };
  #timeouts = 0;
  /** The Plugin's data directory, once a request or status names it: its kept block has been read, and it keeps new ones. */
  #dir: string | undefined;

  constructor(now: () => number, timeoutsToTrip: number) {
    this.#now = now;
    this.#timeoutsToTrip = timeoutsToTrip;
  }

  /** Throws while blocked, after taking in any block kept in `dataDir`. */
  check(dataDir: string | undefined) {
    this.#takeIn(dataDir);
    const block = this.block();
    if (block !== undefined) throw block;
  }

  /** When the block lifts, while it lasts, after taking in any block kept in `dataDir`. */
  blockedUntil(dataDir: string | undefined): number | undefined {
    this.#takeIn(dataDir);
    return this.#lasts() ? this.#block.until : undefined;
  }

  #takeIn(dataDir: string | undefined) {
    if (dataDir === undefined || this.#dir !== undefined) return;
    this.#dir = dataDir;
    const kept = readKept(dataDir);
    if (kept !== undefined && kept.until > this.#block.until) this.#block = kept;
  }

  /** The block, while it lasts. */
  block(): Error | undefined {
    return this.#lasts() ? this.#blocked() : undefined;
  }

  #lasts() {
    return this.#now() < this.#block.until;
  }

  /** AniDB answered a request, so the run of timeouts is over. */
  answered() {
    this.#timeouts = 0;
  }

  /** Takes in a failed request: the block it trips, if it trips one. */
  failed(error: unknown, dataDir: string | undefined): Error | undefined {
    if (!(error instanceof AnidbError)) return undefined;
    if (isTimeout(error)) {
      if (++this.#timeouts < this.#timeoutsToTrip) return undefined;
    } else if (!BANS.has(error.code)) {
      this.#timeouts = 0;
      return undefined;
    }
    this.#timeouts = 0;
    this.#trip(dataDir);
    return this.#blocked(error);
  }

  #trip(dataDir: string | undefined) {
    const now = this.#now();
    const trips = now - this.#block.until > CLEAN_MS ? 1 : this.#block.trips + 1;
    const until = now + Math.min(FIRST_BLOCK_MS * 2 ** (trips - 1), LONGEST_BLOCK_MS);
    this.#block = { until, trips };
    console.warn(`fyflow-plugin-anidb: ${this.#blocked().message}`);
    this.#takeIn(dataDir);
    const dir = this.#dir;
    // Kept in the data directory, replaced atomically, so a restart is still blocked.
    if (dir === undefined) return;
    try {
      mkdirSync(dir, { recursive: true });
      const file = join(dir, BLOCK_FILE);
      writeFileSync(`${file}.tmp`, JSON.stringify(this.#block));
      renameSync(`${file}.tmp`, file);
    } catch (error) {
      console.warn(`fyflow-plugin-anidb: cannot keep the block in ${dir}: ${(error as Error).message}`);
    }
  }

  #blocked(cause?: AnidbError) {
    const until = new Date(this.#block.until).toISOString();
    const after = cause === undefined ? "" : `, after ${cause.code} ${cause.label}`;
    return new Error(`AniDB is blocked until ${until}${after}: no AniDB Task runs until then`);
  }
}
