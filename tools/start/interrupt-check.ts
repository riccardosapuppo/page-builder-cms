// node tools/start/interrupt-check.ts   (npm run check:start-interrupt)
//
// The two ways npm start must stop, on the real thing: node
// tools/start.cjs --no-open, on its own ports (CMS_PORT and BUILDER_PORT,
// 3900 and 4900 by default), with the CMS and the editor running.
// 1. Ctrl+C, as a terminal sends it. On Linux and macOS a terminal signals
//    its foreground process group, so start runs in a group of its own and
//    the group gets SIGINT (its two servers have groups of their own, as in
//    a terminal). On Windows a console's Ctrl+C reaches every process on
//    that console, which Node cannot send: ctrl-c.ps1 does, from a console
//    of its own that it checks holds nothing else.
// 2. A child that dies: the editor's server is killed from outside, and
//    start must stop the CMS and exit 1, naming the editor.
// After each: start's own lines, its exit code, both ports closed, and both
// servers' processes gone.
//
// Exits 0 when every check passes, 1 when one fails, 2 when it could not
// run (a port taken before it began).
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { repoRoot, windows } from "../lib/commands.ts";
import { describeListeners, listeners } from "../lib/processes.ts";

const START = join(repoRoot, "tools", "start.cjs");
const READY_SECONDS = 300;
const STOP_SECONDS = 60;
const cmsPort = Number(process.env.CMS_PORT || 3900);
const editorPort = Number(process.env.BUILDER_PORT || 4900);

