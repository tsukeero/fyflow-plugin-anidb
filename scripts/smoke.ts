// `npm run smoke`: before a release, prove the built Plugin folder works in a real Host. Builds it, copies it whole into
// a temporary Plugin directory as the app's installer does, with the SDK beside it as a server Host has it, starts a
// Host from ../fyflow-app on it (Node 26, then Deno) with a Profile pointing at a fake AniDB, and runs a Flow hash →
// identify → MyList add. Local only: fyflow-app is not on npm, so this is not part of `npm run check` or CI.
import { type ChildProcess, execSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FAKE_ANIDB_ENV } from "../test/anidb-address.ts";
import { startFakeAniDB } from "../test/fake-anidb.ts";
import { PLUGIN_FOLDER } from "./plugin-folder.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP = resolve(ROOT, "..", "fyflow-app");
const CLI = join(APP, "packages", "server", "src", "cli.ts");
/** Redirects the Host's sends to the fake AniDB: test code, never part of the package. */
const PRELOAD = join(ROOT, "test", "smoke-preload.ts");
const OPEN = new Set(["running", "cancelling"]);

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Runs a package manager (a `.cmd` on Windows, so through the shell), each argument quoted. */
const run = (command: string, args: string[], cwd: string) =>
  execSync([command, ...args.map((arg) => `"${arg}"`)].join(" "), { cwd, encoding: "utf8" });

/** Builds the Plugin folder, and copies it into a new Plugin directory with the SDK beside it. */
function pluginDirectory(work: string): string {
  run("npm", ["run", "build"], ROOT);
  const sdk = JSON.parse(
    readFileSync(join(ROOT, "node_modules", "fyflow-plugin-sdk", "package.json"), "utf8"),
  );
  const pluginDir = join(work, "plugins");
  mkdirSync(pluginDir);
  cpSync(PLUGIN_FOLDER, join(pluginDir, "anidb"), { recursive: true });
  run(
    "npm",
    ["install", "--no-audit", "--no-fund", "--prefer-offline", `fyflow-plugin-sdk@${sdk.version}`],
    pluginDir,
  );
  return pluginDir;
}

const hostDataDir = (work: string, runtime: string) => join(work, `data-${runtime}`);

