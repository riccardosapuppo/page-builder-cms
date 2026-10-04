// What the measurement tools share: statistics that say how a number was
// reached, a look at how busy the machine is, the waiting for it to be quiet
// before a run, and the sentence that says what machine a run was on.
//
// A number taken on a busy machine says something about the machine's load,
// not about the program, and the same batch of tests took 9.7 seconds in
// one moment and 82 in another because other programs shared the
// processors. So a measuring tool waits until the machine is quiet, reads
// how busy it is before and after every run, and refuses to measure on a
// machine that never gets quiet. MEASURE_ALLOW_BUSY=1 measures anyway; the
// result then says it was taken under load and is not to be quoted.
import { cpus, freemem, release, totalmem, version as osVersion } from "node:os";
import { CouldNotRun } from "./processes.ts";

export interface Summary {
  n: number;
  min: number;
  median: number;
  p95: number;
  max: number;
}

// The median of a list: the middle one, or the mean of the two middle ones.
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("the median of nothing");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

// The p-th percentile by the nearest rank: the smallest value that at least
// p percent of the list is not above. For 20 values, the 95th is the 19th
// smallest. It is always a value that was measured, never an invention
// between two of them.
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error("a percentile of nothing");
  if (!(p > 0 && p <= 100)) throw new Error(`a percentile is above 0 and at most 100, not ${p}`);
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

export function summary(values: readonly number[]): Summary {
  const sorted = [...values].sort((a, b) => a - b);
  return { n: sorted.length, min: sorted[0]!, median: median(sorted), p95: percentile(sorted, 95), max: sorted[sorted.length - 1]! };
}

// 12.34 for 12.3449; at least three significant figures for what is small.
export function ms(value: number): string {
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function kib(bytes: number): string {
  return (bytes / 1024).toFixed(1);
}

// "median 12.3 ms (min 11.0, max 15.2, 15 runs)".
export function describe(values: readonly number[], unit = "ms"): string {
  const s = summary(values);
  return `median ${ms(s.median)} ${unit} (min ${ms(s.min)}, max ${ms(s.max)}, ${s.n} ${s.n === 1 ? "run" : "runs"})`;
}

type Times = { idle: number; busy: number };

function cpuTimes(): Times {
  let idle = 0;
  let busy = 0;
  for (const cpu of cpus()) {
    const { user, nice, sys, idle: i, irq } = cpu.times;
    idle += i;
    busy += user + nice + sys + irq;
  }
  return { idle, busy };
}

// How busy all the machine's logical processors were over the next `window`
// milliseconds, in percent (0 to 100), as the system's own counters say.
export async function cpuBusy(window = 2000): Promise<number> {
  const before = cpuTimes();
  await new Promise((done) => setTimeout(done, window));
  const after = cpuTimes();
  const busy = after.busy - before.busy;
  const total = busy + (after.idle - before.idle);
  return total <= 0 ? 0 : (100 * busy) / total;
}

export interface QuietOptions {
  // Busy percent the machine must stay under, in two readings in a row.
  limit?: number;
  // Each reading's length, ms.
  window?: number;
  // How long to wait for the machine to settle, ms.
  within?: number;
  say?: (line: string) => void;
}

const number = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new CouldNotRun(`${name} must be a positive number, not "${raw}"`);
  return value;
};

export const allowBusy = (): boolean => process.env.MEASURE_ALLOW_BUSY === "1";

// What the busiest allowed reading is, percent (MEASURE_QUIET_MAX moves it).
export const quietLimit = (): number => number("MEASURE_QUIET_MAX", 15);

export interface Quiet {
  // The two readings that let the run go on, percent.
  readings: number[];
  // Seconds spent waiting for them.
  waited: number;
  // True when the machine was not quiet and the run went on regardless.
  underLoad: boolean;
}

// Waits until two readings in a row are under the limit; throws CouldNotRun
// when the machine does not settle in time, unless MEASURE_ALLOW_BUSY=1.
export async function waitForQuiet(options: QuietOptions = {}): Promise<Quiet> {
  const limit = options.limit ?? quietLimit();
  const window = options.window ?? 3000;
  const within = options.within ?? number("MEASURE_QUIET_WAIT_MINUTES", 15) * 60_000;
  const say = options.say ?? (() => undefined);
  const started = Date.now();
  let readings: number[] = [];
  let last = 0;
  for (;;) {
    last = await cpuBusy(window);
    readings = [...readings, last].slice(-2);
    if (readings.length === 2 && readings.every((r) => r < limit)) return { readings, waited: (Date.now() - started) / 1000, underLoad: false };
    if (Date.now() - started > within) break;
    say(`the machine is ${last.toFixed(0)}% busy (the limit is ${limit}%); waiting`);
    await new Promise((done) => setTimeout(done, 5000));
  }
  const why = `the machine did not get quiet within ${Math.round(within / 60_000)} minutes (the last reading was ${last.toFixed(0)}% busy, the limit ${limit}%)`;
  if (!allowBusy()) throw new CouldNotRun(`${why}: nothing was measured (MEASURE_ALLOW_BUSY=1 measures anyway, and the result then says it was taken under load)`);
  say(`${why}; going on because MEASURE_ALLOW_BUSY=1: these numbers are taken UNDER LOAD and are not to be quoted`);
  return { readings, waited: (Date.now() - started) / 1000, underLoad: true };
}

// The machine a run was on, in the words the README uses.
export function machine(): string {
  const list = cpus();
  return `${list.length} logical processors (${list[0]?.model.trim() ?? "unknown"}), ${(totalmem() / 1024 ** 3).toFixed(1)} GB of memory `
    + `(${(freemem() / 1024 ** 3).toFixed(1)} GB free), ${process.platform} ${release()} (${osVersion()}), Node ${process.versions.node}`;
}

// The first line of every run: what, when, where.
export function banner(what: string): string {
  return `${what}: ${new Date().toISOString()}; ${machine()}`;
}

// The readings of a whole run, as "0 to 4%": the busiest and the quietest
// of the readings taken before and after its runs.
export function busyRange(readings: readonly number[]): string {
  if (readings.length === 0) return "not read";
  return `${Math.min(...readings).toFixed(0)} to ${Math.max(...readings).toFixed(0)}%`;
}

// Runs a body `times` times, reading how busy the machine is before and
// after each, and gives back what each run returned together with those
// readings. A body that throws stops the whole run.
export async function repeated<T>(times: number, body: (index: number) => Promise<T>, readings: number[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < times; i++) {
    readings.push(await cpuBusy(1000));
    out.push(await body(i));
    readings.push(await cpuBusy(1000));
  }
  return out;
}

// A whole number of runs from an environment variable, or the default.
export function runsFrom(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^[1-9][0-9]*$/.test(raw)) throw new CouldNotRun(`${name} must be a whole number of runs, 1 or more, not "${raw}"`);
  return Number(raw);
}
