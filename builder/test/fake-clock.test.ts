import { describe, expect, test } from "vitest";
import { FakeClock } from "./fake-clock.ts";

describe("the fake clock", () => {
  test("runs the timers that fall due, in the order they fall due, and not the others", async () => {
    const clock = new FakeClock(1_000);
    const ran: string[] = [];
    clock.setTimeout(() => ran.push(`b at ${clock.now()}`), 200);
    clock.setTimeout(() => ran.push(`a at ${clock.now()}`), 100);
    const cleared = clock.setTimeout(() => ran.push("cleared"), 150);
    clock.setTimeout(() => ran.push("late"), 301);
    clock.clearTimeout(cleared);
    await clock.advance(300);
    expect(ran).toEqual(["a at 1100", "b at 1200"]);
    expect(clock.now()).toBe(1_300);
    expect(clock.pending).toBe(1);
  });

  test("lets a promise a timer starts settle before the next timer runs", async () => {
    const clock = new FakeClock();
    const ran: string[] = [];
    clock.setTimeout(() => {
      void Promise.resolve().then(() => Promise.resolve()).then(() => {
        ran.push("chain");
        // A timer set from inside the chain, due within the same advance.
        clock.setTimeout(() => ran.push(`nested at ${clock.now()}`), 10);
      });
    }, 10);
    clock.setTimeout(() => ran.push("second"), 15);
    await clock.advance(50);
    expect(ran).toEqual(["chain", "second", "nested at 20"]);
  });
});
