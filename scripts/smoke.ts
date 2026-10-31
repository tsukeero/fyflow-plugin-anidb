// `pnpm smoke`: before a release, prove the built package works in a real Host. Packs this package, installs it with
// the SDK into a temporary Plugin directory as npm would, starts a Host from ../fyflow-app on it (Node 26, then Deno)
// with a Profile pointing at a fake AniDB, and runs a Flow hash → identify → MyList add. Local only: fyflow-app is not
// on npm, so this is not part of `pnpm check` or CI.
import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FAKE_ANIDB_ENV } from "../test/anidb-address.ts";
import { startFakeAniDB } from "../test/fake-anidb.ts";

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

/** Builds and packs this package, and installs it with the SDK under a new Plugin directory, as npm would. */
function pluginDirectory(work: string): string {
  run("pnpm", ["build"], ROOT);
  const packed = run("pnpm", ["pack", "--pack-destination", work], ROOT).trim().split(/\r?\n/).at(-1) ?? "";
  check(packed.endsWith(".tgz"), `pnpm pack gave no tarball: ${packed}`);
  const sdk = JSON.parse(
    readFileSync(join(ROOT, "node_modules", "fyflow-plugin-sdk", "package.json"), "utf8"),
  );
  const pluginDir = join(work, "plugins");
  mkdirSync(pluginDir);
  run(
    "npm",
    ["install", "--no-audit", "--no-fund", "--prefer-offline", packed, `fyflow-plugin-sdk@${sdk.version}`],
    pluginDir,
  );
  return pluginDir;
}

/** Starts a Host from ../fyflow-app, resolving with its URL once it serves. */
function startHost(runtime: "node" | "deno", work: string, pluginDir: string, fake: string) {
  const preload = pathToFileURL(PRELOAD).href;
  const dataDir = join(work, `data-${runtime}`);
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
    const plugin = plugins.find((p: { id: string }) => p.id === "anidb");
    check(plugin !== undefined, `the Host did not load the Plugin: ${JSON.stringify(skipped)}`);
    check(plugin.warnings.length === 0, `the Plugin has warnings: ${JSON.stringify(plugin.warnings)}`);
    for (const name of ["AniDBHashFile", "AniDBIdentifyFile", "AniDBMyListAdd", "AniDBStatus"])
      check(JSON.stringify(plugin.nodeTypes).includes(name), `the Plugin has no ${name}`);

    await api(base, "PUT", "/api/profiles/default/sections/anidb", {
      values: {
        username: "smoke",
        password: "smoke-secret",
        cacheDir: join(work, `cache-${runtime}`),
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
