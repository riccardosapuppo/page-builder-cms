// The clock the storage code reads and waits on, passed in rather than
// taken from the globals, so a test can move time on by hand: a debounce, a
// timeout and a retry countdown are tested without waiting for them.
export interface Clock {
  // Milliseconds, as Date.now() counts them.
  now(): number;
  setTimeout(callback: () => void, ms: number): ClockTimer;
  clearTimeout(timer: ClockTimer): void;
}

// Whatever the clock's setTimeout returns; only its clearTimeout reads it.
export type ClockTimer = unknown;

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (timer) => globalThis.clearTimeout(timer as Parameters<typeof globalThis.clearTimeout>[0]),
};
