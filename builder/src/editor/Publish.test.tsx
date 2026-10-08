// Preview and Publish in the top bar: drawn only for what the storage has
// (no Publish without publishing, no Schedule item without scheduling);
// the preview and the live page on the CMS's own origin; Publish waiting,
// and saying why, while the page cannot go live as the editor shows it.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit, describedText } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import type { PageDocument } from "../shared/document.ts";
import type { Published, Schedule } from "../storage/adapter.ts";
import type { SaveSnapshot } from "../storage/autosave.ts";
import { changesNotLive, PreviewButton, publishPaused, PublishButton, shownAddress } from "./Publish.tsx";
import type { OpenPage, Session } from "./session.tsx";

const live: Published = { slug: "winter-series", versionNumber: 4, draftRevision: 3, publishedAt: "2026-09-28T07:02:00.000Z" };
const open = (changes: Partial<OpenPage> = {}): OpenPage => ({ id: 7, slug: "winter-series", home: false, published: live, revision: 9, links: { preview: "/preview/7", live: "/winter-series" }, ...changes });
const EMPTY: PageDocument = { schemaVersion: 1, title: "Empty", sections: [] };

function draw(session: Partial<Session>, document: PageDocument = page()) {
  const kit = editorKit({ document, session: { cmsOrigin: "http://127.0.0.1:3901", ...session } });
  kit.render(<><PreviewButton /><PublishButton /></>);
  return kit;
}

test("Preview is a link to the draft's preview on the CMS, and a plain click goes through the session", () => {
  let previews = 0;
  draw({ current: open(), preview: () => { previews += 1; } });
  const link = screen.getByRole("link", { name: "Preview" });
  expect(link.getAttribute("href")).toBe("http://127.0.0.1:3901/preview/7");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener");
  expect(link.getAttribute("aria-keyshortcuts")).toBe("Alt+Shift+P");
  fireEvent.click(link);
  expect(previews).toBe(1);
  // A click asking for a tab of its own is the browser's.
  fireEvent.click(link, { ctrlKey: true });
  expect(previews).toBe(1);
});

test("without publishing in the storage there is no Publish, and Schedule is never drawn", () => {
  draw({ current: open(), capabilities: { publish: false, schedule: false, responses: false, imageVariants: false, livePages: true } });
  expect(screen.queryByRole("button", { name: /Publish/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "More publish options" })).toBeNull();

  document.body.innerHTML = "";
  draw({ current: open() });
  fireEvent.click(screen.getByRole("button", { name: "More publish options" }));
  expect(screen.getAllByRole("menuitem").map((item) => item.querySelector("strong")?.textContent)).toEqual(["Publish now", "View live page"]);
  expect(screen.queryByText(/Schedule/)).toBeNull();
});

test("Publish now publishes through the session; the menu counts the saves not live and links to the live page", async () => {
  let published = 0;
  draw({ current: open(), publish: async () => { published += 1; } });
  const main = screen.getByRole("button", { name: "Publish" });
  expect(main.getAttribute("aria-disabled")).toBeNull();
  expect(main.getAttribute("title")).toBe("Publish now (Ctrl+Shift+Enter)");
  await act(async () => fireEvent.click(main));
  expect(published).toBe(1);

  fireEvent.click(screen.getByRole("button", { name: "More publish options" }));
  const [now, view] = screen.getAllByRole("menuitem");
  expect(now!.textContent).toContain("Visitors see your 6 changes right away.");
  expect(view!.getAttribute("href")).toBe("http://127.0.0.1:3901/winter-series");
  // The time in the machine's own zone, as the person's browser shows it.
  expect(view!.textContent).toMatch(/^View live page127\.0\.0\.1:3901\/winter-seriesPublished Sep 28 at \d{1,2}:02 [AP]M\. Opens in a new tab\.$/);
  await act(async () => fireEvent.click(now!));
  expect(published).toBe(2);
  expect(screen.queryByRole("menu")).toBeNull();
});

test("the live page chosen from the menu leaves the focus on the button that opened the menu", () => {
  draw({ current: open() });
  const more = screen.getByRole("button", { name: "More publish options" });
  fireEvent.click(more);
  const view = screen.getAllByRole("menuitem")[1]!;
  view.focus();
  // The new tab is the browser's; jsdom opens none.
  view.addEventListener("click", (event) => event.preventDefault(), { once: true });
  fireEvent.click(view);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(more);
});

test("a page never published offers no live page, and says where it will be", () => {
  draw({ current: open({ published: null, links: { preview: "/preview/7", live: null } }) });
  fireEvent.click(screen.getByRole("button", { name: "More publish options" }));
  expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  expect(screen.getByRole("menuitem").textContent).toContain("Visitors see this page at /winter-series right away.");
});

test("Publish waits on an empty page, says why, and does nothing when pressed", async () => {
  let published = 0;
  draw({ current: open(), publish: async () => { published += 1; } }, EMPTY);
  const main = screen.getByRole("button", { name: "Publish" });
  expect(main.getAttribute("aria-disabled")).toBe("true");
  expect(describedText(main)).toBe("Add a section first. An empty page has nothing to publish.");
  await act(async () => fireEvent.click(main));
  fireEvent.click(screen.getByRole("button", { name: "More publish options" }));
  expect(published).toBe(0);
  expect(screen.queryByRole("menu")).toBeNull();
});

