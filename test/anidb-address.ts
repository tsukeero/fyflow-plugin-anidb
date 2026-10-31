// Where AniDB's UDP API is, for tests only: never part of the Plugin. anidb-udp-client always sends to
// api.anidb.net:9000; a fake AniDB is reached by redirecting those sends, in this process (the tests) or in a smoke's
// Host, through test/smoke-preload.ts.
import dgram from "node:dgram";

const ANIDB = { host: "api.anidb.net", port: 9000 };

/** Names the fake AniDB a smoke's Host reaches, as `127.0.0.1:<port>`. */
export const FAKE_ANIDB_ENV = "FYFLOW_PLUGIN_ANIDB_FAKE_UDP";

export type UdpAddress = { host: string; port: number };

let redirectTo: UdpAddress | undefined;
let patched = false;

/** Sends meant for AniDB go to `address` from now on, or to AniDB again when it is undefined. */
export function redirectAniDB(address: UdpAddress | undefined) {
  redirectTo = address;
  if (patched || address === undefined) return;
  patched = true;
  const send = dgram.Socket.prototype.send;
  // biome-ignore lint/suspicious/noExplicitAny: dgram's `send` has many overloads; this only rewrites the address.
  dgram.Socket.prototype.send = function (this: dgram.Socket, ...args: any[]) {
    // The library calls send(buffer, offset, length, port, address).
    if (redirectTo !== undefined && args[3] === ANIDB.port && args[4] === ANIDB.host) {
      args[3] = redirectTo.port;
      args[4] = redirectTo.host;
    }
    return Reflect.apply(send, this, args);
  };
}
