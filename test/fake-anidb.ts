// A fake AniDB UDP API for tests: a local `node:dgram` socket answering from a script, recording every request it
// receives. anidb-udp-client always sends to api.anidb.net:9000, so while a fake is running, sends to that address are
// redirected to it. No test ever reaches the real AniDB.
import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import dgram from "node:dgram";

const ANIDB = { host: "api.anidb.net", port: 9000 };

/** A request as the fake received it, decrypted, with its parameters decoded. */
export interface ReceivedRequest {
  command: string;
  params: Record<string, string>;
}

/** Answers one command: the reply after the tag, such as `"230 ANIME\n1|Cowboy Bebop"`. */
export type Handler = (params: Record<string, string>) => string;

export interface FakeAniDBOptions {
  /** Replies by command, over the defaults for ENCRYPT, AUTH, PING and LOGOUT. */
  handlers?: Record<string, Handler>;
  /** The account's UDP API key: with one, ENCRYPT is accepted and the session is encrypted. */
  udpApiKey?: string;
}

export interface FakeAniDB {
  received: ReceivedRequest[];
  /** The commands received, in order. */
  commands(): string[];
  close(): Promise<void>;
}

let redirectTo: number | undefined;
const send = dgram.Socket.prototype.send;
// biome-ignore lint/suspicious/noExplicitAny: dgram's `send` has many overloads; this only rewrites the address.
dgram.Socket.prototype.send = function (this: dgram.Socket, ...args: any[]) {
  // The library calls send(buffer, offset, length, port, address).
  if (redirectTo !== undefined && args[3] === ANIDB.port && args[4] === ANIDB.host) {
    args[3] = redirectTo;
    args[4] = "127.0.0.1";
  }
  return Reflect.apply(send, this, args);
};

const decode = (value: string) => value.replaceAll("<br />", "\n").replaceAll("&amp;", "&");

function parse(text: string): ReceivedRequest {
  const space = text.indexOf(" ");
  const command = space === -1 ? text : text.slice(0, space);
  const params: Record<string, string> = {};
  if (space !== -1)
    for (const pair of text.slice(space + 1).split("&")) {
      const eq = pair.indexOf("=");
      params[pair.slice(0, eq)] = decode(pair.slice(eq + 1));
    }
  return { command, params };
}

const aes = (key: Buffer, input: Buffer, mode: "encrypt" | "decrypt") => {
  const cipher =
    mode === "encrypt"
      ? createCipheriv("aes-128-ecb", key, null)
      : createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(input), cipher.final()]);
};

export async function startFakeAniDB(options: FakeAniDBOptions = {}): Promise<FakeAniDB> {
  if (redirectTo !== undefined) throw new Error("A fake AniDB is already running");
  const salt = "fakesalt";
  const handlers: Record<string, Handler> = {
    ENCRYPT: () => (options.udpApiKey ? `209 ${salt} ENCRYPTION ENABLED` : "309 API PASSWORD NOT DEFINED"),
    AUTH: () => "200 fakesession LOGIN ACCEPTED",
    PING: () => "300 PONG",
    LOGOUT: () => "203 LOGGED OUT",
    ...options.handlers,
  };
  const received: ReceivedRequest[] = [];
  let key: Buffer | undefined;
  const socket = dgram.createSocket("udp4");

  socket.on("message", (message, from) => {
    const request = parse(String(key ? aes(key, message, "decrypt") : message));
    received.push(request);
    const handler = handlers[request.command];
    const reply = Buffer.from(
      `${request.params.tag} ${handler ? handler(request.params) : "598 UNKNOWN COMMAND"}`,
    );
    // ENCRYPT's own reply is plain; everything after it is encrypted.
    socket.send(key ? aes(key, reply, "encrypt") : reply, from.port, from.address);
    if (request.command === "ENCRYPT" && options.udpApiKey)
      key = createHash("md5")
        .update(options.udpApiKey + salt)
        .digest();
    if (request.command === "LOGOUT") key = undefined;
  });

  await new Promise<void>((resolve) => socket.bind(0, "127.0.0.1", resolve));
  redirectTo = socket.address().port;

  return {
    received,
    commands: () => received.map((r) => r.command),
    close: () =>
      new Promise<void>((resolve) => {
        redirectTo = undefined;
        socket.close(() => resolve());
      }),
  };
}
