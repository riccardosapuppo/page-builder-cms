// A block's style on each device, as the published page shows it, and the
// style settings' way back to the desktop's value: the device's key taken out,
// never the desktop's value written in its place. Held on random styles of
// every block of a page, with that very fault planted to see the check
// fail.
// @vitest-environment node
import fc from "fast-check";
import { expect, test } from "vitest";
import { invertCommand, makeSetStyle, type StyleUpdates } from "../document/commands.ts";
import { applyCommand } from "../document/reducer.ts";
import { allBlocks, locate, replaceAtPath } from "../document/tree.ts";
import { STYLE_KEYS_BY_TYPE, STYLE_TOKENS, type PageDocument, type StyleTokens } from "../shared/document.ts";
import { validateDocument } from "../shared/validate.ts";
import { page } from "../../test/document-page.ts";
import { backToDesktop, deviceOf, overriddenOn, shownValue, type OverrideDevice } from "./device-style.ts";

test("a tablet and a phone each show their own value, else the base's; a phone never the tablet's", () => {
  const style = { base: { spaceInside: "m", align: "left" }, tablet: { spaceInside: "l", align: "center" }, phone: { align: "right" } };
  expect(shownValue(style, "base", "spaceInside")).toBe("m");
  expect(shownValue(style, "tablet", "spaceInside")).toBe("l");
  // The phone has no space of its own: the base's, not the tablet's L.
  expect(shownValue(style, "phone", "spaceInside")).toBe("m");
  expect(shownValue(style, "phone", "align")).toBe("right");
  expect(shownValue(style, "tablet", "background")).toBeNull();
  // A value the schema does not allow is not shown, as the page ignores it.
  expect(shownValue({ base: { align: "justify" } }, "tablet", "align")).toBeNull();
  expect(deviceOf("desktop")).toBe("base");
  expect(deviceOf("phone")).toBe("phone");
});

test("the devices a block has values of its own on", () => {
  expect(overriddenOn({ base: { align: "left" } })).toEqual([]);
  expect(overriddenOn({ base: {}, phone: { visibility: "hidden" } })).toEqual(["phone"]);
  expect(overriddenOn({ base: {}, phone: { align: "left" }, tablet: { spaceInside: "l" } })).toEqual(["tablet", "phone"]);
  expect(overriddenOn({ base: {}, tablet: { align: "sideways" } })).toEqual([]);
});

// ------------------------------------------------- back to the desktop

type Back = (key: keyof StyleTokens, style: unknown) => StyleUpdates;
type Case = { pick: number; device: OverrideDevice; key: number; fromOwn: boolean; parts: Record<"base" | "tablet" | "phone", Array<[number, number]>>; next: number };

const BLOCKS = [...allBlocks(page())].map((found) => found.block.id);
const pair = fc.tuple(fc.nat(30), fc.nat(30));
const caseOf = fc.record({
  pick: fc.nat(BLOCKS.length - 1),
  device: fc.constantFrom<OverrideDevice>("tablet", "phone"),
  key: fc.nat(30),
  fromOwn: fc.boolean(),
  parts: fc.record({ base: fc.array(pair, { maxLength: 4 }), tablet: fc.array(pair, { maxLength: 3 }), phone: fc.array(pair, { maxLength: 3 }) }),
  next: fc.nat(30),
});

// The page with the picked block given a style of the case's making, from
// the keys and tokens its type takes; a device left with nothing is absent.
function pageOf(c: Case): { doc: PageDocument; id: string; key: keyof StyleTokens } {
  let doc = page();
  const id = BLOCKS[c.pick]!;
  const found = locate(doc, id)!;
  const keys = STYLE_KEYS_BY_TYPE[found.block.type] as readonly (keyof StyleTokens)[];
  const part = (pairs: Array<[number, number]>) => Object.fromEntries(pairs.map(([k, v]) => {
    const key = keys[k % keys.length]!;
    const tokens = STYLE_TOKENS[key] as readonly string[];
    return [key, tokens[v % tokens.length]!];
  }));
  const style: Record<string, unknown> = { base: part(c.parts.base) };
  for (const device of ["tablet", "phone"] as const) {
    const own = part(c.parts[device]);
    if (Object.keys(own).length > 0) style[device] = own;
  }
  doc = replaceAtPath(doc, found.path, (block) => ({ ...block, style }));
  const checked = validateDocument(doc);
  if (!checked.valid) throw new Error(`the case's page is not valid: ${JSON.stringify(checked.errors.slice(0, 2))}`);
  // Half the cases take back a key the device has, the others any key the
  // type takes, which the device may not have.
  const own = Object.keys((style[c.device] ?? {}) as object) as Array<keyof StyleTokens>;
  const key = c.fromOwn && own.length > 0 ? own[c.key % own.length]! : keys[c.key % keys.length]!;
  return { doc: checked.document, id, key };
}

