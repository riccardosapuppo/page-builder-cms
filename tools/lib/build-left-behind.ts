// What tools/check-production.ts and tools/measure-server.ts do before they
// precompile. Each makes a production build in cms/public/assets with
// assets:precompile and removes it with assets:clobber at its end; a run
// stopped before its end (killed, as a long run can be, or its terminal
// closed) never gets there, and leaves its build behind, which development
// would serve in place of the stylesheets being edited. So each run first
// removes a build it finds there, and checks that nothing of it remains:
// the folder is deleted from here, as assets:clobber deletes it (Propshaft's
// clobber removes its output folder, which production does not move), with
// no Rails to boot and no gems needed.
import { existsSync, rmSync } from "node:fs";

export type Check = (ok: boolean, what: string, detail?: string) => void;

export const CLEARED = "no build is left in cms/public/assets before the precompile";

const removeFolder = (folder: string): void => rmSync(folder, { recursive: true, force: true });

// Removes the build in `folder` (cms/public/assets), when there is one,
// with `remove` (a test gives one that fails), and checks that the folder
// is gone; when it is not, throws after the check, so that the run stops
// before it precompiles over that build.
export function clearBuildLeftBehind(folder: string, check: Check, remove: (folder: string) => void = removeFolder): void {
  if (!existsSync(folder)) {
    check(true, CLEARED);
    return;
  }
  let why = "";
  try {
    remove(folder);
  } catch (error) {
    why = `: ${(error as Error).message}`;
  }
  const remains = existsSync(folder);
  check(!remains, CLEARED, remains ? `one was left there, and could not be removed${why}` : "one was left there, and is removed");
  if (remains) {
    throw new Error(`cms/public/assets holds a build left behind, which could not be removed${why}; nothing was precompiled over it (remove it with ruby bin/rails assets:clobber, from cms/)`);
  }
}
