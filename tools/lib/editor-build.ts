// The editor's production build, written to a folder of the caller's: the
// same `vite build` as `npm run build` in builder/, so the bundle that is
// measured is the one a person would serve, and builder/dist is left
// alone. The build's own check (build/bundle-check.ts) runs as part of it
// and fails it when the bundle holds what it must not.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { builderRoot } from "./commands.ts";
import { CouldNotRun } from "./processes.ts";

export interface Built {
  folder: string;
  // Seconds the build took.
  seconds: number;
  output: string;
}

// `readable` leaves the code unminified, with the names of its functions
// as written: a profile of a run can then say which functions the time went
// to. It is the same code otherwise, and it is never what is weighed.
export function buildEditor(folder: string, options: { readable?: boolean } = {}): Built {
  const vite = join(builderRoot, "node_modules", "vite", "bin", "vite.js");
  const started = performance.now();
  const flags = options.readable ? ["--minify", "false"] : [];
  const ran = spawnSync(process.execPath, [vite, "build", "--outDir", folder, "--emptyOutDir", "--logLevel", "info", ...flags], {
    cwd: builderRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  const output = (ran.stdout ?? "") + (ran.stderr ?? "");
  if (ran.error) throw new CouldNotRun(`the editor could not be built: ${ran.error.message}`);
  if (ran.status !== 0) throw new Error(`the editor's build failed (exit ${ran.status}):\n${output.split(/\r?\n/).slice(-30).join("\n")}`);
  return { folder, seconds: (performance.now() - started) / 1000, output };
}
