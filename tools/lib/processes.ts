// Who listens on a port, and how to stop a server tree, on Windows, Linux
// and macOS. The repository's tools that start a server of their own use
// these, so a check written on one system runs on the others.
import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from "node:child_process";

export interface Listener {
  // The local address, as the system prints it: 127.0.0.1:3902, [::1]:3902.
  address: string;
  // The process id, or "?" when the system does not say (another user's).
  pid: string;
}

const windows = process.platform === "win32";

// Asks the system, not a test bind: on Windows a bind to 127.0.0.1:N
// succeeds while another process listens on 0.0.0.0:N.
// - Windows: netstat -a -n -o; a listening line has a remote address of
//   0.0.0.0:0 or [::]:0 (the state word is in Windows' language).
// - Linux: ss -H -l -t -n -p, one line per listening socket.
// - elsewhere, or with no ss: lsof -n -P -iTCP:<port> -sTCP:LISTEN -F pn.
// Throws when none of them can be run: a check that cannot see listeners
// must not report a free port.
export function listeners(port: number): Listener[] {
  if (windows) return fromNetstat(run("netstat", ["-a", "-n", "-o"]), port);
  if (process.platform === "linux" && has("ss")) return fromSs(run("ss", ["-H", "-l", "-t", "-n", "-p"]), port);
  const result = spawnSync("lsof", ["-n", "-P", `-iTCP:${port}`, "-sTCP:LISTEN", "-F", "pn"], { encoding: "utf8" });
  if (result.error) throw new Error(`cannot tell who listens on ${port}: neither ss nor lsof could be run (${result.error.message})`);
  // lsof exits 1 when nothing listens.
  return fromLsof(result.stdout ?? "", port);
}

// "  TCP    127.0.0.1:3902    0.0.0.0:0    LISTENING    896"
export function fromNetstat(out: string, port: number): Listener[] {
  return out.split(/\r?\n/).map((line) => line.trim().split(/\s+/)).filter((cols) =>
    cols[0] === "TCP" && portOf(cols[1]) === port && /^(0\.0\.0\.0:0|\[::\]:0)$/.test(cols[2] ?? ""),
  ).map((cols) => ({ address: cols[1]!, pid: cols.at(-1) ?? "?" }));
}

// "LISTEN 0 1024 127.0.0.1:3902 0.0.0.0:* users:(("ruby",pid=4242,fd=7))"
export function fromSs(out: string, port: number): Listener[] {
  return out.split(/\r?\n/).map((line) => line.trim().split(/\s+/)).filter((cols) =>
    cols[0] === "LISTEN" && portOf(cols[3]) === port,
  ).map((cols) => ({ address: cols[3]!, pid: /pid=(\d+)/.exec(cols.slice(5).join(" "))?.[1] ?? "?" }));
}

// One "p<pid>" line per process, then its "n<address>" lines.
export function fromLsof(out: string, port: number): Listener[] {
  const found: Listener[] = [];
  let pid = "?";
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith("p")) pid = line.slice(1);
    if (line.startsWith("n") && portOf(line.slice(1)) === port) found.push({ address: line.slice(1), pid });
  }
  return found;
}

function portOf(address: string | undefined): number | undefined {
  const match = /:(\d+)$/.exec(address ?? "");
  return match ? Number(match[1]) : undefined;
}

function has(command: string): boolean {
  return !spawnSync(command, ["--version"], { encoding: "utf8" }).error;
}

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw new Error(`cannot tell who listens: ${command} could not be run (${result.error.message})`);
  return result.stdout ?? "";
}

// Starts a server so that its whole tree can be stopped: on Linux and
// macOS in a process group of its own (detached), which the stop signals
// as a group. Never detached on Windows, where that would open a console
// window; taskkill /T finds the tree there.
export function startTree(command: string, args: string[], options: SpawnOptions): ChildProcess {
  return spawn(command, args, { ...options, detached: !windows });
}

// Stops the tree started by startTree, and waits for the process to be
// gone. Returns what it did, for the log.
export async function stopTree(child: ChildProcess): Promise<string> {
  if (!child.pid) return "nothing to stop";
  if (child.exitCode !== null || child.signalCode !== null) return `process ${child.pid} had already exited`;
  const exited = new Promise<void>((done) => child.once("exit", () => done()));
  const within = (ms: number) => Promise.race([exited.then(() => true), new Promise<boolean>((done) => setTimeout(() => done(false), ms))]);
  if (windows) {
    const kill = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { encoding: "utf8" });
    const gone = await within(10_000);
    return `taskkill /PID ${child.pid} /T /F: exit ${kill.status}${gone ? "" : ", and the process had not exited 10 s later"}`;
  }
  process.kill(-child.pid, "SIGTERM");
  if (await within(10_000)) return `SIGTERM to process group ${child.pid}: stopped`;
  process.kill(-child.pid, "SIGKILL");
  const gone = await within(5_000);
  return `SIGTERM to process group ${child.pid} did not stop it within 10 s; SIGKILL${gone ? ": stopped" : ", and the process had not exited 5 s later"}`;
}
