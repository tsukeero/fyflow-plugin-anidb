// Completes `dist/anidb/`, which `tsc` has compiled `src/` into, as the Plugin folder a Host loads: a package.json of
// its own, the README, the Plugin's dependencies under its own node_modules, copied as files, and a package-lock.json
// for them. It is the folder to pick with "Choose folder…" in the app, which refuses a folder holding a link (pnpm's
// node_modules is made of them), and the folder `fyflow-plugin pack` packs: npm leaves the node_modules out of the
// tarball, and pack turns the package-lock.json into the npm-shrinkwrap.json a Host installs them from. The SDK stays
// out: the Host provides it.
import { cp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export const PLUGIN_FOLDER = join(root, "dist", "anidb");

type Manifest = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [field: string]: unknown;
};

type LockEntry = {
  version?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  dev?: boolean;
  devOptional?: boolean;
  peer?: boolean;
  [field: string]: unknown;
};

type Lock = { lockfileVersion: number; packages: Record<string, LockEntry>; [field: string]: unknown };

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

/** The lock path npm resolves `name` to from the package at `from` (`""` for the root): its own, then each one up. */
function resolveInLock(packages: Lock["packages"], name: string, from: string): string | undefined {
  for (let at = from; ; ) {
    const candidate = `${at === "" ? "" : `${at}/`}node_modules/${name}`;
    if (packages[candidate] !== undefined) return candidate;
    if (at === "") return undefined;
    const parent = at.lastIndexOf("/node_modules/");
    at = parent === -1 ? "" : at.slice(0, parent);
  }
}

/** The lock paths of `names` and everything they need: dependencies, optional ones present, and required peers. */
function lockClosure(packages: Lock["packages"], names: string[]): Set<string> {
  const found = new Set<string>();
  const visit = (name: string, from: string, required: boolean) => {
    const path = resolveInLock(packages, name, from);
    if (path === undefined) {
      if (required)
        throw new Error(`package-lock.json has no ${name} for ${from || "the root"}: run \`pnpm lock:npm\``);
      return;
    }
    if (found.has(path)) return;
    found.add(path);
    const entry = packages[path] as LockEntry;
    for (const dependency of Object.keys(entry.dependencies ?? {})) visit(dependency, path, true);
    for (const dependency of Object.keys(entry.optionalDependencies ?? {})) visit(dependency, path, false);
    for (const peer of Object.keys(entry.peerDependencies ?? {}))
      visit(peer, path, entry.peerDependenciesMeta?.[peer]?.optional !== true);
  };
  for (const name of names) visit(name, "", true);
  return found;
}

/**
 * The Plugin folder's package-lock.json, from the repository's (which `pnpm lock:npm` writes beside pnpm-lock.yaml): the
 * same versions, for the folder's package.json alone. The dependencies and what they need are kept, and the SDK and
 * what it needs as peers, which a Host's `npm ci --omit=peer` requires in the lockfile but does not install; the
 * development tools are left out. It refuses a lockfile that has fallen out of step with package.json, or whose
 * versions are not the ones pnpm installed (`installed`), which are the ones tested and copied into the folder.
 */
async function pluginLock(manifest: Manifest, installed: Map<string, string>): Promise<Lock> {
  const lock: Lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
  const { packages } = lock;
  const rootEntry = packages[""] ?? {};
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
  if (
    !same(rootEntry.dependencies, manifest.dependencies) ||
    !same(rootEntry.peerDependencies, manifest.peerDependencies)
  )
    throw new Error("package-lock.json does not have package.json's dependencies: run `pnpm lock:npm`");
  const dependencies = lockClosure(packages, Object.keys(manifest.dependencies ?? {}));
  const peers = lockClosure(packages, Object.keys(manifest.peerDependencies ?? {}));
  for (const [name, version] of installed) {
    const locked = packages[`node_modules/${name}`]?.version;
    if (locked !== version)
      throw new Error(
        `pnpm installed ${name}@${version}, package-lock.json has ${name}@${locked}: run \`pnpm lock:npm\`, or \`pnpm update ${name}\``,
      );
  }
  const { name, version, license, dependencies: deps, peerDependencies, engines } = manifest;
  const kept: Lock["packages"] = {
    "": Object.fromEntries(
      Object.entries({ name, version, license, dependencies: deps, peerDependencies, engines }).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  };
  for (const path of [...new Set([...dependencies, ...peers])].sort()) {
    const { dev: _d, devOptional: _o, peer: _p, ...entry } = packages[path] as LockEntry;
    kept[path] = dependencies.has(path) ? entry : { ...entry, peer: true };
  }
  return {
    name: manifest.name,
    version: manifest.version,
    lockfileVersion: lock.lockfileVersion,
    requires: true,
    packages: kept,
  };
}

/** Completes the Plugin folder `tsc` compiled into. */
export async function makePluginFolder(to = PLUGIN_FOLDER) {
  if (!(await exists(join(to, "plugin.js"))))
    throw new Error(`No ${join(to, "plugin.js")}: run \`tsc\` first`);
  const {
    devDependencies: _d,
    scripts: _s,
    packageManager: _p,
    private: _private,
    fyflow: _fyflow,
    ...manifest
  } = await readManifest(root);
  // npm packs package.json, the README and the LICENSE besides these; the shrinkwrap only when listed.
  const files = ["*.js", "npm-shrinkwrap.json"];
  await writeFile(
    join(to, "package.json"),
    `${JSON.stringify({ ...manifest, files, exports: { ".": "./plugin.js" } }, null, 2)}\n`,
  );
  await cp(join(root, "README.md"), join(to, "README.md"));
  await cp(join(root, "LICENSE"), join(to, "LICENSE"));
  const copied = await copyDependencies(Object.keys(manifest.dependencies ?? {}), root, to);
  const lock = await pluginLock(manifest, copied);
  await writeFile(join(to, "package-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  return copied;
}

if (import.meta.main) {
  const copied = await makePluginFolder();
  const dependencies = [...copied].map(([name, version]) => `${name}@${version}`).join(", ");
  console.log(`Made the Plugin folder ${PLUGIN_FOLDER} with ${dependencies}`);
}
