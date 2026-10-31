// A fake AniDB UDP API for tests: a local `node:dgram` socket answering from a script, recording every request it
// receives. anidb-udp-client always sends to api.anidb.net:9000, so while a fake is running, sends to that address are
// redirected to it (unless it is started for another process to reach). No test ever reaches the real AniDB.
import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import dgram from "node:dgram";
import { redirectAniDB, type UdpAddress } from "./anidb-address.ts";

/** A request as the fake received it, decrypted, with its parameters decoded. */
export interface ReceivedRequest {
  command: string;
  params: Record<string, string>;
  /** When it arrived, by `Date.now()`. */
  at: number;
}

/**
 * Answers one command: the reply after the tag, such as `"230 ANIME\n1|Cowboy Bebop"`, or undefined to send none, as
 * when a packet is lost.
 */
export type Handler = (params: Record<string, string>) => string | undefined;

export interface FakeAniDBOptions {
  /** Replies by command, over the defaults for ENCRYPT, AUTH, PING and LOGOUT. */
  handlers?: Record<string, Handler>;
  /** The account's UDP API key: with one, ENCRYPT is accepted and the session is encrypted. */
  udpApiKey?: string;
  /** Redirect this process's sends to AniDB to the fake (the default); false when another process reaches it. */
  redirect?: boolean;
}

export interface FakeAniDB {
  received: ReceivedRequest[];
  /** The commands received, in order. */
  commands(): string[];
  address: UdpAddress;
  close(): Promise<void>;
}

let running = false;

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
  return { command, params, at: Date.now() };
}

const aes = (key: Buffer, input: Buffer, mode: "encrypt" | "decrypt") => {
  const cipher =
    mode === "encrypt"
      ? createCipheriv("aes-128-ecb", key, null)
      : createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(input), cipher.final()]);
};

export async function startFakeAniDB(options: FakeAniDBOptions = {}): Promise<FakeAniDB> {
  if (running) throw new Error("A fake AniDB is already running");
  running = true;
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
    const answer = handler ? handler(request.params) : "598 UNKNOWN COMMAND";
    if (answer === undefined) return;
    const reply = Buffer.from(`${request.params.tag} ${answer}`);
    // ENCRYPT's own reply is plain; everything after it is encrypted.
    socket.send(key ? aes(key, reply, "encrypt") : reply, from.port, from.address);
    if (request.command === "ENCRYPT" && options.udpApiKey)
      key = createHash("md5")
        .update(options.udpApiKey + salt)
        .digest();
    if (request.command === "LOGOUT") key = undefined;
  });

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(0, "127.0.0.1", resolve);
    });
  } catch (error) {
    running = false;
    throw error;
  }
  const { port } = socket.address();
  if (options.redirect !== false) redirectAniDB({ host: "127.0.0.1", port });

  return {
    received,
    commands: () => received.map((r) => r.command),
    address: { host: "127.0.0.1", port },
    close: () =>
      new Promise<void>((resolve) => {
        redirectAniDB(undefined);
        running = false;
        socket.close(() => resolve());
      }),
  };
}
