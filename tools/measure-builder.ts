// npm run measure:builder
//
// What the editor takes to open a page of 500 blocks, and how smoothly it
// follows the pointer while a block is dragged across that page, in
// headless Chromium (Playwright 1.62.1, the root package's), against a CMS
// of its own in the e2e environment (127.0.0.1:3901, MEASURE_CMS_PORT) and
// the editor on 127.0.0.1:4901 (MEASURE_EDITOR_PORT), in two forms:
// - the production build, served by `vite preview`: what a deployed editor
//   is;
// - the development server, which is what `npm start` runs: the modules
//   one by one, and React's development build.
// Each form starts its own CMS and editor, publishes the page and ends by
// deleting them (databases, Active Storage root, build).
//
// First render: a fresh browser context for each run (nothing cached),
// from the start of the navigation until the 500 blocks are in the canvas
// and the frame after them has been produced, split at the moment the
// page's data has arrived; with the long tasks of the main thread, the
// DOM's size and the JavaScript heap.
//
// Dragging: on the page that was just opened, a block is picked up by its
// grip, and held while the page is scrolled to a number of positions evenly
// spread over its height (14 by default, MEASURE_DRAG_STOPS) and the
// pointer goes down the canvas and up again at each, in steps of 40 px,
// across the columns. The browser's input is real (Playwright sends each
// move and waits for the page to take it), so a slow page gets fewer moves
// a second, as it would from a hand. Taken from the page itself with the
// performance API, for every frame and move:
// - the frame interval: the time between two requestAnimationFrame
//   callbacks, 16.7 ms when the browser keeps up with 60 frames a second;
// - the pointer's latency, from the pointermove event to the end of the
//   second frame after it (see frames() for why the second);
// - the long tasks (over 50 ms) of the main thread, and the browser's own
//   counters of where its time went: JavaScript, layout, style.
// Esc and a release put the block back and the page's draft is not saved,
// which is checked: no write reaches the CMS. The same sweep on a page of
// four blocks gives the baseline of the browser and the harness.
//
// MEASURE_PROFILE=1 adds one run with the JavaScript profiler on, on an
// unminified build, and says which functions the time of the opening and of
// the drag went to, as shares (a profiler slows the page, so its
// milliseconds are not quoted); MEASURE_PROFILE=only runs nothing else.
// MEASURE_FORMS=build or =dev measures one form only, MEASURE_RUNS_BUILDER
// sets the runs of each (9).
//
// It waits for the machine to be quiet first, reads how busy it is before
// and after every run, and stops, exit 2, if it never gets quiet. Headless
// Chromium paints in software, so a real screen's compositor is not part
// of these numbers.
//
// Exits 0 when it measured and its own checks passed, 1 when one failed, 2
// when it could not run here.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type CDPSession, type Page } from "playwright";
import { startBuilder, startCms, type Server } from "../builder/e2e/harness/servers.ts";
import { bySelf, byTotal, reduce, type Profile } from "./lib/cpu-profile.ts";
import { buildEditor } from "./lib/editor-build.ts";
import { banner, busyRange, cpuBusy, ms, percentile, quietLimit, runsFrom, summary, waitForQuiet, median } from "./lib/measure.ts";
import { publishLargePage, publishSmallPage } from "./lib/measure-site.ts";
import { CouldNotRun } from "./lib/processes.ts";

const port = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!/^[0-9]+$/.test(raw) || !Number.isInteger(value) || value <= 0 || value > 65535) throw new CouldNotRun(`${name} must be a port number, not "${raw}"`);
  return value;
};

const results: string[] = [];
let failed = 0;
function check(ok: boolean, what: string, detail = ""): void {
  if (!ok) failed += 1;
  const line = `${ok ? "ok  " : "FAIL"} ${what}${detail ? `: ${detail}` : ""}`;
  results.push(line);
  if (!ok) console.log(line);
}

// --- In the page ------------------------------------------------------------------

