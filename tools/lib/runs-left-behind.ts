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
// and before it makes its folder it deletes every folder an earlier run of
// the same tool on the same port left there, one of its own name included:
// a run of that tool on that port still going would hold the port, and
// each tool stops before this when the port is taken.
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

// The folder of a run of `tool` on `port`, by process `pid`.
export const runName = (tool: string, port: number, pid: number = process.pid): string => `${tool}-${port}-${pid}`;

// Deletes from `tmp` (cms/tmp) every folder a run of `tool` on `port`
// left, and says each; returns their names.
export function clearRunsLeftBehind(tmp: string, tool: string, port: number, say: (line: string) => void = console.log): string[] {
  if (!existsSync(tmp)) return [];
  const left = readdirSync(tmp).filter((name) => new RegExp(`^${tool}-${port}-[0-9]+$`).test(name));
  for (const name of left) {
    rmSync(join(tmp, name), { recursive: true, force: true });
    say(`deleted what an earlier run left: cms/tmp/${name}`);
  }
  return left;
}
