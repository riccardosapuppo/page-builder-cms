// A plan read as it streams (./plan-stream.ts): the same answer cut into
// pieces anywhere gives the same events in the same order, whatever its
// strings hold (braces, brackets, quotes, escapes, a key's name), and an
// answer that stops halfway is said at its end.
import { expect, test } from "vitest";
import { PlanStream } from "./plan-stream.ts";

const PLAN = {
  title: "Open day {at} [Slack] \"Water\"",
  description: "Swim, then tea: \\ and \n and é.",
  sections: [
    { label: "Hero", anchor: "top", background: "soft", widths: "3:2", columns: [{ align: "left", blocks: [{ kind: "heading", level: 1, text: "sections: [{\"x\"}]", display: true }] }, { align: "center", blocks: [] }] },
    { label: "Join", anchor: "join", background: "none", widths: "equal", columns: [{ align: "left", blocks: [{ kind: "list", ordered: false, items: ["a", "}", "]"] }] }] },
  ],
};
const TEXT = JSON.stringify(PLAN, null, 1);

function read(pieces: string[]) {
  const events: unknown[] = [];
  const stream = new PlanStream({
    head: (key, value) => events.push(["head", key, value]),
    section: (value, index) => events.push(["section", index, value]),
  });
  for (const piece of pieces) stream.push(piece);
  return { events, whole: stream.end() };
}

const EXPECTED = [
  ["head", "title", PLAN.title],
  ["head", "description", PLAN.description],
  ["section", 0, PLAN.sections[0]],
  ["section", 1, PLAN.sections[1]],
];

test("the answer in one piece: the head, then each section, in order", () => {
  const { events, whole } = read([TEXT]);
  expect(events).toEqual(EXPECTED);
  expect(whole).toEqual(PLAN);
});

test("cut one character at a time, or at random, it gives the same events", () => {
  expect(read([...TEXT]).events).toEqual(EXPECTED);
  let seed = 7;
  const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let run = 0; run < 25; run++) {
    const pieces: string[] = [];
    for (let at = 0; at < TEXT.length;) {
      const size = 1 + Math.floor(random() * 40);
      pieces.push(TEXT.slice(at, at + size));
      at += size;
    }
    expect(read(pieces).events).toEqual(EXPECTED);
  }
});

test("a section is handed on as soon as it closes, before the rest has come", () => {
  const events: unknown[] = [];
  const stream = new PlanStream({ head: () => undefined, section: (_value, index) => events.push(index) });
  // Up to the brace that opens the second section.
  const end = TEXT.lastIndexOf("{", TEXT.indexOf("\"label\": \"Join\""));
  stream.push(TEXT.slice(0, end));
  expect(events).toEqual([0]);
  stream.push(TEXT.slice(end));
  expect(events).toEqual([0, 1]);
});

test("keys elsewhere named title or sections, and values that look like them, change nothing", () => {
  const text = JSON.stringify({ title: "sections", description: "title", sections: [{ title: "inner", sections: [{ a: 1 }] }] });
  expect(read([text]).events).toEqual([
    ["head", "title", "sections"],
    ["head", "description", "title"],
    ["section", 0, { title: "inner", sections: [{ a: 1 }] }],
  ]);
});

test("an answer that stops halfway: the sections that closed were handed on, and the end says it is not whole", () => {
  const events: unknown[] = [];
  const stream = new PlanStream({ head: () => undefined, section: (_value, index) => events.push(index) });
  // Up to the bracket that would close the sections.
  stream.push(TEXT.slice(0, TEXT.lastIndexOf("]")));
  expect(events).toEqual([0, 1]);
  expect(() => stream.end()).toThrow();
});
