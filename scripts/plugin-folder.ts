// Completes `dist/anidb/`, which `tsc` has compiled `src/` into, as the Plugin folder a Host loads: a package.json of
// its own, the README, and the Plugin's dependencies under its own node_modules, copied as files. It is the folder to
// pick with "Choose folder…" in the app, whose installer copies a folder whole, runs no package manager, and refuses
// a folder holding a link (pnpm's node_modules is made of them). The SDK stays out: the Host provides it.
import { cp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export const PLUGIN_FOLDER = join(root, "dist", "anidb");

type Manifest = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  [field: string]: unknown;
};

const readManifest = async (dir: string): Promise<Manifest> =>
  JSON.parse(await readFile(join(dir, "package.json"), "utf8"));

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** The folder of package `name` as Node resolves it from `from`: the nearest `node_modules/<name>` up the tree. */
async function packageDir(name: string, from: string): Promise<string> {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (await exists(join(candidate, "package.json"))) return realpath(candidate);
    if (dirname(dir) === dir) throw new Error(`Cannot find ${name} from ${from}: run \`pnpm install\``);
  }
}

/**
 * Copies `names` and everything they depend on, flat, into `to/node_modules`, each followed through pnpm's links to
 * its files. Two versions of one package would need nesting, which none of ours has: that fails instead.
 */
async function copyDependencies(names: string[], from: string, to: string) {
  const copied = new Map<string, string>();
  const copy = async (name: string, requiredFrom: string) => {
    const dir = await packageDir(name, requiredFrom);
    const { version, dependencies = {} } = await readManifest(dir);
    const already = copied.get(name);
    if (already !== undefined) {
      if (already !== version)
        throw new Error(`Two versions of ${name} (${already}, ${version}) cannot sit flat`);
      return;
    }
    copied.set(name, version);
    await cp(dir, join(to, "node_modules", name), {
      recursive: true,
      dereference: true,
      filter: (source) => !source.slice(dir.length).split(/[\\/]/).includes("node_modules"),
    });
    for (const dependency of Object.keys(dependencies)) await copy(dependency, dir);
  };
  for (const name of names) await copy(name, from);
  return copied;
}

/** Completes the Plugin folder `tsc` compiled into. */
export async function makePluginFolder(to = PLUGIN_FOLDER) {
  if (!(await exists(join(to, "plugin.js"))))
    throw new Error(`No ${join(to, "plugin.js")}: run \`tsc\` first`);
  const {
    devDependencies: _d,
    scripts: _s,
    packageManager: _p,
    files: _f,
    ...manifest
  } = await readManifest(root);
  await writeFile(
    join(to, "package.json"),
    `${JSON.stringify({ ...manifest, exports: { ".": "./plugin.js" } }, null, 2)}\n`,
  );
  await cp(join(root, "README.md"), join(to, "README.md"));
  return copyDependencies(Object.keys(manifest.dependencies ?? {}), root, to);
}

if (import.meta.main) {
  const copied = await makePluginFolder();
  const dependencies = [...copied].map(([name, version]) => `${name}@${version}`).join(", ");
  console.log(`Made the Plugin folder ${PLUGIN_FOLDER} with ${dependencies}`);
}
