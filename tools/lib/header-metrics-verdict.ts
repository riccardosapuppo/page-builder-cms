// The verdict of `node tools/header-metrics.ts --check`, as the last line of
// its output gives it to the programs that act on it (the production check's
// header, tools/lib/header-checks.ts): whether this machine draws the
// header's letters as schema/header-metrics.json counts them. Its sentences
// are for people, and may change; this line is for programs, and the tool
// writes it with the function that reads it here.
//
// - "file": the file is what this machine draws (exit 0);
// - "face": the face's letters, the spacing and the folds are, but this
//   machine draws the scripts named in `others` with other fonts than the
//   file was measured with, so their widths could not be compared (exit 2);
// - "neither": the file is not what this machine draws (exit 1): stale,
//   edited, or its sum narrower than a word drawn whole; `others` still
//   names the scripts drawn here with other fonts, none where this machine's
//   fonts are those the file was measured with.
export type Verdict = "file" | "face" | "neither";

const PREFIX = "header-metrics verdict: ";
const EXIT: Record<Verdict, number> = { file: 0, face: 2, neither: 1 };

export function verdictLine(verdict: Verdict, others: readonly string[]): string {
  return `${PREFIX}${JSON.stringify({ verdict, others })}`;
}

export interface FontsHere {
  // "unknown" when the tool gave no verdict that holds together: it failed
  // before the end, or the line is missing, malformed, at odds with the
  // exit code, or names a script the file does not hold.
  verdict: Verdict | "unknown";
  // The scripts this machine draws with other fonts than the file was
  // measured with; every script of the file when the verdict is unknown.
  others: string[];
  // What to show a person: the tool's sentence, or its last line.
  line: string;
}

export function readVerdict(code: number | null, output: string, scriptNames: readonly string[]): FontsHere {
  const lines = output.split(/\r?\n/).filter((l) => l.trim() !== "");
  const sentence = lines.find((l) => l.startsWith("header-metrics.json")) ?? lines.find((l) => /\bError\b/.test(l)) ?? lines.filter((l) => !l.startsWith(PREFIX)).slice(-1)[0] ?? "";
  const unknown = (why: string): FontsHere => ({ verdict: "unknown", others: [...scriptNames], line: `${sentence ? `${sentence} ` : ""}(${why}, exit ${code})` });
  const said = lines.filter((l) => l.startsWith(PREFIX)).slice(-1)[0];
  if (said === undefined) return unknown("no verdict line");
  let parsed: unknown;
  try {
    parsed = JSON.parse(said.slice(PREFIX.length));
  } catch {
    return unknown("a verdict line that is not JSON");
  }
  const { verdict, others } = (parsed ?? {}) as { verdict?: unknown; others?: unknown };
  if (typeof verdict !== "string" || !Object.hasOwn(EXIT, verdict)) return unknown("a verdict the tool does not give");
  if (EXIT[verdict as Verdict] !== code) return unknown(`the verdict "${verdict}" with another exit code`);
  if (!Array.isArray(others) || !others.every((name) => typeof name === "string" && scriptNames.includes(name))) return unknown("the scripts drawn with other fonts not given as scripts the file holds");
  if ((verdict === "face" && others.length === 0) || (verdict === "file" && others.length > 0)) return unknown(`the verdict "${verdict}" with ${others.length} script(s) drawn with other fonts`);
  return { verdict: verdict as Verdict, others: others as string[], line: sentence };
}