const results: Array<[boolean, string]> = [];
function check(ok: boolean, what: string, detail = ""): void {
  results.push([ok, what]);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail && !ok ? `: ${detail}` : ""}`);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function held(): string {
  return [cmsPort, editorPort].map((port) => describeListeners(listeners(port))).filter(Boolean).join("; ");
}

// Collects a child's lines and resolves when one matches, or the child
// ends, or the time is up.
class Lines {
  all: string[] = [];
  private waiters: Array<{ match: (line: string) => boolean; done: (line: string | null) => void }> = [];
  ended: Promise<number | null>;

  constructor(child: ChildProcess) {
    let rest = "";
    const take = (chunk: string) => {
      const lines = (rest + chunk).split(/\r?\n/);
      rest = lines.pop() ?? "";
      for (const line of lines) this.push(line);
    };
    child.stdout?.setEncoding("utf8").on("data", take);
    child.stderr?.setEncoding("utf8").on("data", take);
    this.ended = new Promise((done) => child.on("close", (code) => {
      if (rest) this.push(rest);
      for (const waiter of this.waiters.splice(0)) waiter.done(null);
      done(code);
    }));
  }

  private push(line: string): void {
    this.all.push(line);
    console.log(`  | ${line}`);
    for (const waiter of [...this.waiters]) {
      if (waiter.match(line)) {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.done(line);
      }
    }
  }

  waitFor(match: (line: string) => boolean, seconds: number): Promise<string | null> {
    const found = this.all.find(match);
    if (found) return Promise.resolve(found);
    return new Promise((done) => {
      const waiter = { match, done: (line: string | null) => { clearTimeout(timer); done(line); } };
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        done(null);
      }, seconds * 1000);
      this.waiters.push(waiter);
    });
  }
}

function within<T>(promise: Promise<T>, seconds: number): Promise<T | "timeout"> {
  return Promise.race([promise, new Promise<"timeout">((done) => setTimeout(() => done("timeout"), seconds * 1000).unref())]);
}

function pidsFrom(lines: string[]): { cms: number; editor: number } | null {
  const line = lines.find((l) => l.startsWith("[start] processes:"));
  const match = line && /cms (\d+), editor (\d+)/.exec(line);
  return match ? { cms: Number(match[1]), editor: Number(match[2]) } : null;
}

function killTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  if (windows) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
  else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

// What both scenarios check once start has ended.
async function afterStop(name: string, pids: { cms: number; editor: number } | null): Promise<void> {
  // The ports and the processes, a moment after start's own exit.
  await new Promise((done) => setTimeout(done, 1000));
  const still = held();
  check(still === "", `${name}: nothing listens on ${cmsPort} or ${editorPort}`, still);
  if (pids) check(!alive(pids.cms) && !alive(pids.editor), `${name}: the CMS's process ${pids.cms} and the editor's ${pids.editor} are gone`,
    `still running: ${[pids.cms, pids.editor].filter(alive).join(", ")}`);
}

async function ctrlC(): Promise<void> {
  const name = "Ctrl+C";
  const env = { ...process.env, CMS_PORT: String(cmsPort), BUILDER_PORT: String(editorPort), NO_OPEN: "1" };
  const child = windows
    ? spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", join(repoRoot, "tools", "start", "ctrl-c.ps1"),
      "-Node", process.execPath, "-Start", START, "-ReadySeconds", String(READY_SECONDS), "-StopSeconds", String(STOP_SECONDS)],
      // All three streams piped and no window: Windows gives the helper a
      // console of its own, which is what its Ctrl+C must reach.
      { cwd: repoRoot, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
    : spawn(process.execPath, [START, "--no-open"], { cwd: repoRoot, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const lines = new Lines(child);
  try {
    const ready = await lines.waitFor((l) => l.startsWith("[start] ready:"), READY_SECONDS + 30);
    check(ready !== null, `${name}: start says it is ready`);
    if (!ready) return;
    if (!windows) process.kill(-child.pid!, "SIGINT");
    const ended = await within(lines.ended, STOP_SECONDS + 30);
    const code = windows ? Number(/^HELPER: start exited (-?\d+)$/m.exec(lines.all.join("\n"))?.[1] ?? NaN) : ended;
    check(ended !== "timeout" && code === 0, `${name}: start exits 0`, `exit ${code}, helper ${ended}`);
    check(lines.all.some((l) => l === "[start] stopping: Ctrl+C"), `${name}: start says it stops because of Ctrl+C`);
    check(lines.all.some((l) => l === "[start] stopped: nothing started here is left running"), `${name}: start says nothing it started is left`);
    await afterStop(name, pidsFrom(lines.all));
  } finally {
    killTree(child);
  }
}

async function childDies(): Promise<void> {
  const name = "a child dies";
  const child = spawn(process.execPath, [START, "--no-open"], {
    cwd: repoRoot, env: { ...process.env, CMS_PORT: String(cmsPort), BUILDER_PORT: String(editorPort), NO_OPEN: "1" },
    stdio: ["ignore", "pipe", "pipe"], detached: !windows,
  });
  const lines = new Lines(child);
  try {
    const ready = await lines.waitFor((l) => l.startsWith("[start] ready:"), READY_SECONDS);
    check(ready !== null, `${name}: start says it is ready`);
    const pids = pidsFrom(lines.all);
    if (!ready || !pids) return;
    // From outside, as a crash or a task manager would.
    if (windows) spawnSync("taskkill", ["/PID", String(pids.editor), "/T", "/F"]);
    else process.kill(-pids.editor, "SIGKILL");
    const ended = await within(lines.ended, STOP_SECONDS);
    check(ended === 1, `${name}: start exits 1`, `exit ${ended}`);
    check(lines.all.some((l) => l.startsWith("[start] stopping: the editor stopped by itself")), `${name}: start names the editor as the one that stopped`);
    await afterStop(name, pids);
  } finally {
    killTree(child);
  }
}

const taken = held();
if (taken) {
  console.log(`ports ${cmsPort} and ${editorPort} must be free, and are held by ${taken}: nothing was started`);
  process.exit(2);
}
await ctrlC();
await childDies();
const failed = results.filter(([ok]) => !ok).length;
console.log(failed ? `RESULT: ${failed} of ${results.length} checks failed` : `RESULT: ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
