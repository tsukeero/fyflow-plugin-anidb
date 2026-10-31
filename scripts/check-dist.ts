// Checks what `pnpm build` wrote is what npm will ship and a Host can load: JavaScript only, an entry the package's
// own name resolves to, with the Plugin's shape, and every Worker module it names present with a default export class.
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const problems: string[] = [];

const files = await readdir(dist, { recursive: true });
for (const file of files)
  if (/\.[cm]?ts$/.test(file) && !file.endsWith(".d.ts")) problems.push(`TypeScript in dist: ${file}`);

const { default: plugin } = await import("fyflow-plugin-anidb");
if (typeof plugin?.id !== "string" || typeof plugin.base !== "string")
  problems.push("The entry is not a Plugin");
for (const [key, worker] of Object.entries<{ url: string }>(plugin?.workers ?? {})) {
  const url = new URL(worker.url, plugin.base);
  if (!url.pathname.endsWith(".js")) problems.push(`Worker ${key} is not JavaScript: ${worker.url}`);
  const module = await import(url.href).catch((error: Error) => ({ error }));
  if ("error" in module) problems.push(`Worker ${key} does not load: ${module.error.message}`);
  else if (typeof module.default !== "function") problems.push(`Worker ${key} has no default export class`);
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`dist is a loadable Plugin (${Object.keys(plugin.workers ?? {}).length} Worker modules)`);
