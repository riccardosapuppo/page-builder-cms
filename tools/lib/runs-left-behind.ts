// The folder under cms/tmp that tools/check-production.ts and
// tools/measure-server.ts each make for a run: its three production
// databases, its uploads, its server's logs, deleted at the run's end. A
// run stopped before its end (the publication gate stops measure:server
// after five minutes, as it stops anything that keeps going) never gets
// there and leaves its folder, and Windows gives a process id again: a
// later run named for the same id found that folder, its databases marked
// as production's, and Rails refused to load the schema over them
// (ActiveRecord::ProtectedEnvironmentError), so the run failed at its
// first step. So a run is named for its tool, its port and its process,
// and before it makes its folder it deletes the folders earlier runs of the
// same tool on the same port left there: one of its own name, whatever is
// in it, and those whose process no longer runs. A folder whose process
// runs is another run's, under way, and is left alone: the port is no
// proof, since a run makes its folder before it opens its port, and the
// measurement lets the port go while it starts its server again.
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

// The folder of a run of `tool` on `port`, by process `pid`.
export const runName = (tool: string, port: number, pid: number = process.pid): string => `${tool}-${port}-${pid}`;

// Whether a process runs: signal 0 asks without sending anything; a
// process this user may not signal runs too.
export function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

// Deletes from `tmp` (cms/tmp) every folder a run of `tool` on `port`
// left, its process gone or its name this process's, and says each;
// returns their names.
export function clearRunsLeftBehind(tmp: string, tool: string, port: number, say: (line: string) => void = console.log, alive: (pid: number) => boolean = running): string[] {
  if (!existsSync(tmp)) return [];
  const pattern = new RegExp(`^${tool}-${port}-([0-9]+)$`);
  const left = readdirSync(tmp).filter((name) => {
    const pid = pattern.exec(name)?.[1];
    return pid !== undefined && (Number(pid) === process.pid || !alive(Number(pid)));
  });
  for (const name of left) {
    rmSync(join(tmp, name), { recursive: true, force: true });
    say(`deleted what an earlier run left: cms/tmp/${name}`);
  }
  return left;
}
