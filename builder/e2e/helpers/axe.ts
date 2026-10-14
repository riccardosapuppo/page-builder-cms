// axe in Chromium (@axe-core/playwright): every rule axe runs by default,
// on the whole page or a part of it. A finding of serious or critical
// impact fails the test that asks; the others are given back as lines, for
// the test to show, not hide. The page's fades are let end first (the
// selected block's toolbar comes in over 140 ms): axe reads the colours an
// element has when it runs, and a key half faded in reads as faint, on a
// machine slow enough to run axe within the fade.
import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

export interface AxeReport {
  // "rule (impact): help, at: target; target".
  serious: string[];
  other: string[];
  // How many rules axe ran and passed, so a report of nothing is shown to
  // come from a run that looked.
  passes: number;
}

export async function axe(page: Page, options: { include?: string; exclude?: readonly string[] } = {}): Promise<AxeReport> {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)))
    .map((animation) => animation.finished.catch(() => undefined))));
  let builder = new AxeBuilder({ page });
  if (options.include) builder = builder.include(options.include);
  for (const excluded of options.exclude ?? []) builder = builder.exclude(excluded);
  const result = await builder.analyze();
  const line = (v: (typeof result.violations)[number]) => `${v.id} (${v.impact}): ${v.help}, at: ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join("; ")}${v.nodes.length > 4 ? ` and ${v.nodes.length - 4} more` : ""}`;
  return {
    serious: result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map(line),
    other: result.violations.filter((v) => v.impact !== "serious" && v.impact !== "critical").map(line),
    passes: result.passes.length,
  };
}
