// Where the focus goes once a command or a key has acted (./act.ts):
// with nothing left to stand on, the canvas, a frame later, unless a key
// pressed in that frame has put the focus somewhere of its own.
// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { focusBlock, placeFocus } from "./act.ts";

const frame = () => new Promise((done) => setTimeout(done, 40));

afterEach(() => {
  document.body.replaceChildren();
});

function page() {
  const canvas = document.createElement("div");
  canvas.className = "canvas";
  canvas.tabIndex = -1;
  const block = document.createElement("div");
  block.dataset.blockId = "b";
  block.tabIndex = 0;
  canvas.append(block);
  const search = document.createElement("input");
  search.type = "search";
  document.body.append(canvas, search);
  return { canvas, block, search };
}

test("with nothing left to stand on, the canvas takes the focus a frame later", async () => {
  const { canvas, block } = page();
  block.focus();
  placeFocus(null, "canvas");
  expect(document.activeElement).toBe(block);
  await frame();
  expect(document.activeElement).toBe(canvas);
  // The block gone meanwhile, the focus on the page's body: the canvas too.
  document.body.replaceChildren();
  const again = page();
  again.block.focus();
  placeFocus(null, "canvas");
  again.block.remove();
  await frame();
  expect(document.activeElement).toBe(again.canvas);
});

test("a focus that went somewhere of its own within that frame is left there", async () => {
  const { block, search } = page();
  block.focus();
  placeFocus(null, "canvas");
  // A key pressed before the frame: + opened a picker, its search focused.
  search.focus();
  await frame();
  expect(document.activeElement).toBe(search);
});

test("a focus an earlier request of the editor's own put somewhere in that frame gives way to the later one", async () => {
  const { canvas, block } = page();
  const next = document.createElement("div");
  next.dataset.blockId = "n";
  next.tabIndex = 0;
  canvas.append(next);
  block.focus();
  // The next block chosen, its focus a frame away, then Esc before that frame.
  focusBlock("n");
  placeFocus(null, "canvas");
  await frame();
  expect(document.activeElement).toBe(canvas);
});