interface Opened {
  // ms from the start of the navigation.
  pageArrived: number;
  blocksAt: number;
  paintedAt: number;
  blocks: number;
  longTasks: number;
  longTaskMs: number;
  nodes: number;
  heapMB: number | null;
  scripts: string[];
  // Where the main thread's time went from the page's creation to here.
  thread: Thread;
}

// The main thread's time in ms, and counts, by the browser's own counters
// (Chrome DevTools Protocol, Performance.getMetrics): the whole of its
// tasks, the part in JavaScript, in layout and in style recalculation.
interface Thread {
  task: number;
  script: number;
  layout: number;
  style: number;
  layouts: number;
  styles: number;
}

// Installed before the page's own scripts: sees the canvas fill with
// blocks, whenever it does, and notes when the next frames have been made.
function probe(): void {
  if (window.top !== window) return;
  const m = { blocksAt: null as number | null, paintedAt: null as number | null, blocks: 0, tasks: [] as number[], done: false };
  (window as unknown as { __open: typeof m }).__open = m;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) m.tasks.push(entry.duration);
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // Long tasks are not reported by this browser: the list stays empty.
  }
  const look = (): void => {
    if (m.blocksAt !== null) return;
    const n = document.querySelectorAll(".canvas [data-block-id][data-block-type]").length;
    if (n < 500) return;
    m.blocksAt = performance.now();
    m.blocks = n;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      m.paintedAt = performance.now();
      m.done = true;
    }));
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true });
}

// What the page recorded, with the browser's own timings of its requests.
function collect(id: number): Omit<Opened, "thread"> {
  const m = (window as unknown as { __open: { blocksAt: number; paintedAt: number; blocks: number; tasks: number[] } }).__open;
  const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const data = resources.find((r) => new URL(r.name).pathname === `/api/pages/${id}`);
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return {
    pageArrived: data ? data.responseEnd : NaN,
    blocksAt: m.blocksAt, paintedAt: m.paintedAt, blocks: m.blocks,
    longTasks: m.tasks.length, longTaskMs: m.tasks.reduce((a, b) => a + b, 0),
    nodes: document.getElementsByTagName("*").length,
    heapMB: heap ? heap.usedJSHeapSize / 1048576 : null,
    scripts: resources.filter((r) => /\.(m?js|ts|tsx)(\?|$)/.test(new URL(r.name).pathname)).map((r) => new URL(r.name).pathname),
  };
}

// Installed on the page that was opened, just before the drag.
//
// A pointer move is timed to the end of the second frame after it. The
// editor answers a move in a task of its own after the frame the move
// arrived in (React renders outside the event), so what it changed is
// drawn in the next frame: the first message below comes after the frame
// the move arrived in and the editor's task, the second after the frame
// that draws the answer. On a page that does nothing about a move, that is
// about two frames; every millisecond above is the editor's.
function frames(): void {
  type Frames = { on: boolean; deltas: number[]; lat: number[]; moves: number; places: string[]; tasks: number[] };
  const f: Frames = { on: true, deltas: [], lat: [], moves: 0, places: [], tasks: [] };
  (window as unknown as { __frames: Frames }).__frames = f;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) f.tasks.push(entry.duration);
    }).observe({ type: "longtask" });
  } catch {
    // Long tasks are not reported by this browser.
  }
  let last = performance.now();
  const loop = (t: number): void => {
    if (!f.on) return;
    f.deltas.push(t - last);
    last = t;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame((t) => {
    last = t;
    requestAnimationFrame(loop);
  });
  const afterFrame = (then: () => void): void => {
    requestAnimationFrame(() => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        then();
      };
      channel.port2.postMessage(0);
    });
  };
  window.addEventListener("pointermove", (event) => {
    f.moves += 1;
    const sent = event.timeStamp;
    afterFrame(() => {
      const caption = document.querySelector(".live-caption")?.textContent;
      if (caption) f.places.push(caption);
      afterFrame(() => f.lat.push(performance.now() - sent));
    });
  }, { capture: true, passive: true });
}

// --- Driving the page -------------------------------------------------------------

