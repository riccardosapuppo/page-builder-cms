// A clock the test moves by hand (src/storage/clock.ts). advance(ms) runs
// every timer that falls due within ms, in the order they fall due, and
// lets the promises they start settle before the next one runs, so code on
// this clock behaves as it would in real time, without the waiting.
import type { Clock, ClockTimer } from "../src/storage/clock.ts";

interface Timer {
  at: number;
  order: number;
  callback: () => void;
}

// Lets every promise already settled run its callbacks, and those
// callbacks' own: a real macrotask comes after all of them.
export const settle = () => new Promise<void>((done) => setTimeout(done, 0));

export class FakeClock implements Clock {
  private time: number;
  private count = 0;
  private readonly timers = new Map<number, Timer>();

  constructor(start = 0) {
    this.time = start;
  }

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, ms: number): ClockTimer {
    const id = ++this.count;
    this.timers.set(id, { at: this.time + Math.max(0, ms), order: id, callback });
    return id;
  }

  clearTimeout(timer: ClockTimer): void {
    this.timers.delete(timer as number);
  }

  // Timers still to fire, for a test to show nothing is left behind.
  get pending(): number {
    return this.timers.size;
  }

  async advance(ms: number): Promise<void> {
    const until = this.time + ms;
    for (;;) {
      await settle();
      let next: [number, Timer] | undefined;
      for (const entry of this.timers) {
        if (entry[1].at > until) continue;
        if (next === undefined || entry[1].at < next[1].at || (entry[1].at === next[1].at && entry[1].order < next[1].order)) next = entry;
      }
      if (next === undefined) break;
      this.timers.delete(next[0]);
      this.time = next[1].at;
      next[1].callback();
    }
    this.time = until;
    await settle();
  }
}
