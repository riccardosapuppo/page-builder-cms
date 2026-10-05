// What the README's "Adding a widget" says about the form widget's commit,
// held to the repository: the commit it links exists, is in this history,
// and has the subject, the file counts and the new widget folder the text
// gives; that widget is in the registry; and every file the widgets
// README names for adding a widget exists. A README whose hash, counts or
// files have drifted from the repository, or from which the link has gone,
// is found here and not by a reader who follows it.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { section } from "./readme-commands.ts";

export interface Repo {
  // Runs git in the repository: its exit status and what it printed.
  git(args: readonly string[]): { status: number; stdout: string };
  // A file or folder of the repository, by its path from the root.
  exists(path: string): boolean;
  read(path: string): string;
}

export function repoAt(root: string): Repo {
  return {
    git: (args) => {
      const ran = spawnSync("git", [...args], { cwd: root, encoding: "utf8" });
      return { status: ran.status ?? 1, stdout: ran.stdout ?? "" };
    },
    exists: (path) => existsSync(join(root, path)),
    read: (path) => readFileSync(join(root, path), "utf8"),
  };
}

const flat = (text: string): string => text.replace(/\s+/g, " ");

// What the README's section says: the link to the commit (its short hash,
// its title, the full hash in the address), the command that lists its
// files, and the counts.
export interface Claims {
  short: string;
  title: string;
  full: string;
  command: string | null;
  total: number | null;
  corpus: number | null;
  others: number | null;
}

export function claimsIn(text: string): Claims | null {
  const link = /\[`([0-9a-f]{7,40})`, "([^"]+)"\]\(https:\/\/github\.com\/[^)\s]+\/commit\/([0-9a-f]{40})\)/.exec(flat(text));
  if (!link) return null;
  const counts = /lists its (\d+) files: (\d+) are the schema's corpus written again, and the other (\d+) are/.exec(flat(text));
  return {
    short: link[1]!,
    title: link[2]!,
    full: link[3]!,
    command: /`git show --stat ([0-9a-f]{7,40})`/.exec(flat(text))?.[1] ?? null,
    total: counts ? Number(counts[1]) : null,
    corpus: counts ? Number(counts[2]) : null,
    others: counts ? Number(counts[3]) : null,
  };
}

// The files a section names, in code spans that look like a file or a
// folder (a "/" in them, or an extension), with <type> read as the widget's
// type. A span that only names an identifier or a command is not one.
export function namedFiles(text: string, type: string): string[] {
  const found = new Set<string>();
  for (const span of text.matchAll(/`([^`]+)`/g)) {
    const name = span[1]!.trim().replaceAll("<type>", type);
    if (name.includes(" ") || name.includes("::") || name.includes("<")) continue;
    if (name.includes("/") || /\.(ts|tsx|json|rb|erb|css|md|yml)$/.test(name)) found.add(name);
  }
  return [...found];
}

// Where a name in the widgets README may be: from the root, from the
// editor's folder, or beside the widgets (this folder), the editor's
// source, or the shared types, the way the README writes them.
const PLACES = ["", "builder/", "builder/src/", "builder/src/widgets/", "builder/src/shared/"];

export function problems(readme: string, widgetsReadme: string, repo: Repo): string[] {
  const out: string[] = [];
  const part = section(readme, "Adding a widget");
  if (part === null) return ['README.md has no section "Adding a widget"'];
  const claims = claimsIn(part);
  if (!claims) return ["the section links no commit as `[`<short hash>`, \"<title>\"](https://github.com/<repository>/commit/<full hash>)`"];

  if (!claims.full.startsWith(claims.short)) out.push(`the link's text ${claims.short} is not the start of the hash in its address, ${claims.full}`);
  if (claims.command === null) out.push("the section gives no command `git show --stat <hash>`");
  else if (!claims.full.startsWith(claims.command)) out.push(`the command shows ${claims.command}, which is not the start of the linked hash ${claims.full}`);
  if (claims.total === null) out.push("the section gives no counts of the commit's files (\"lists its N files: A are the schema's corpus written again, and the other B are\")");

  // The commit, in this checkout: a shallow clone has not got it.
  if (repo.git(["cat-file", "-e", `${claims.full}^{commit}`]).status !== 0) {
    out.push(`the commit ${claims.full} is not in this repository: a shallow clone has not got it (fetch the whole history), or the history was rewritten and the link points nowhere`);
    return out;
  }
  if (repo.git(["merge-base", "--is-ancestor", claims.full, "HEAD"]).status !== 0) out.push(`the commit ${claims.short} is not in the history of HEAD`);
  const subject = repo.git(["log", "-1", "--format=%s", claims.full]).stdout.trim();
  if (subject !== claims.title) out.push(`the commit's subject is "${subject}", not "${claims.title}" as the link says`);

  const files = repo.git(["diff-tree", "--no-commit-id", "--name-only", "-r", claims.full]).stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  const stat = /(\d+) files? changed/.exec(repo.git(["show", "--shortstat", "--format=", claims.full]).stdout)?.[1];
  const corpus = files.filter((file) => file.startsWith("schema/corpus/")).length;
  if (stat === undefined || Number(stat) !== files.length) out.push(`git show --stat says ${stat ?? "no number of"} files changed, and the commit's files are ${files.length}`);
  if (claims.total !== null && files.length !== claims.total) out.push(`the README says the commit lists ${claims.total} files; it lists ${files.length}`);
  if (claims.corpus !== null && corpus !== claims.corpus) out.push(`the README says ${claims.corpus} of them are the schema's corpus; ${corpus} are`);
  if (claims.others !== null && files.length - corpus !== claims.others) out.push(`the README says ${claims.others} are other places; ${files.length - corpus} are`);

  // The widget the commit adds: one folder, and it is in the registry.
  const added = repo.git(["diff-tree", "--no-commit-id", "--name-only", "--diff-filter=A", "-r", claims.full]).stdout.split("\n");
  const folders = added.map((file) => /^builder\/src\/widgets\/([^/]+)\/definition\.ts$/.exec(file.trim())?.[1]).filter((type): type is string => type !== undefined);
  if (folders.length !== 1) {
    out.push(`the commit adds ${folders.length} widget definitions (${folders.join(", ") || "none"}), and the README says the widget was added alone`);
    return out;
  }
  const type = folders[0]!;
  const registry = repo.exists("builder/src/widgets/registry.ts") ? repo.read("builder/src/widgets/registry.ts") : "";
  if (!registry.includes(`from "./${type}/definition.ts"`)) out.push(`builder/src/widgets/registry.ts does not list the ${type} widget that the commit added`);

  // Every file the widgets README names for adding a widget.
  const places = section(widgetsReadme, "Adding a widget");
  if (places === null) out.push('builder/src/widgets/README.md has no section "Adding a widget"');
  else {
    for (const name of namedFiles(places, type)) {
      if (!PLACES.some((place) => repo.exists(`${place}${name.replace(/\/$/, "")}`))) out.push(`builder/src/widgets/README.md names ${name}, which does not exist`);
    }
  }

  // The README's link to that section.
  const target = /\]\((builder\/src\/widgets\/README\.md)#([a-z0-9-]+)\)/.exec(flat(part));
  if (!target) out.push("the section does not link builder/src/widgets/README.md#<heading>");
  else if (!repo.exists(target[1]!)) out.push(`${target[1]} does not exist`);
  else if (!repo.read(target[1]!).split(/\r?\n/).some((line) => line.startsWith("## ") && line.slice(3).trim().toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-") === target[2])) {
    out.push(`${target[1]} has no heading for #${target[2]}`);
  }
  return out;
}