const VIEWPORT = { width: 1440, height: 900 };
// Where the fixture's pictures that no library holds point (contract/
// fixtures/large-500.json).
const OTHER_SITE = "https://images.example.org/";

interface Drag {
  deltas: number[];
  lat: number[];
  moves: number;
  // Long tasks (over 50 ms) of the main thread while the block was held.
  tasks: number[];
  // The different places the live region named: "X will move to ...".
  places: number;
  // The different sentences the live region said, the first few of them.
  sentences: string[];
  // The positions the page was scrolled to, and the page's height.
  stops: number;
  scrollHeight: number;
  // Where the main thread's time went while the block was held.
  thread: Thread;
}

type Metrics = Record<string, number>;

async function metrics(cdp: CDPSession): Promise<Metrics> {
  const { metrics: list } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(list.map((m) => [m.name, m.value]));
}

// The pointer's way over the canvas: at each of `stops` positions evenly
// spread over the page's height, the page is scrolled there and the
// pointer goes down the canvas and up again in steps of 40 px, from one
// column to another as it goes (x follows the golden ratio's fractions, so
// that it is the same on every run and covers the width evenly).
async function drag(page: Page, stops: number): Promise<Drag> {
  await page.evaluate(frames);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const block =page.locator('.canvas [data-block-id="s1c1w1"]:not([inert], [inert] *, [data-dnd-placeholder], [data-dnd-placeholder] *)');
  await block.click();
  const grip = page.locator(".canvas .clamp [data-grip]");
  await grip.scrollIntoViewIfNeeded();
  const at = (await grip.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2 + 8, at.y + at.height / 2 + 8, { steps: 4 });
  const before = await metrics(cdp);
  const view = (await page.locator(".canvas").boundingBox())!;
  const reach = await page.evaluate(() => {
    const canvas = document.querySelector(".canvas") as HTMLElement;
    return { scrollHeight: canvas.scrollHeight, max: canvas.scrollHeight - canvas.clientHeight };
  });
  const top = view.y + 60;
  const bottom = view.y + view.height - 60;
  let k = 0;
  for (let stop = 0; stop < stops; stop++) {
    const position = stops === 1 ? 0 : Math.round((stop * reach.max) / (stops - 1));
    // The page scrolled to, and a frame given to draw it.
    await page.evaluate((to) => new Promise<void>((done) => {
      (document.querySelector(".canvas") as HTMLElement).scrollTop = to;
      requestAnimationFrame(() => requestAnimationFrame(() => done()));
    }), position);
    for (const [from, to] of [[top, bottom], [bottom, top]] as const) {
      const moves = Math.max(2, Math.round(Math.abs(to - from) / 40));
      for (let m = 0; m < moves; m++, k++) {
        const x = view.x + view.width * (0.1 + 0.8 * ((k * 0.6180339887) % 1));
        await page.mouse.move(x, from + ((to - from) * m) / (moves - 1));
      }
    }
  }
  // A beat for the last moves' two frames to have passed.
  await page.waitForTimeout(150);
  const after = await metrics(cdp);
  const taken = await page.evaluate(() => {
    const f = (window as unknown as { __frames: { on: boolean; deltas: number[]; lat: number[]; moves: number; places: string[]; tasks: number[] } }).__frames;
    f.on = false;
    const sentences = [...new Set(f.places)];
    return { deltas: f.deltas, lat: f.lat, moves: f.moves, tasks: f.tasks, sentences: sentences.slice(0, 4), places: sentences.filter((p) => / will move to /.test(p)).length };
  });
  // Put the block back: Esc, then the release. Nothing is saved.
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await cdp.detach();
  return { ...taken, stops, scrollHeight: reach.scrollHeight, thread: threadBetween(before, after) };
}

// The counters grow with the page's life: what a stretch of it cost is the
// difference between two readings (the first reading of a page's opening
// is taken from nothing).
function threadBetween(before: Metrics, after: Metrics): Thread {
  const spent = (name: string): number => ((after[name] ?? NaN) - (before[name] ?? 0)) * 1000;
  const counted = (name: string): number => (after[name] ?? NaN) - (before[name] ?? 0);
  return { task: spent("TaskDuration"), script: spent("ScriptDuration"), layout: spent("LayoutDuration"), style: spent("RecalcStyleDuration"), layouts: counted("LayoutCount"), styles: counted("RecalcStyleCount") };
}

