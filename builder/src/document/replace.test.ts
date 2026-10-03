// @vitest-environment node
// The page given way to another one (a reload after a conflict), on random
// pairs of valid pages (../../test/document-arbitraries.ts), which number
// their blocks the same way and so share ids: applied, it gives the other
// page byte for byte, its title and description included, an absent
// description absent; undone, the first page byte for byte; redone, the
// other again. The same page twice is no change. Seeded, as
// ./property.test.ts is.
import fc from "fast-check";
import { expect, test } from "vitest";
import { pageDocument, runSettings } from "../../test/document-arbitraries.ts";
import { invertCommand, makeReplacePage } from "./commands.ts";
import { applyCommand } from "./reducer.ts";

test("a page replaced by another gives the other byte for byte, and undone gives the first back", () => {
  let replaced = 0;
  fc.assert(fc.property(pageDocument, pageDocument, (first, second) => {
    const made = makeReplacePage(first, second, "Reloaded the page saved in another tab");
    if (JSON.stringify(first) === JSON.stringify(second)) {
      expect(made.ok).toBe(false);
      return;
    }
    if (!made.ok) throw new Error(made.error.message);
    expect(made.command).toMatchObject({ kind: "page", label: "Reloaded the page saved in another tab", subject: null });
    const applied = applyCommand(first, made.command, { root: true });
    if (!applied.ok) throw new Error(applied.error.message);
    expect(JSON.stringify(applied.document)).toBe(JSON.stringify(second));
    expect(applied.focus).toBeNull();
    const undone = applyCommand(applied.document, invertCommand(made.command), { root: true });
    if (!undone.ok) throw new Error(undone.error.message);
    expect(JSON.stringify(undone.document)).toBe(JSON.stringify(first));
    const redone = applyCommand(undone.document, made.command);
    if (!redone.ok) throw new Error(redone.error.message);
    expect(JSON.stringify(redone.document)).toBe(JSON.stringify(second));
    replaced += 1;
  }), runSettings(200));
  // The pairs were mostly different pages, each replaced.
  expect(replaced).toBeGreaterThan(150);
});

test("the same page twice is no change, and a page against itself refused", () => {
  fc.assert(fc.property(pageDocument, (doc) => {
    const made = makeReplacePage(doc, structuredClone(doc), "Reloaded");
    expect(made).toMatchObject({ ok: false, error: { reason: "nothing" } });
  }), runSettings(50));
});
