// Where the header's links fold (./header-fit.ts), on the cases the
// server's own test holds HeaderFit to (cms/test/models/header_fit_test.rb),
// from the example site's header as config/site.yml gives it. That the two
// add up the same on any header is header-fit.rails.test.ts's to show,
// through Ruby.
// @vitest-environment node
import { expect, test } from "vitest";
import { readSiteTheme } from "../../build/site-theme.ts";
import { headerFold, rubySum, runWidth, widthNeeded, type HeaderWords } from "./header-fit.ts";
import metrics from "../../../schema/header-metrics.json";

const theme = readSiteTheme();
const defaults: HeaderWords = { name: theme.name as string, menu: theme.menu as HeaderWords["menu"], action: theme.action as HeaderWords["action"] };
const links = (...labels: string[]) => labels.map((label) => ({ label, href: "/" }));

test("the design's own header fits the bar from 800 up, so it names no fold", () => {
  expect(headerFold(defaults)).toBeNull();
  expect(Math.abs(widthNeeded(defaults) - 761)).toBeLessThanOrEqual(1);
});

test("a fifth link needs a wider bar: each count of links lands on the next width, until no bar holds them", () => {
  expect(headerFold({ ...defaults, menu: [...defaults.menu, ...links("Contact")] })).toBe("880");
  const folds = [1, 3, 4, 5, 6, 7, 8, 9].map((n) => headerFold({ ...defaults, menu: links(...Array.from({ length: n }, () => "Timetable")) }));
  expect(folds).toEqual([null, null, "880", "960", "1040", "1200", "1248", "all"]);
  expect(headerFold({ ...defaults, menu: links(...Array.from({ length: 8 }, () => "W".repeat(24))) })).toBe("all");
});

test("the name and the button count too, and with no links there is nothing to fold", () => {
  const menu = [...defaults.menu, ...links("Contact")];
  expect(headerFold({ ...defaults, menu, name: "The Northfield Swimming Club" })).toBe("1120");
  expect(headerFold({ ...defaults, menu, action: null })).toBeNull();
  expect(headerFold({ ...defaults, menu: [], name: "W".repeat(28) })).toBeNull();
});

test("a letter the face lacks counts wider than any it has, and a combining accent adds nothing to its letter", () => {
  const widest = Math.max(...Object.values(metrics.link.advances));
  expect(metrics.link.otherwise).toBeGreaterThan(widest);
  expect(runWidth(metrics.link, "日本語の案内")).toBeGreaterThan(runWidth(metrics.link, "abcdef"));
  expect(runWidth(metrics.brand, "Café")).toBeCloseTo(runWidth(metrics.brand, "Cafe"), 9);
});

test("a run of floats adds up as Ruby's sum does, compensated, not as a loop of + does", () => {
  // 0.1 + 0.2 + 0.3 is 0.6000000000000001 added in turn; Ruby's
  // [0.1, 0.2, 0.3].sum is 0.6.
  expect([0.1, 0.2, 0.3].reduce((a, b) => a + b, 0)).not.toBe(0.6);
  expect(rubySum([0.1, 0.2, 0.3])).toBe(0.6);
  expect(rubySum([3, 1e100, -1e100])).toBe(3);
  expect(rubySum([])).toBe(0);
});