// --- A form of the editor ----------------------------------------------------------

interface Run {
  opened: Opened;
  drag: Drag | null;
  busy: number[];
  // What went wrong on the page: errors, and requests that would save.
  errors: string[];
  writes: string[];
  // Pictures of another site the page asked for and this machine could
  // not fetch.
  elsewhere: number;
}

interface Form {
  name: string;
  what: string;
  open: Run[];
  // The drag on the 500-block page, on the one of four blocks.
  large: Run[];
  small: Run[];
  chromium: string;
}

async function measureForm(name: string, what: string, preview: string | undefined, cmsPort: number, editorPort: number, runs: number, stops: number): Promise<Form> {
  const form: Form = { name, what, open: [], large: [], small: [], chromium: "" };
  let cms: Server | undefined;
  let editor: Server | undefined;
  let browser: Browser | undefined;
  try {
    cms = await startCms(cmsPort);
    editor = await startBuilder(editorPort, cms.url, preview ? { preview } : {});
    console.log(`${name}: the CMS on ${cms.url}, the editor on ${editor.url}`);
    const large = await publishLargePage(cms.url);
    const small = await publishSmallPage(cms.url);
    browser = await chromium.launch({ headless: true });
    form.chromium = browser.version();

    // One visit first, and its context thrown away: the development server
    // transforms each module the first time it is asked for.
    const warm = await browser.newContext({ viewport: VIEWPORT, locale: "en-US", timezoneId: "UTC" });
    const warmPage = await warm.newPage();
    await warmPage.goto(`${editor.url}/?page=${large.id}`);
    // Attached, not visible: the last block of the page is a spacer.
    await warmPage.locator(".canvas [data-block-id][data-block-type]").nth(499).waitFor({ state: "attached", timeout: 120_000 });
    await warm.close();

    const visit = async (id: number, expected: number, withDrag: boolean): Promise<Run> => {
      const busy = [await cpuBusy(1000)];
      const context = await browser!.newContext({ viewport: VIEWPORT, locale: "en-US", timezoneId: "UTC" });
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        const writes: string[] = [];
        const elsewhere: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() !== "error") return;
          // The page names a few pictures on another site, which this
          // machine has no way to fetch: its own failure to resolve the
          // name, nothing the editor did. Counted, not hidden.
          if (message.location().url.startsWith(OTHER_SITE)) elsewhere.push(message.location().url);
          else errors.push(message.text());
        });
        page.on("request", (request) => {
          if (request.method() !== "GET" && request.method() !== "HEAD") writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
        });
        await page.addInitScript(probe);
        const cdp = await context.newCDPSession(page);
        await cdp.send("Performance.enable");
        await page.goto(`${editor!.url}/?page=${id}`, { waitUntil: "commit" });
        if (expected === 500) {
          await page.waitForFunction(() => (window as unknown as { __open?: { done: boolean } }).__open?.done === true, null, { timeout: 120_000, polling: 100 });
        } else {
          await page.locator(".canvas [data-block-id][data-block-type]").nth(expected - 1).waitFor({ state: "attached", timeout: 60_000 });
        }
        const loaded = await page.evaluate(collect, id);
        const opened: Opened = { ...loaded, thread: threadBetween({}, await metrics(cdp)) };
        await cdp.detach();
        const swept = withDrag ? await drag(page, stops) : null;
        // A beat for anything the page was still doing before it is judged.
        await page.waitForTimeout(300);
        busy.push(await cpuBusy(1000));
        return { opened, drag: swept, busy, errors, writes, elsewhere: elsewhere.length };
      } finally {
        await context.close();
      }
    };

    for (let i = 0; i < runs; i++) {
      console.log(`${name}: run ${i + 1} of ${runs}, 500 blocks`);
      const run = await visit(large.id, 500, true);
      form.open.push(run);
      form.large.push(run);
    }
    for (let i = 0; i < runs; i++) {
      console.log(`${name}: run ${i + 1} of ${runs}, four blocks`);
      form.small.push(await visit(small.id, 4, true));
    }
    return form;
  } finally {
    await browser?.close().catch(() => undefined);
    for (const server of [editor, cms]) {
      if (!server) continue;
      try {
        for (const line of await server.stop()) console.log(`${name}: ${line}`);
      } catch (error) {
        check(false, `${name}: the server was stopped cleanly`, (error as Error).message);
      }
    }
  }
}

