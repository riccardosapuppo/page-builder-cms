// @vitest-environment node
// The commands, held to their promises on random pages and random editing
// sessions (../../test/document-arbitraries.ts): every command the reducer
// accepts gives a page the schema and the application rules accept; its
// inverse gives back the same page, byte for byte, with every removed key
// absent again; redoing it gives the same page with the same ids; a
// refused command changes nothing; and a whole session undone through the
// store gives back the first page, and redone, the last.
//
// Seeded: a failure prints the seed and the path that replays it, as
// DOC_PROPERTY_SEED=<seed> DOC_PROPERTY_PATH=<path> npm test -- src/document/property.test.ts
import fc from "fast-check";
import { expect, test } from "vitest";
import { newTally, runSettings, sessionProperty, type Implementation } from "../../test/document-arbitraries.ts";
import * as clipboard from "./clipboard.ts";
import * as commands from "./commands.ts";
import * as reducer from "./reducer.ts";
import * as tree from "./tree.ts";
import * as store from "../store/editor-store.ts";

const real: Implementation = { commands, reducer, clipboard, tree, store };

// 300 sessions of up to 25 commands: about 10 s on a busy machine.
test("random sessions keep every promise of the commands", { timeout: 180_000 }, () => {
  const tally = newTally();
  fc.assert(sessionProperty(real, tally), runSettings(300));

  // The run must have tried every kind of command, applied each, and been
  // refused for the reasons the structure gives (a widget on the page, a
  // fifth column, a section without columns): a run that applied nothing
  // or refused nothing would pass while testing little.
  const kinds = ["insert", "delete", "move", "duplicate", "paste", "props", "style", "columnWidths", "columns", "page", "items"];
  for (const kind of kinds) expect(tally.applied[kind] ?? 0, `${kind} applied`).toBeGreaterThan(0);
  for (const reason of ["nesting", "full", "empty"]) expect(tally.refused[reason] ?? 0, `refused for ${reason}`).toBeGreaterThan(0);
  const applied = Object.values(tally.applied).reduce((a, b) => a + b, 0);
  expect(applied / tally.commands).toBeGreaterThan(0.5);
  console.log(`property: ${tally.commands} commands, ${applied} applied ${JSON.stringify(tally.applied)}, refused ${JSON.stringify(tally.refused)}`);
});
