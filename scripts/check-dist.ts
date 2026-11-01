// Checks what `pnpm build` wrote is a Plugin folder a Host can install and load: JavaScript only, no link (the app's
// installer refuses one), an entry the package's own name resolves to, with the Plugin's shape, every Worker module it
// names present with a default export class, and each dependency loaded from the folder's own node_modules.
import { lstat, readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLUGIN_FOLDER } from "./plugin-folder.ts";

const problems: string[] = [];

for (const file of await readdir(PLUGIN_FOLDER, { recursive: true })) {
  if ((await lstat(join(PLUGIN_FOLDER, file))).isSymbolicLink())
    problems.push(`A link in the Plugin folder: ${file}`);
  if (!file.startsWith("node_modules") && /\.[cm]?ts$/.test(file) && !file.endsWith(".d.ts"))
    problems.push(`TypeScript in the Plugin folder: ${file}`);
}

const { default: plugin } = await import("fyflow-plugin-anidb");
if (typeof plugin?.id !== "string" || typeof plugin.base !== "string")
  problems.push("The entry is not a Plugin");
else if (!fileURLToPath(plugin.base).startsWith(PLUGIN_FOLDER))
  problems.push(`The entry is not in the Plugin folder: ${plugin.base}`);
for (const [key, worker] of Object.entries<{ url: string }>(plugin?.workers ?? {})) {
  const url = new URL(worker.url, plugin.base);
  if (!url.pathname.endsWith(".js")) problems.push(`Worker ${key} is not JavaScript: ${worker.url}`);
  const module = await import(url.href).catch((error: Error) => ({ error }));
  if ("error" in module) problems.push(`Worker ${key} does not load: ${module.error.message}`);
  else if (typeof module.default !== "function") problems.push(`Worker ${key} has no default export class`);
}

const fromFolder = createRequire(join(PLUGIN_FOLDER, "plugin.js"));
const { dependencies = {} } = JSON.parse(await readFile(join(PLUGIN_FOLDER, "package.json"), "utf8"));
for (const name of Object.keys(dependencies)) {
  const resolved = fromFolder.resolve(name);
  if (!resolved.startsWith(join(PLUGIN_FOLDER, "node_modules")))
    problems.push(`${name} resolves outside the Plugin folder: ${resolved}`);
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(
  `${PLUGIN_FOLDER} is a loadable Plugin folder (${Object.keys(plugin.workers ?? {}).length} Worker modules)`,
);