// --- A profile, to say where the time goes ---------------------------------------------

// One run on an unminified production build, with the JavaScript profiler
// on: while the page opens, and while the block is dragged. Not one of the
// measured runs: a profiler slows the page, so its milliseconds are not
// quoted, only which functions the time went to, as a share. MEASURE_PROFILE=1
// adds it to a measurement, MEASURE_PROFILE=only runs nothing else.
async function profileRun(readable: string, cmsPort: number, editorPort: number, stops: number): Promise<void> {
  let cms: Server | undefined;
  let editor: Server | undefined;
  let browser: Browser | undefined;
  try {
    cms = await startCms(cmsPort);
    editor = await startBuilder(editorPort, cms.url, { preview: readable });
    const large = await publishLargePage(cms.url);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: VIEWPORT, locale: "en-US", timezoneId: "UTC" });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 250 });
    await page.addInitScript(probe);

    await cdp.send("Profiler.start");
    await page.goto(`${editor.url}/?page=${large.id}`, { waitUntil: "commit" });
    await page.waitForFunction(() => (window as unknown as { __open?: { done: boolean } }).__open?.done === true, null, { timeout: 120_000, polling: 100 });
    const opening = reduce((await cdp.send("Profiler.stop")).profile as Profile);

    await cdp.send("Profiler.start");
    await drag(page, stops);
    const dragging = reduce((await cdp.send("Profiler.stop")).profile as Profile);

    console.log("");
    console.log(`# Where the JavaScript's time went, one run on an unminified build (${stops} stops; a profiler slows the page, so only the shares are to be read)`);
    for (const [what, reduced] of [["opening the page of 500 blocks", opening], ["dragging a block across it", dragging]] as const) {
      console.log("");
      console.log(`${what}: ${ms(reduced.total)} ms of sampled time in all. Top by the function's own time:`);
      console.log("| Function | Where | Own time, ms | Share |");
      console.log("| --- | --- | --- | --- |");
      for (const h of bySelf(reduced, 12)) console.log(`| ${h.name} | ${h.where} | ${ms(h.self)} | ${((100 * h.self) / reduced.total).toFixed(1)}% |`);
      console.log(`Top by the time in the function and what it called:`);
      console.log("| Function | Where | Total time, ms | Share |");
      console.log("| --- | --- | --- | --- |");
      for (const h of byTotal(reduced, 25)) console.log(`| ${h.name} | ${h.where} | ${ms(h.total)} | ${((100 * h.total) / reduced.total).toFixed(1)}% |`);
    }
    check(opening.total > 100 && dragging.total > 1000, "the profiler sampled the opening and the drag", `${ms(opening.total)} ms and ${ms(dragging.total)} ms`);
  } finally {
    await browser?.close().catch(() => undefined);
    for (const server of [editor, cms]) {
      if (!server) continue;
      try {
        for (const line of await server.stop()) console.log(`profile: ${line}`);
      } catch (error) {
        check(false, "profile: the server was stopped cleanly", (error as Error).message);
      }
    }
  }
}

// --- Report -------------------------------------------------------------------------

const runsOf = (values: number[]): string => {
  const s = summary(values);
  return `${ms(s.median)} (${ms(s.min)} to ${ms(s.max)})`;
};

// The first two frames of the drag are the pick-up's, not the sweep's.
const framesOf = (d: Drag): number[] => d.deltas.slice(2);

