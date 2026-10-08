// The commands a section of a README names, and whether each one exists:
// the npm script in package.json, the file the script runs, the
// measurement a name after tools/measure.cjs picks. A README whose command
// has been renamed, or whose section has lost its commands, is found
// here, before a reader runs it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The text under a "## heading", up to the next "## " heading (a fenced
// block is not looked into for headings), or null when there is none.
export function section(markdown: string, heading: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return null;
  let fenced = false;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("```")) fenced = !fenced;
    if (!fenced && line.startsWith("## ")) break;
    body.push(line);
  }
  return body.join("\n");
}

const SETTINGS = /^(?:[A-Z][A-Z0-9_]*=\S+\s+)+/;

// Every command in a text: an inline `code span`, or a line of a fenced
// block, that runs npm (`npm run <script>`, or `npm start`, which is the
// script of that name) or node (after any NAME=value settings). A span that
// only names a file or a variable is not a command. A span may wrap onto
// the next line of its paragraph, as a README's text does, and is read as
// one line.
export function commandsIn(text: string): string[] {
  const candidates: string[] = [];
  let fenced = false;
  let paragraph: string[] = [];
  const endParagraph = () => {
    for (const span of paragraph.join(" ").matchAll(/`([^`]+)`/g)) candidates.push(span[1]!.trim().replace(/\s+/g, " "));
    paragraph = [];
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("```")) {
      endParagraph();
      fenced = !fenced;
      continue;
    }
    if (fenced) candidates.push(line.trim());
    else if (line.trim() === "") endParagraph();
    else paragraph.push(line.trim());
  }
  endParagraph();
  return candidates.filter((c) => /^(?:[A-Z][A-Z0-9_]*=\S+\s+)*(?:npm run \S|npm start(?:\s|$)|node \S)/.test(c));
}

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
// A date as the README writes it: "4 October 2026".
export const DATE = new RegExp(`\\b\\d{1,2} (?:${MONTHS}) 20\\d\\d\\b`);

// The "### " subsections of a section that give numbers (every one but
// those whose title matches `silent`) and lack a command or a date: one
// sentence each.
export function undated(text: string, silent: RegExp): string[] {
  const out: string[] = [];
  for (const part of text.split(/^### /m).slice(1)) {
    const title = part.split("\n")[0]!;
    if (silent.test(title)) continue;
    if (commandsIn(part).length === 0) out.push(`the subsection "${title}" gives no command`);
    if (!DATE.test(part)) out.push(`the subsection "${title}" gives no date`);
  }
  return out;
}

interface Scripts {
  scripts?: Record<string, string>;
}

// What is wrong with the commands, one sentence each; nothing when every
// command exists where it says. `root` is the repository's root.
// - `npm run <script>`: the script is in the package.json of the folder
//   (the root's, or the one `--prefix <folder>` names);
// - what the script runs is followed: another `npm run` the same way, and
//   `node <file>`, whose file must exist, and after tools/measure.cjs the
//   name must pick a tools/measure-<name>.ts that exists too; a script that
//   runs anything else (vite, say) is not followed further;
// - `node <file>`, given directly: the same for the file.
export function problems(commands: readonly string[], root: string): string[] {
  const scriptsOf = (folder: string): Record<string, string> | null => {
    const file = join(root, folder, "package.json");
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Scripts).scripts ?? {} : null;
  };
  const exists = (folder: string, path: string): boolean => existsSync(join(root, folder, path));
  const where = (folder: string): string => (folder === "" ? "package.json" : `${folder}/package.json`);

  // Why a command, run in `folder`, does not exist; null when it does.
  const follow = (command: string, folder: string, depth: number): string | null => {
    // `npm start` is `npm run start`.
    const bare = command.replace(SETTINGS, "").replace(/^npm start(?=\s|$)/, "npm run start");
    const npm = /^npm run (\S+)(?:.*? --prefix (\S+))?/.exec(bare);
    if (npm) {
      const inFolder = npm[2] ? join(folder, npm[2]) : folder;
      const scripts = scriptsOf(inFolder);
      if (scripts === null) return `${where(inFolder)} does not exist`;
      const script = scripts[npm[1]!];
      if (script === undefined) return `${where(inFolder)} has no script "${npm[1]}"`;
      return depth >= 4 ? "its scripts run each other too deep to follow" : follow(script, inFolder, depth + 1);
    }
    const node = /^node (\S+)(?:\s+(\S+))?/.exec(bare);
    if (!node) return depth === 0 ? "it is not a command that can be followed" : null;
    const file = node[1]!;
    // `node --test ...`: an option of node, the script itself exists.
    if (file.startsWith("-")) return null;
    if (!exists(folder, file)) return `${file} does not exist`;
    // tools/measure.cjs <name> runs tools/measure-<name>.ts.
    if (file === "tools/measure.cjs") {
      const name = node[2];
      if (!name || !exists(folder, `tools/measure-${name}.ts`)) return `tools/measure-${name ?? "(no name)"}.ts does not exist`;
    }
    return null;
  };

  return commands.flatMap((command) => {
    const why = follow(command, "", 0);
    return why === null ? [] : [`${command}: ${why}`];
  });
}
