// Where the repository's parts are, and how to run npm and Ruby from Node
// on Windows, Linux and macOS alike.
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const cmsRoot = join(repoRoot, "cms");
export const builderRoot = join(repoRoot, "builder");

export const windows = process.platform === "win32";

export interface Ran {
  status: number | null;
  stdout: string;
  stderr: string;
  // Set when the program could not be started at all (not on the PATH).
  error?: Error;
}

// Runs a program to its end and keeps what it printed. Never through a
// shell: arguments reach the program as they are written here.
export function run(command: string, args: string[], options: SpawnSyncOptions = {}): Ran {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
  const ran: Ran = { status: result.status, stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
  if (result.error) ran.error = result.error;
  return ran;
}

// npm as a program to spawn without a shell. On Windows npm is npm.cmd,
// which Node refuses to start without one, so npm's own script is run with
// this Node instead: npm_execpath when npm started this process, otherwise
// the npm that ships beside this Node.
export function npmCommand(): [string, string[]] {
  const fromNpm = process.env.npm_execpath;
  if (fromNpm && /^npm-cli\.(c?js)$/.test(basename(fromNpm)) && existsSync(fromNpm)) return [process.execPath, [fromNpm]];
  const beside = windows
    ? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
    : join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(beside)) return [process.execPath, [beside]];
  return ["npm", []];
}

export function runNpm(args: string[], options: SpawnSyncOptions = {}): Ran {
  const [command, first] = npmCommand();
  return run(command, [...first, ...args], options);
}

// The last lines of a program's output, for a sentence that says why it
// failed.
export function lastLines(text: string, count = 20): string {
  return text.split(/\r?\n/).filter((line) => line.trim() !== "").slice(-count).join("\n");
}