function frameStats(d: Drag): { frames: number; median: number; p95: number; max: number; slow: number; latMedian: number; latP95: number; latMax: number; tasks: number; taskMs: number } {
  const deltas = framesOf(d);
  return {
    frames: deltas.length, median: median(deltas), p95: percentile(deltas, 95), max: Math.max(...deltas),
    slow: deltas.filter((x) => x > 33.4).length,
    latMedian: median(d.lat), latP95: percentile(d.lat, 95), latMax: Math.max(...d.lat),
    tasks: d.tasks.length, taskMs: d.tasks.reduce((a, b) => a + b, 0),
  };
}

function report(forms: Form[], stops: number, underLoad: boolean): void {
  console.log("");
  console.log(`# ${banner("measure-builder")}`);
  for (const f of forms) console.log(`# ${f.name}: ${f.what}; Chromium ${f.chromium}, headless, ${VIEWPORT.width} by ${VIEWPORT.height}`);
  console.log("");
  console.log("First render of the page of 500 blocks, ms from the start of the navigation, a fresh browser context each run: median (min to max)");
  console.log("| Form | Data arrived | 500 blocks in the canvas | Frame after them | Of which after the data | Long tasks | DOM nodes | JS heap, MB | Runs | CPU busy before and after |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const f of forms) {
    const o = f.open.map((r) => r.opened);
    const busy = f.open.flatMap((r) => r.busy);
    console.log(`| ${f.name} | ${runsOf(o.map((x) => x.pageArrived))} | ${runsOf(o.map((x) => x.blocksAt))} | ${runsOf(o.map((x) => x.paintedAt))} | ${runsOf(o.map((x) => x.paintedAt - x.pageArrived))} | `
      + `${runsOf(o.map((x) => x.longTasks))} tasks, ${runsOf(o.map((x) => x.longTaskMs))} ms | ${runsOf(o.map((x) => x.nodes))} | ${f.open[0]!.opened.heapMB === null ? "n/a" : runsOf(o.map((x) => x.heapMB!))} | ${f.open.length} | ${busyRange(busy)} |`);
  }
  console.log("");
  console.log("Where the main thread's time went opening the page of 500 blocks, from the page's creation to the frame after the blocks: median (min to max), ms, from the browser's own counters:");
  console.log("| Form | Main thread busy | JavaScript | Layout | Style recalculation | Layouts | Style recalculations |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const f of forms) {
    const t = f.open.map((r) => r.opened.thread);
    console.log(`| ${f.name} | ${runsOf(t.map((x) => x.task))} | ${runsOf(t.map((x) => x.script))} | ${runsOf(t.map((x) => x.layout))} | ${runsOf(t.map((x) => x.style))} | ${runsOf(t.map((x) => x.layouts))} | ${runsOf(t.map((x) => x.styles))} |`);
  }
  console.log("");
  const first = forms[0]!.large[0]!.drag!;
  console.log(`Dragging a block across the page, one run per fresh page: the block held, the page scrolled to ${stops} positions evenly spread over its height (${first.scrollHeight} px), the pointer down the canvas and up again at each. `
    + `Frame interval and pointer latency in ms; per run, then the median of the runs (min to max)`);
  console.log("| Form | Page | Pointer moves per run | Frames per run | Frame interval median | Frame interval 95th | Worst frame | Frames over 33 ms | Pointer latency median | Pointer latency 95th | Pointer latency worst | Long tasks | Drop places seen | Runs | CPU busy before and after |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const f of forms) {
    for (const [label, list] of [["500 blocks", f.large], ["4 blocks", f.small]] as const) {
      const stats = list.map((r) => frameStats(r.drag!));
      console.log(`| ${f.name} | ${label} | ${runsOf(list.map((r) => r.drag!.moves))} | ${runsOf(stats.map((s) => s.frames))} | ${runsOf(stats.map((s) => s.median))} | ${runsOf(stats.map((s) => s.p95))} | ${runsOf(stats.map((s) => s.max))} | ${runsOf(stats.map((s) => s.slow))} | `
        + `${runsOf(stats.map((s) => s.latMedian))} | ${runsOf(stats.map((s) => s.latP95))} | ${runsOf(stats.map((s) => s.latMax))} | ${runsOf(stats.map((s) => s.tasks))} tasks, ${runsOf(stats.map((s) => s.taskMs))} ms | ${runsOf(list.map((r) => r.drag!.places))} | ${list.length} | ${busyRange(list.flatMap((r) => r.busy))} |`);
    }
  }
  console.log("");
  console.log("The same runs with every frame and every pointer move of every run pooled (a 95th percentile of the pooled list, not of the runs'):");
  console.log("| Form | Page | Frames | Frame interval median | Frame interval 95th | Pointer moves | Pointer latency median | Pointer latency 95th | Pointer latency worst |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const f of forms) {
    for (const [label, list] of [["500 blocks", f.large], ["4 blocks", f.small]] as const) {
      const frames = list.flatMap((r) => framesOf(r.drag!));
      const lat = list.flatMap((r) => r.drag!.lat);
      console.log(`| ${f.name} | ${label} | ${frames.length} | ${ms(median(frames))} | ${ms(percentile(frames, 95))} | ${lat.length} | ${ms(median(lat))} | ${ms(percentile(lat, 95))} | ${ms(Math.max(...lat))} |`);
    }
  }
  console.log("");
  console.log("Where the main thread's time went while the block was held, per run: median (min to max), ms, from the browser's own counters:");
  console.log("| Form | Page | Held for | Main thread busy | JavaScript | Layout | Style recalculation | Layouts | Style recalculations |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const f of forms) {
    for (const [label, list] of [["500 blocks", f.large], ["4 blocks", f.small]] as const) {
      const t = list.map((r) => r.drag!.thread);
      console.log(`| ${f.name} | ${label} | ${runsOf(list.map((r) => framesOf(r.drag!).reduce((a, b) => a + b, 0)))} | ${runsOf(t.map((x) => x.task))} | ${runsOf(t.map((x) => x.script))} | ${runsOf(t.map((x) => x.layout))} | ${runsOf(t.map((x) => x.style))} | ${runsOf(t.map((x) => x.layouts))} | ${runsOf(t.map((x) => x.styles))} |`);
    }
  }
  console.log("");
  for (const f of forms) console.log(`The live region said, in the first run of ${f.name}, on 500 blocks: ${f.large[0]!.drag!.sentences.map((s) => `"${s}"`).join("; ")}`);
  const elsewhere = forms.flatMap((f) => [...f.large, ...f.small]).map((r) => r.elsewhere);
  console.log("");
  console.log(`(the page names pictures on another site, which this machine cannot fetch: ${Math.max(...elsewhere)} failed requests in a run, not counted as errors)`);
  if (underLoad) console.log("UNDER LOAD: the machine was not quiet during this run (or MEASURE_ALLOW_BUSY=1 was given): these numbers are not to be quoted");
}

