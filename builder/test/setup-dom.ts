// Runs before every unit test file. In Node it does nothing. Under jsdom it
// adds the one browser API jsdom lacks that the editor's libraries need:
// ResizeObserver, which @dnd-kit/dom reads as soon as it is imported. The
// stub observes nothing, as jsdom lays nothing out; anything that depends on
// sizes is tested in a real browser (e2e/). And it unmounts what Testing
// Library rendered after each test, since the tests do not run with
// Vitest's globals, where it would do so by itself.
import { afterEach } from "vitest";

if (typeof window !== "undefined") {
  if (!("ResizeObserver" in window)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    Object.defineProperty(window, "ResizeObserver", { value: ResizeObserverStub, writable: true, configurable: true });
    Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverStub, writable: true, configurable: true });
  }
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
}
