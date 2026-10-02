// What the checks of a change cost on the 500-block page of the render
// contract (contract/fixtures/large-500.json): validating the one parent a
// change touches, against validating the whole page, which the editor does
// only on a drop. Run with `npx vitest run --config build/measure.config.ts`
// from builder/; ../src/document/README.md has the numbers, with the
// machine and its load when they were taken.
//
// Each case runs in batches long enough for the clock (at least 25 ms),
// after a warm-up; the median batch gives the time per call. Beside the
// numbers, how busy the whole machine was during the run, from the
// processors' own counters: a number taken on a busy machine says so.
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import validateSchema from "virtual:block-document-validator";
import { checkContainer, checkRoot } from "../src/document/check.ts";
import { makeInsert } from "../src/document/commands.ts";
import { dragOver, startDrag } from "../src/document/drag.ts";
import { applyCommand } from "../src/document/reducer.ts";
import type { Block, PageDocument } from "../src/shared/document.ts";
import { validateBlockSchema, validateDocument } from "../src/shared/validate.ts";

function busy(): () => number {
  const sample = () => cpus().reduce((acc, cpu) => {
    const t = cpu.times;
    acc.idle += t.idle;
    acc.total += t.user + t.nice + t.sys + t.idle + t.irq;
    return acc;
  }, { idle: 0, total: 0 });
  const start = sample();
  return () => {
    const end = sample();
    return 100 * (1 - (end.idle - start.idle) / (end.total - start.total));
  };
}

function measure(name: string, run: () => unknown): { name: string; median: number; best: number } {
  for (let i = 0; i < 200; i++) run();
  let perBatch = 1;
  for (;;) {
    const t0 = performance.now();
    for (let i = 0; i < perBatch; i++) run();
    if (performance.now() - t0 >= 25) break;
    perBatch *= 2;
  }
  const times: number[] = [];
  for (let batch = 0; batch < 30; batch++) {
    const t0 = performance.now();
    for (let i = 0; i < perBatch; i++) run();
    times.push((performance.now() - t0) / perBatch);
  }
  times.sort((a, b) => a - b);
  return { name, median: times[15] ?? Number.NaN, best: times[0] ?? Number.NaN };
}

const shown = (ms: number): string => (ms < 1 ? `${(ms * 1000).toFixed(1)} µs` : `${ms.toFixed(2)} ms`);

test("the checks of a change on 500 blocks", () => {
  const loaded = validateDocument(JSON.parse(readFileSync(fileURLToPath(new URL("../../contract/fixtures/large-500.json", import.meta.url)), "utf8")));
  if (!loaded.valid) throw new Error("the 500-block fixture is not valid");
  const doc: PageDocument = loaded.document;

  const quote: Block = { id: "measure-quote", type: "quote", props: { text: "One more." }, children: [], style: { base: {} } };
  const columns = doc.sections.flatMap((s) => s.children);
  const big = columns.reduce((a, b) => (b.children.length > a.children.length ? b : a));
  const small = columns.find((c) => c.children.length === 4);
  const four = doc.sections.find((s) => s.children.length === 4);
  const firstOfFour = four?.children[0];
  if (!small || !four || !firstOfFour) throw new Error("unexpected fixture");
  const plus = <T extends Block>(container: T): T => ({ ...container, children: [...container.children, quote] }) as T;
  const sectionCandidate = { ...four, children: [plus(firstOfFour), ...four.children.slice(1)] };
  const widgetsIn = four.children.reduce((n, c) => n + c.children.length, 0) + 1;

  const insert = makeInsert(doc, quote, { parentId: small.id, index: 0 });
  if (!insert.ok) throw new Error(insert.error.message);
  const started = startDrag(doc, { kind: "block", id: big.children[0]?.id ?? "" });
  if (!started.ok) throw new Error(started.error.message);
  let session = dragOver(started.session, { parentId: small.id, index: 0 });
  let index = 0;

  const load = busy();
  const results = [
    measure(`one parent alone: a column of ${small.children.length + 1} widgets`, () => validateBlockSchema(plus(small))),
    measure(`one parent alone: a column of ${big.children.length + 1} widgets`, () => validateBlockSchema(plus(big))),
    measure(`one parent alone: a section of 4 columns, ${widgetsIn} widgets`, () => validateBlockSchema(sectionCandidate)),
    measure("the page as a shell: 25 sections, 60 columns, no widgets", () => checkContainer(doc, null)),
    measure("the whole page, 500 blocks: application rules and schema", () => checkRoot(doc)),
    measure("the whole page, 500 blocks: the schema alone", () => validateSchema(doc)),
    measure("an insert into a column of 4, applied and checked", () => applyCommand(doc, insert.command)),
    measure("the same insert with the whole page validated, as on a drop", () => applyCommand(doc, insert.command, { root: true })),
    measure("a pointer move over a container already judged", () => {
      index = (index + 1) % (small.children.length + 1);
      session = dragOver(session, { parentId: small.id, index });
    }),
  ];
  const cpu = load();

  console.log(`node ${process.version}, ${cpus().length} logical processors (${cpus()[0]?.model.trim() ?? "?"}); machine busy ${cpu.toFixed(0)}% during the run`);
  for (const r of results) console.log(`${r.name}: median ${shown(r.median)}, best ${shown(r.best)}`);
  for (const r of results) expect(Number.isFinite(r.median), r.name).toBe(true);
});