// --- The run -------------------------------------------------------------------------

let exitCode = 0;
let underLoad = false;
const folders: string[] = [];
const forms: Form[] = [];
const stops = runsFrom("MEASURE_DRAG_STOPS", 14);
try {
  const cmsPort = port("MEASURE_CMS_PORT", 3901);
  const editorPort = port("MEASURE_EDITOR_PORT", 4901);
  const runs = runsFrom("MEASURE_RUNS_BUILDER", 9);
  console.log(banner("measure-builder"));
  const quiet = await waitForQuiet({ say: (line) => console.log(line) });
  console.log(`the machine was ${quiet.readings.map((r) => `${r.toFixed(0)}%`).join(" then ")} busy before the run (waited ${quiet.waited.toFixed(0)} s)`);
  underLoad = quiet.underLoad;

  const folder = mkdtempSync(join(tmpdir(), "pbc-measure-builder-"));
  folders.push(folder);
  const built = buildEditor(join(folder, "dist"));
  console.log(`the editor's production build is in ${built.folder}`);

  const profile = process.env.MEASURE_PROFILE ?? "";
  const which = (profile === "only" ? "" : process.env.MEASURE_FORMS ?? "build,dev").split(",");
  if (which.includes("build")) forms.push(await measureForm("production build", "`vite preview` serving `vite build`'s output", built.folder, cmsPort, editorPort, runs, stops));
  if (which.includes("dev")) forms.push(await measureForm("development server", "`vite`, as `npm start` runs it", undefined, cmsPort, editorPort, runs, stops));
  check(forms.length > 0 || profile === "only", "at least one form of the editor was measured", which.join(", "));

  for (const f of forms) {
    check([...f.large, ...f.small].every((r) => r.errors.length === 0), `${f.name}: no error on the page or in its console, in any run`, [...f.large, ...f.small].flatMap((r) => r.errors).slice(0, 3).join(" | "));
    check([...f.large, ...f.small].every((r) => r.writes.length === 0), `${f.name}: the page sent no write to the CMS, in any run (a dragged block put back saves nothing)`, [...f.large, ...f.small].flatMap((r) => r.writes).slice(0, 3).join(", "));
    check(f.open.every((r) => r.opened.blocks === 500),`${f.name}: the canvas held exactly 500 blocks when the first render was taken`, [...new Set(f.open.map((r) => r.opened.blocks))].join(", "));
    check(f.open.every((r) => Number.isFinite(r.opened.pageArrived) && r.opened.pageArrived < r.opened.blocksAt && r.opened.blocksAt <= r.opened.paintedAt), `${f.name}: the data arrived, then the blocks, then the frame after them, every run`);
    check(f.open.every((r) => !r.opened.scripts.some((s) => /TextEditor/.test(s))), `${f.name}: the text editor's code was not loaded to open the page`, f.open[0]!.opened.scripts.filter((s) => /TextEditor/.test(s)).join(", "));
    for (const [label, list] of [["500 blocks", f.large], ["4 blocks", f.small]] as const) {
      check(list.every((r) => (label === "500 blocks" ? r.drag!.places >= 20 : r.drag!.sentences.length >= 1)), `${f.name}, ${label}: the drag engaged, the live region said where the block would go`,
        label === "500 blocks" ? `${[...new Set(list.map((r) => r.drag!.places))].join(", ")} different places` : `"${list[0]!.drag!.sentences.join('"; "')}"`);
      check(list.every((r) => r.drag!.moves >= 100 && r.drag!.deltas.length > r.drag!.moves && r.drag!.lat.length >= r.drag!.moves - 3 && r.drag!.lat.every((l) => l >= 0 && l < 10_000)), `${f.name}, ${label}: at least 100 pointer moves and a frame for each were timed, a latency for each move, and no latency is negative`,
        `${list[0]!.drag!.deltas.length} frames, ${list[0]!.drag!.lat.length} latencies for ${list[0]!.drag!.moves} moves in the first run`);
    }
    underLoad ||= [...f.open, ...f.small].some((r) => r.busy.some((b) => b >= quietLimit()));
  }
  if (forms.length > 0) report(forms, stops, underLoad);
  if (profile === "1" || profile === "only") {
    const readable = buildEditor(join(folder, "readable"), { readable: true });
    console.log(`the editor's unminified build, for the profile, is in ${readable.folder}`);
    await profileRun(readable.folder, cmsPort, editorPort, stops);
  }
} catch (error) {
  console.log(`the measurement stopped: ${(error as Error).message}`);
  if (error instanceof CouldNotRun) exitCode = 2;
  else check(false, "the measurement ran to its end", (error as Error).message);
} finally {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
}

for (const line of results) console.log(line);
const total = results.length;
console.log(exitCode === 2 ? "RESULT: the measurement could not run to the end"
  : failed === 0 ? `RESULT: ${total} checks passed${underLoad ? ", taken UNDER LOAD, not to be quoted" : ""}` : `RESULT: ${failed} of ${total} checks failed`);
process.exit(exitCode || (failed ? 1 : 0));