test("Publish waits while a save is unconfirmed or the draft changed elsewhere", () => {
  const snapshot = (phase: SaveSnapshot["phase"]) => ({ phase, revision: 9 }) as SaveSnapshot;
  expect(publishPaused(snapshot("saved"), 1)).toBeNull();
  expect(publishPaused(snapshot("waiting"), 1)).toBeNull();
  expect(publishPaused(snapshot("saving"), 1)).toBeNull();
  expect(publishPaused(snapshot("conflict"), 1)).toBe("Publish is paused until you choose Reload or Keep mine.");
  expect(publishPaused(snapshot("retrying"), 1)).toBe("Publish is paused until the changes are saved.");
  expect(publishPaused(snapshot("invalid"), 1)).toBe("Publish is paused until the value the server refused is fixed.");
  expect(publishPaused(snapshot("saved"), 0)).toBe("Add a section first. An empty page has nothing to publish.");
});

test("the changes not live are saves, counted from the CMS's draft revision", () => {
  expect(changesNotLive(open(), null)).toBe(6);
  expect(changesNotLive(open(), { revision: 12, unsavedEdits: 4 } as SaveSnapshot)).toBe(9);
  expect(changesNotLive(open({ published: null }), null)).toBe(0);
  expect(shownAddress("http://127.0.0.1:3900/")).toBe("127.0.0.1:3900");
  expect(shownAddress("https://cms.example/winter-series")).toBe("cms.example/winter-series");
});

const SCHEDULING = { publish: true, schedule: true, responses: false, imageVariants: false, livePages: true };
const pending: Schedule = { id: 3, at: "2026-10-05T06:15:00.000Z", revision: 9, versionNumber: 12, state: "pending", createdAt: "2026-10-02T08:00:00.000Z", settledAt: null, publishedVersionNumber: null };

function drawScheduling(session: Partial<Session>, onSchedule: () => void) {
  const kit = editorKit({ document: page(), session: { cmsOrigin: "http://127.0.0.1:3901", capabilities: SCHEDULING, ...session } });
  kit.ui.getState().setSite({ name: "Slack Water", menu: [], action: null, footer: { lead: "", text: "" }, timeZone: "Europe/London" });
  kit.render(<PublishButton onSchedule={onSchedule} />);
  return kit;
}

test("with scheduling, the menu holds Publish now, Schedule… and the live page; Schedule… opens its dialog and gives the focus back to the menu's button", () => {
  let asked = 0;
  drawScheduling({ current: open() }, () => { asked += 1; });
  const more = screen.getByRole("button", { name: "More publish options" });
  fireEvent.click(more);
  const items = screen.getAllByRole("menuitem");
  expect(items.map((item) => item.querySelector("strong")?.textContent)).toEqual(["Publish now", "Schedule…", "View live page"]);
  expect(items[1]!.getAttribute("aria-haspopup")).toBe("dialog");
  expect(items[1]!.textContent).toBe("Schedule…Choose the day and time visitors see your 6 changes.");
  fireEvent.click(items[1]!);
  expect(asked).toBe(1);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(more);
});

test("nothing to schedule when visitors already see the draft: the item says so and opens nothing", () => {
  let asked = 0;
  drawScheduling({ current: open({ revision: 3 }) }, () => { asked += 1; });
  fireEvent.click(screen.getByRole("button", { name: "More publish options" }));
  const schedule = screen.getAllByRole("menuitem")[1]!;
  expect(schedule.getAttribute("aria-disabled")).toBe("true");
  expect(schedule.textContent).toContain("Visitors already see this draft: there is nothing to schedule.");
  fireEvent.click(schedule);
  expect(asked).toBe(0);
});

test("a publish waiting for its time is in the menu, by the site's clock, with its cancel", async () => {
  let cancelled = 0;
  drawScheduling({ current: open({ scheduled: pending }), cancelSchedule: async () => { cancelled += 1; } }, () => {});
  fireEvent.click(screen.getByRole("button", { name: "More publish options" }));
  const items = screen.getAllByRole("menuitem");
  expect(items.map((item) => item.querySelector("strong")?.textContent)).toEqual(["Publish now", "Schedule…", "Cancel scheduled publish", "View live page"]);
  expect(items[1]!.textContent).toContain("Set for Oct 5 at 7:15 AM (UTC+1). Choose another time.");
  expect(items[2]!.textContent).toContain("Set for Oct 5 at 7:15 AM (UTC+1). The live page stays as it is.");
  await act(async () => fireEvent.click(items[2]!));
  expect(cancelled).toBe(1);
});

test("a storage that cannot schedule shows neither item, even with a schedule on the page", () => {
  drawScheduling({ current: open({ scheduled: pending }), capabilities: { publish: true, schedule: false, responses: false, imageVariants: false, livePages: true } }, () => {});
  fireEvent.click(screen.getByRole("button", { name: "More publish options" }));
  expect(screen.getAllByRole("menuitem").map((item) => item.querySelector("strong")?.textContent)).toEqual(["Publish now", "View live page"]);
});
