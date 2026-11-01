// The Plugin's status: the Session snapshot, as the Host shows it on the Plugin's card and gives Agents, so a user or
// an Agent can see whether AniDB is usable even when no Task runs. It never connects, queues or sends, and names no
// secret.
import type { PluginStatus, PluginStatusContext } from "fyflow-plugin-sdk";
import { type SessionSnapshot, session } from "./session.ts";

const summaryOf = ({ state, account, queued, blockedUntil }: SessionSnapshot) => {
  switch (state) {
    case "blocked":
      return `AniDB is blocked after a ban: no AniDB Task runs until ${blockedUntil}`;
    case "connecting":
      return `Logging in to AniDB as ${account} · ${queued} queued`;
    case "connected":
      return `Logged in to AniDB as ${account} · ${queued} queued`;
    case "disconnected":
      return "Not logged in: the next AniDB Task logs in";
  }
};

const LEVELS = {
  blocked: "warning",
  connecting: "info",
  connected: "ok",
  disconnected: "ok",
} as const satisfies Record<SessionSnapshot["state"], PluginStatus["level"]>;

/** The Session's status, taking in a block kept in the Plugin's data directory, as after a restart. */
export function status({ dataDir }: PluginStatusContext): PluginStatus {
  const snapshot = session().snapshot(dataDir);
  return {
    level: LEVELS[snapshot.state],
    summary: summaryOf(snapshot),
    details: [
      ...(snapshot.account === null ? [] : [{ label: "Account", value: snapshot.account }]),
      { label: "Queued", value: String(snapshot.queued) },
      { label: "Next send", value: snapshot.nextSendAt },
      ...(snapshot.blockedUntil === null ? [] : [{ label: "Blocked until", value: snapshot.blockedUntil }]),
    ],
  };
}
