// Whether npm start opens the editor in the browser, and how.
//
// It opens it, as every project with a screen should, except when asked
// not to (--no-open, NO_OPEN), in CI, and when the output is not a terminal:
// a program reading npm start's output is not a person looking at a
// screen, and a browser opened from CI either does nothing or hangs the job.
//
// The decision and the command are plain functions, so the tests check
// them without opening anything; START_OPEN_DRY_RUN=1 makes a real run
// print the command instead of running it. No test and no check of this
// repository opens a window.
import { spawn } from "node:child_process";

export interface Decision {
  open: boolean;
  // Why not, or "" when it opens.
  reason: string;
}

// "1", "true", "yes": set. "", "0", "false": not set.
function set(value: string | undefined): boolean {
  return value !== undefined && !/^(|0|false|no)$/i.test(value.trim());
}

export function decideOpen(input: { argv: string[]; env: NodeJS.ProcessEnv; terminal: boolean; smoke: boolean }): Decision {
  if (input.argv.includes("--no-open")) return { open: false, reason: "--no-open was given" };
  if (set(input.env.NO_OPEN)) return { open: false, reason: "NO_OPEN is set" };
  if (set(input.env.CI)) return { open: false, reason: "CI is set" };
  if (input.smoke) return { open: false, reason: "this is a smoke run" };
  if (!input.terminal) return { open: false, reason: "the output is not a terminal" };
  return { open: true, reason: "" };
}

// The command that hands an address to the system's default browser.
// rundll32 on Windows rather than `cmd /c start`, which would read the
// address as cmd syntax.
export function openCommand(platform: NodeJS.Platform, url: string): [string, string[]] {
  if (platform === "win32") return ["rundll32.exe", ["url.dll,FileProtocolHandler", url]];
  if (platform === "darwin") return ["open", [url]];
  return ["xdg-open", [url]];
}

// Opens the address, or with dryRun says what it would have run. Returns
// the line to print either way.
export function openBrowser(url: string, options: { dryRun: boolean; platform?: NodeJS.Platform; launch?: (command: string, args: string[]) => void }): string {
  const [command, args] = openCommand(options.platform ?? process.platform, url);
  const line = `${command} ${args.join(" ")}`;
  if (options.dryRun) return `browser: START_OPEN_DRY_RUN is set, so not run: ${line}`;
  const launch = options.launch ?? ((c: string, a: string[]) => {
    const child = spawn(c, a, { stdio: "ignore", detached: true });
    child.on("error", () => undefined);
    child.unref();
  });
  launch(command, args);
  return `browser: opened ${url} (${line})`;
}
