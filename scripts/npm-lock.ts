// Writes package-lock.json, the npm lockfile kept beside pnpm-lock.yaml: `pnpm build` derives from it the lockfile in
// the Plugin folder, which `fyflow-plugin pack` turns into the npm-shrinkwrap.json a Host installs from. npm cannot run
// in this folder (pnpm's node_modules confuses it), so it resolves in a temporary copy of package.json and the
// current lockfile, which keeps the versions it already has. `pnpm build` fails when the two lockfiles disagree on a
// dependency's version; run this after changing a dependency with pnpm.
import { execSync } from "node:child_process";
import { copyFile, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const work = await mkdtemp(join(tmpdir(), "anidb-npm-lock-"));
try {
  for (const file of ["package.json", ".npmrc", "package-lock.json"]) {
    const exists = await stat(join(root, file)).then(
      () => true,
      () => false,
    );
    if (exists) await copyFile(join(root, file), join(work, file));
  }
  execSync("npm install --package-lock-only --ignore-scripts --no-audit --no-fund", {
    cwd: work,
    stdio: "inherit",
  });
  await copyFile(join(work, "package-lock.json"), join(root, "package-lock.json"));
  console.log(`Wrote ${join(root, "package-lock.json")}`);
} finally {
  await rm(work, { recursive: true, force: true });
}