/** Starts a Host from ../fyflow-app, resolving with its URL once it serves. */
function startHost(runtime: "node" | "deno", work: string, pluginDir: string, fake: string) {
  const preload = pathToFileURL(PRELOAD).href;
  const dataDir = hostDataDir(work, runtime);
  const args = ["--port", "0", "--data-dir", dataDir, "--plugin-dir", pluginDir, "--no-auto-resume"];
  const env: NodeJS.ProcessEnv = { ...process.env, [FAKE_ANIDB_ENV]: fake };
  delete env.INIT_CWD;
  const child: ChildProcess =
    runtime === "node"
      ? spawn(process.execPath, ["--import", preload, CLI, ...args], { cwd: work, env })
      : // No shell: killing one would leave the Host running.
        spawn("deno", ["run", "-A", "--preload", preload, CLI, ...args], { cwd: work, env });
  let output = "";
  const url = new Promise<string>((resolveUrl, reject) => {
    const timer = setTimeout(() => reject(new Error(`${runtime} Host did not start:\n${output}`)), 30_000);
    const read = (chunk: Buffer) => {
      output += chunk;
      const match = output.match(/running at (http:\/\/[^/\s]+)\//);
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolveUrl(match[1]);
      }
    };
    child.stdout?.on("data", read);
    child.stderr?.on("data", read);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${runtime} Host exited (${code}):\n${output}`));
    });
  });
  return { child, url, output: () => output };
}

async function api(base: string, method: string, path: string, body?: unknown) {
  const response = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  check(response.ok, `${method} ${path}: ${response.status} ${text}`);
  return text === "" ? undefined : JSON.parse(text);
}

const flow = {
  flowId: "anidb-smoke",
  version: 1,
  entry: "hash",
  nodes: [
    { id: "hash", kind: "task", type: "AniDBHashFile", edges: [{ to: "identify" }] },
    { id: "identify", kind: "task", type: "AniDBIdentifyFile", edges: [{ to: "add" }] },
    // Identification keeps the hash and size: MyList add takes the file by them.
    { id: "add", kind: "task", type: "AniDBMyListAdd", settings: { viewed: true }, edges: [{ to: "done" }] },
    { id: "done", kind: "end", outcome: "completed" },
  ],
};

async function smoke(runtime: "node" | "deno", work: string, pluginDir: string) {
  const root = join(work, `media-${runtime}`);
  mkdirSync(root);
  const file = join(root, "bebop-01.mkv");
  writeFileSync(file, Buffer.alloc(1000, 7));
  const anidb = await startFakeAniDB({
    redirect: false,
    handlers: {
      FILE: (params) =>
        params.size === "1000"
          ? "220 FILE\n312498|1|10|7|9|a1b2c3d4|AAC|H264/AVC|1920x1080|Cowboy Bebop|Cowboy Bebop|01|Asteroid Blues|GRP"
          : "320 NO SUCH FILE",
      MYLISTADD: () => "210 MYLIST ENTRY ADDED\n9001",
    },
  });
  const host = startHost(runtime, work, pluginDir, `${anidb.address.host}:${anidb.address.port}`);
  try {
    const base = await host.url;

    const { plugins, skipped } = await api(base, "GET", "/api/plugins");
    const plugin = plugins.find((p: { id: string }) => p.id === "fyflow-ext.anidb");
    check(plugin !== undefined, `the Host did not load the Plugin: ${JSON.stringify(skipped)}`);
    check(plugin.warnings.length === 0, `the Plugin has warnings: ${JSON.stringify(plugin.warnings)}`);
    for (const name of ["AniDBHashFile", "AniDBIdentifyFile", "AniDBMyListAdd"])
      check(JSON.stringify(plugin.nodeTypes).includes(name), `the Plugin has no ${name}`);
    check(plugin.hasStatus === true, "the Host shows no status for the Plugin");

    await api(base, "PUT", "/api/profiles/default/sections/fyflow-ext.anidb", {
      values: {
        username: "smoke",
        password: "smoke-secret",
        roots: [root],
      },
    });
    const profile = JSON.stringify(await api(base, "GET", "/api/profiles/default"));
    check(!profile.includes("smoke-secret"), "the Host shows the AniDB password");
    await api(base, "POST", "/api/plugins/reload");

    const { id } = await api(base, "POST", "/api/flows/import", flow);
    const started = await api(base, "POST", `/api/flows/${id}/run`, { input: { path: file } });
    let detail = started.run;
    const deadline = Date.now() + 90_000;
    while (OPEN.has(detail.status) && Date.now() < deadline) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      detail = await api(base, "GET", `/api/runs/${started.run.id}`);
    }
    const { tasks } = await api(base, "GET", `/api/runs/${started.run.id}/tasks?limit=500`);
    check(detail.status === "completed", `the Run ended ${detail.status}: ${JSON.stringify(tasks, null, 2)}`);
    const add = tasks.find((task: { nodeId: string }) => task.nodeId === "add");
    check(
      add?.result?.added === true && add.result.lid === 9001,
      `MyList add gave ${JSON.stringify(add?.result)}`,
    );
    check(add.result.path === file, "the file's path did not reach the end of the Flow");

    const commands = anidb.commands();
    check(
      JSON.stringify(commands) === JSON.stringify(["AUTH", "FILE", "MYLISTADD"]),
      `the fake AniDB received ${commands.join(", ")}`,
    );
    check(anidb.received[1]?.params.size === "1000", "identify asked for another size");

    // The Cache is in the data directory the Host gives the Plugin, and its status shows the Session.
    const cache = join(hostDataDir(work, runtime), "plugin-data", "fyflow-ext.anidb", "anidb-cache.sqlite");
    check(existsSync(cache), `the Cache is not in the Host's data directory: no ${cache}`);
    const { statuses } = await api(base, "GET", "/api/plugins/status");
    const status = statuses.find((s: { id: string }) => s.id === "fyflow-ext.anidb")?.status;
    check(
      status?.level === "ok" && status.summary === "Logged in to AniDB as smoke · 0 queued",
      `the Plugin's status is ${JSON.stringify(status)}`,
    );
    check(!JSON.stringify(statuses).includes("smoke-secret"), "the Plugin's status shows the password");
    console.log(`${runtime}: hash → identify → MyList add completed; AniDB received ${commands.join(", ")}`);
  } finally {
    // A hard kill on Windows, whatever the signal; fyflow-app's own smoke accepts the same.
    if (host.child.exitCode === null) {
      const exited = new Promise((resolveExit) => host.child.once("exit", resolveExit));
      host.child.kill();
      await exited;
    }
    await anidb.close();
  }
}

check(existsSync(CLI), `No fyflow-app at ${APP}: clone it beside this repo to run the smoke`);
check(
  existsSync(join(APP, "node_modules")),
  `fyflow-app at ${APP} is not installed: run \`pnpm install\` there first`,
);
const work = mkdtempSync(join(tmpdir(), "anidb-smoke-"));
try {
  const pluginDir = pluginDirectory(work);
  await smoke("node", work, pluginDir);
  await smoke("deno", work, pluginDir);
  console.log("smoke ok");
} finally {
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 5 });
  } catch (error) {
    console.warn(`smoke: could not remove ${work}: ${(error as Error).message}`);
  }
}
