// Preloaded into the Host `npm run smoke` starts (`node --import`, `deno run --preload`): sends meant for AniDB go to the
// smoke's fake AniDB, named by the environment. Refuses to let the Host start without one, so a smoke never reaches the
// real AniDB.
import process from "node:process";
import { FAKE_ANIDB_ENV, redirectAniDB } from "./anidb-address.ts";

const match = process.env[FAKE_ANIDB_ENV]?.match(/^127\.0\.0\.1:(\d+)$/);
if (match?.[1] === undefined)
  throw new Error(`smoke: set ${FAKE_ANIDB_ENV} to the fake AniDB, 127.0.0.1:<port>`);
redirectAniDB({ host: "127.0.0.1", port: Number(match[1]) });
