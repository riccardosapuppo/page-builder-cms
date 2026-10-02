// The render contract can fail: with a fault planted in the React renderer
// (here, the URL policy made to let every link through), the comparison
// with the server's golden fails at the block that shows it, and the safety
// check finds the script address on the React side.
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { repoRoot } from "../../build/paths.ts";
import { compareHtml } from "../../test/html-compare.ts";
import { safetyProblems } from "../../test/render-safety.ts";
import { PageSections } from "./blocks.tsx";
import { contractMedia } from "./media.tsx";

vi.mock("./policy.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./policy.ts")>()),
  linkHref: (value: unknown) => (typeof value === "string" ? value : null),
}));

test("a renderer that lets every link through fails the contract and the safety check", () => {
  const read = (folder: string, name: string) => readFileSync(join(repoRoot, "contract", folder, name), "utf8");
  const html = renderToStaticMarkup(<PageSections document={JSON.parse(read("fixtures", "traps-text.json"))} ctx={{ media: contractMedia }} />);

  const result = compareHtml(read("rendered", "traps-text.html"), html, "traps-text.json");
  expect(result.equal).toBe(false);
  expect(result.message).toMatch(/in block t-heading-link-with-quote/);

  const problems = safetyProblems(html);
  expect(problems).toContain("(page) > section > div > div > div > h3 > a: href is a javascript: address");
  expect(problems.filter((p) => p.includes("javascript:")).length).toBeGreaterThanOrEqual(5);
  expect(problems.some((p) => p.includes("data: address"))).toBe(true);
});