const styleOf = (doc: PageDocument, id: string) => locate(doc, id)!.block.style as unknown as Record<string, Record<string, string> | undefined>;

// What "back to desktop" must do, said as the first promise it breaks, or
// null when it keeps them all. `taken` counts the cases with a value to
// take back, so a run that never met one cannot pass for a run that held.
const tally = { taken: 0 };
function broken(back: Back, c: Case): string | null {
  const { doc, id, key } = pageOf(c);
  const before = styleOf(doc, id);
  const had = Object.hasOwn(before[c.device] ?? {}, key);
  const made = makeSetStyle(doc, id, c.device, back(key, before));
  if (!had) {
    // Nothing to take back: nothing is written.
    const applied = made.ok ? applyCommand(doc, made.command) : null;
    if (applied?.ok && JSON.stringify(applied.document) !== JSON.stringify(doc)) return `${key} on ${c.device} had no value of its own, and one was written`;
    return null;
  }
  tally.taken += 1;
  if (!made.ok) return `taking ${key} on ${c.device} back to the desktop was refused: ${made.error.message}`;
  const applied = applyCommand(doc, made.command);
  if (!applied.ok) return `taking ${key} back was refused by the page: ${applied.error.message}`;
  const after = styleOf(applied.document, id);
  if (Object.hasOwn(after[c.device] ?? {}, key)) return `${key} is still written on ${c.device}: ${JSON.stringify(after[c.device])}`;
  if (Object.keys(before[c.device] ?? {}).length === 1 && Object.hasOwn(after, c.device)) return `the ${c.device} part was left behind empty`;
  if (shownValue(after, c.device, key) !== shownValue(after, "base", key)) return `${c.device} does not show the desktop's ${key}`;
  const other = c.device === "tablet" ? "phone" : "tablet";
  if (JSON.stringify(after.base) !== JSON.stringify(before.base) || JSON.stringify(after[other]) !== JSON.stringify(before[other])) return "another device's values changed";
  // From then on the device follows the desktop: a new desktop value is
  // the device's too.
  const tokens = STYLE_TOKENS[key] as readonly string[];
  const next = tokens[c.next % tokens.length]!;
  const moved = makeSetStyle(applied.document, id, "base", { [key]: next });
  if (moved.ok) {
    const later = applyCommand(applied.document, moved.command);
    if (later.ok && shownValue(styleOf(later.document, id), c.device, key) !== next) return `${c.device} kept its own ${key} when the desktop's changed to ${next}`;
  }
  // And undone, the override is back as it was, byte for byte.
  const undone = applyCommand(applied.document, invertCommand(made.command));
  if (!undone.ok || JSON.stringify(undone.document) !== JSON.stringify(doc)) return "undoing it did not give back the same page";
  return null;
}

const holds = (back: Back) => fc.property(caseOf, (c) => {
  const problem = broken(back, c);
  if (problem) throw new Error(problem);
});

test("back to the desktop takes the device's key out, and the device follows the desktop from then on", () => {
  tally.taken = 0;
  fc.assert(holds((key) => backToDesktop(key)), { seed: 20261003, numRuns: 400 });
  expect(tally.taken).toBeGreaterThan(150);
  console.log(`back to desktop: 400 cases, ${tally.taken} with a value of the device's own to take back`);
});

test("the check fails on a way back that writes the desktop's value on the device", () => {
  // Looks the same today: the device shows the desktop's value. It stops
  // following the desktop at the desktop's next change.
  const planted: Back = (key, style) => {
    const base = (style as { base: Record<string, string> }).base[key];
    return base === undefined ? backToDesktop(key) : { [key]: base } as StyleUpdates;
  };
  const details = fc.check(holds(planted), { seed: 20261003, numRuns: 400 });
  expect(details.failed).toBe(true);
  expect(String((details.errorInstance as Error).message)).toMatch(/is still written on (tablet|phone)|had no value of its own, and one was written/);
});
