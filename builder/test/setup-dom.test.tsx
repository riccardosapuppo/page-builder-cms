// @vitest-environment jsdom
// The DOM test setup is enough for the editor's libraries: with only the
// ResizeObserver stub of setup-dom.ts, @dnd-kit/react imports and a
// draggable renders under jsdom, and Testing Library unmounts between tests.
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

describe("the jsdom setup", () => {
  test("has ResizeObserver, and nothing else added", () => {
    expect(typeof ResizeObserver).toBe("function");
    // The stub is the only thing the setup adds: jsdom's own globals stay as jsdom has them.
    expect(typeof IntersectionObserver).toBe("undefined");
  });

  test("renders a dnd-kit draggable", async () => {
    const { DragDropProvider, useDraggable } = await import("@dnd-kit/react");
    function Tile() {
      const { ref } = useDraggable({ id: "tile" });
      return <button ref={ref} type="button">Heading</button>;
    }
    render(<DragDropProvider><Tile /></DragDropProvider>);
    expect(screen.getByRole("button", { name: "Heading" })).toBeTruthy();
  });

  test("starts each test with an empty body", () => {
    expect(document.body.children.length).toBe(0);
  });
});
