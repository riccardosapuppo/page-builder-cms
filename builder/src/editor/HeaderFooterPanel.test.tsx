// Header and footer, the screen that changes the site's header and footer:
// every value labelled, its limit said; a change goes to the canvas as it
// is typed (the interface store's change waiting) and to the session only
// on Save, whole; links added, moved and taken away by named buttons, the
// focus staying where the person is; the button taken away and brought
// back; a refusal said at each value at fault and in the head; a conflict
// with another tab's save offering Reload and Keep mine; the site's pages
// and the sections of the page offered to a link.
// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import type { FieldError, Site, SiteValues } from "../storage/adapter.ts";
import { HeaderFooterPanel, REACHES_EVERY_PAGE, REACHES_EVERY_PAGE_IN_BROWSER } from "./HeaderFooterPanel.tsx";
import type { Session, SiteSave } from "./session.tsx";

const site: Site = {
  name: "Slack Water",
  menu: [{ label: "Swims", href: "/#swims" }, { label: "Gallery", href: "/#gallery" }, { label: "Meet us", href: "/#meet" }],
  action: { label: "Join", href: "/#join" },
  footer: { lead: "Slack Water swimming club.", text: "Tide times are a guide, not a promise." },
  timeZone: "Europe/London",
  revision: 4,
  updatedAt: "2026-10-09T09:00:00.000Z",
};

function draw(session: Partial<Session> = {}) {
  const saves: Array<{ values: SiteValues; from: number | undefined }> = [];
  let closed = 0;
  const kit = editorKit({
    document: page(),
    session: {
      current: { id: 7, slug: "winter-series", home: false, published: null, revision: 3, links: { preview: "/preview/7", live: null } },
      pages: [
        { id: 1, title: "Home", slug: "home", home: true, revision: 1, updatedAt: "", published: null, scheduled: null, links: {} as never },
        { id: 7, title: "Winter series", slug: "winter-series", home: false, revision: 3, updatedAt: "", published: null, scheduled: null, links: {} as never },
      ],
      pageSections: async (id) => (id === 1 ? [{ anchor: "swims", label: "Swims" }] : null),
      saveSite: async (values, from) => {
        saves.push({ values, from });
        return "saved";
      },
      ...session,
    },
  });
  kit.ui.getState().setSite(site);
  kit.render(<HeaderFooterPanel onClose={() => { closed += 1; }} />);
  return { kit, saves, closed: () => closed };
}

const links = () => within(screen.getByRole("list", { name: "Menu" })).getAllByRole("group");
const linkGroup = (n: number) => screen.getByRole("group", { name: `Link ${n}` });

test("where the storage serves no page, the line says the pages a change reaches are those published in this browser", () => {
  draw({ cmsOrigin: null, capabilities: { publish: true, schedule: false, responses: false, headerFooter: true, imageVariants: false, livePages: false } });
  expect(screen.getByText(REACHES_EVERY_PAGE_IN_BROWSER)).toBeTruthy();
  expect(screen.queryByText(REACHES_EVERY_PAGE)).toBe(null);
});

test("every value is labelled, each limit said, and one line says what a change does", () => {
  draw();
  expect(screen.getByRole("heading", { name: "Header and footer" })).toBeTruthy();
  expect(screen.getByText(REACHES_EVERY_PAGE)).toBeTruthy();
  expect((screen.getByLabelText("Site name") as HTMLInputElement).value).toBe("Slack Water");
  expect(screen.getByLabelText("Site name").getAttribute("aria-describedby")).toBeTruthy();
  expect(screen.getByText("Beside the site’s mark, which stays the design’s. Up to 28 characters; on a phone, a long name puts Menu on a row of its own.")).toBeTruthy();
  expect(screen.getByText("Up to 8 links, each up to 24 characters. Where they do not fit the bar, they fold into Menu.")).toBeTruthy();
  expect(links().map((group) => [(within(group).getByLabelText("Text") as HTMLInputElement).value, (within(group).getByLabelText("Link") as HTMLInputElement).value])).toEqual([
    ["Swims", "/#swims"], ["Gallery", "/#gallery"], ["Meet us", "/#meet"],
  ]);
  // What an address may be is shown once, and said with every link's.
  const linkHint = "Choose a page or a section of one, or paste a full address (https://…), mailto: or tel:.";
  // Under the menu, and under the button's own address.
  expect(screen.getAllByText(linkHint)).toHaveLength(2);
  for (const group of links()) expect(describedText(within(group).getByLabelText("Link"))).toBe(linkHint);
  const button = screen.getByRole("group", { name: "Button" });
  expect((within(button).getByLabelText("Text") as HTMLInputElement).value).toBe("Join");
  expect(within(button).getByText("Up to 18 characters.")).toBeTruthy();
  const footer = screen.getByRole("group", { name: "Footer" });
  expect((within(footer).getByLabelText("Bold words") as HTMLInputElement).value).toBe("Slack Water swimming club.");
  expect((within(footer).getByLabelText("Words after them") as HTMLTextAreaElement).value).toBe("Tide times are a guide, not a promise.");
  expect(within(footer).getByText(/Up to 80 characters\./)).toBeTruthy();
  expect(within(footer).getByText(/Up to 160 characters\./)).toBeTruthy();
  // Nothing changed: nothing to save.
  expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
});

test("a value typed goes to the canvas at once, and to the session only on Save, whole", async () => {
  const { kit, saves } = draw();
  fireEvent.change(screen.getByLabelText("Site name"), { target: { value: "Samphire Bay Swimmers" } });
  expect(kit.ui.getState().siteDraft?.name).toBe("Samphire Bay Swimmers");
  expect(saves).toEqual([]);
  expect(screen.getByText("Not saved yet")).toBeTruthy();
  // Typed back to what is stored: no change waits.
  fireEvent.change(screen.getByLabelText("Site name"), { target: { value: "Slack Water" } });
  expect(kit.ui.getState().siteDraft).toBeNull();
  fireEvent.change(screen.getByLabelText("Site name"), { target: { value: "Samphire Bay Swimmers" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  });
  expect(saves).toEqual([{ values: { name: "Samphire Bay Swimmers", menu: site.menu, action: site.action, footer: site.footer }, from: undefined }]);
});

test("a link is added with the focus on its words, up to eight, and the ninth is said, not offered", async () => {
  const { kit } = draw();
  fireEvent.click(screen.getByRole("button", { name: "Add a link" }));
  expect(links()).toHaveLength(4);
  await waitFor(() => expect(document.activeElement).toBe(within(linkGroup(4)).getByLabelText("Text")));
  expect(kit.ui.getState().siteDraft?.menu.at(-1)).toEqual({ label: "", href: "" });
  for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole("button", { name: "Add a link" }));
  expect(links()).toHaveLength(8);
  const add = screen.getByRole("button", { name: "Add a link" });
  expect(add.getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByText("8 links, the most the header holds.")).toBeTruthy();
  fireEvent.click(add);
  expect(links()).toHaveLength(8);
});

test("a link moves up and down by its named buttons, the focus on the same button, at an end on the other", async () => {
  const { kit } = draw();
  const order = () => kit.ui.getState().siteDraft?.menu.map((l) => l.label);
  fireEvent.click(screen.getByRole("button", { name: "Move Gallery up" }));
  expect(order()).toEqual(["Gallery", "Swims", "Meet us"]);
  // At the top, Move up does nothing more: the focus is on Move down.
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Move Gallery down" })));
  expect(screen.getByRole("button", { name: "Move Gallery up" }).getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Move Gallery up" }));
  expect(order()).toEqual(["Gallery", "Swims", "Meet us"]);
  fireEvent.click(screen.getByRole("button", { name: "Move Swims down" }));
  expect(order()).toEqual(["Gallery", "Meet us", "Swims"]);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Move Swims up" })));
  // Said to a screen reader, which the focus moving with the link does not.
  expect(document.querySelector(".tray-body > [role=status]")?.textContent).toBe("Swims moved down: link 3 of 3.");
});

test("a link taken away leaves the focus on the one that took its place, then on Add a link when none is left", async () => {
  const { kit } = draw();
  fireEvent.click(screen.getByRole("button", { name: "Remove Gallery" }));
  expect(kit.ui.getState().siteDraft?.menu.map((l) => l.label)).toEqual(["Swims", "Meet us"]);
  await waitFor(() => expect(document.activeElement).toBe(within(linkGroup(2)).getByLabelText("Text")));
  expect((document.activeElement as HTMLInputElement).value).toBe("Meet us");
  fireEvent.click(screen.getByRole("button", { name: "Remove Meet us" }));
  await waitFor(() => expect((document.activeElement as HTMLInputElement).value).toBe("Swims"));
  fireEvent.click(screen.getByRole("button", { name: "Remove Swims" }));
  expect(screen.getByText("No links: the header has no menu.")).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add a link" })));
});

test("the button is taken away, said as none, and brought back as it was", async () => {
  const { kit } = draw();
  fireEvent.click(screen.getByRole("button", { name: "Remove the button" }));
  expect(kit.ui.getState().siteDraft?.action).toBeNull();
  expect(screen.getByText("No button in the header.")).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add a button" })));
  fireEvent.click(screen.getByRole("button", { name: "Add a button" }));
  expect(kit.ui.getState().siteDraft).toBeNull();
  await waitFor(() => expect((document.activeElement as HTMLInputElement).value).toBe("Join"));
});

test("a refusal is said at each value at fault and in the head, and goes once the value changes", async () => {
  const errors: FieldError[] = [{ pointer: "/menu/1/href", keyword: "pattern", blockPointer: null, message: "does not match the pattern" }];
  const failed: SiteSave = { phase: "failed", message: "Not saved: every page keeps the header and footer it had. Put right what is marked below.", marked: true };
  const { kit } = draw({ siteSave: failed });
  act(() => kit.ui.getState().setSiteErrors(errors));
  const field = within(linkGroup(2)).getByLabelText("Link");
  expect(field.getAttribute("aria-invalid")).toBe("true");
  expect(within(linkGroup(2)).getByText("Use a full address (https://…), a path on this site (/…), #anchor, mailto: or tel:.")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toBe(failed.message);
  fireEvent.change(field, { target: { value: "/gallery" } });
  expect(field.getAttribute("aria-invalid")).toBeNull();
  // Each value marked has changed: the head says where the change is.
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Not saved yet")).toBeTruthy();

  // A refusal at a value no field holds is said above the values, in the
  // storage's words, and the head's line stays.
  act(() => kit.ui.getState().setSiteErrors([{ pointer: "/action", keyword: "type", blockPointer: null, message: "The button must be a link or none." }]));
  expect(document.querySelector(".tray-body .error")?.textContent).toBe("The button must be a link or none.");
  expect(screen.getByRole("alert").textContent).toBe(failed.message);
});

test("a value past its limit is said as it is typed; an empty one once the person leaves it", () => {
  draw();
  const name = screen.getByLabelText("Site name");
  fireEvent.change(name, { target: { value: "N".repeat(29) } });
  expect(name.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getAllByText("Up to 28 characters.").some((e) => e.closest(".error"))).toBe(true);
  const lead = screen.getByLabelText("Bold words");
  fireEvent.change(lead, { target: { value: "" } });
  expect(lead.getAttribute("aria-invalid")).toBeNull();
  fireEvent.blur(lead);
  expect(lead.getAttribute("aria-invalid")).toBe("true");
  expect(within(screen.getByRole("group", { name: "Footer" })).getByText("This cannot be empty.")).toBeTruthy();
});

test("a conflict with another tab's save offers Reload and Keep mine, which saves this tab's values from the revision it named", async () => {
  let reloaded = 0;
  const conflict: SiteSave = { phase: "conflict", revision: 6, theirs: { ...site, name: "Shingle Cove Swimmers" } };
  const { saves } = draw({ siteSave: conflict, reloadSite: async () => { reloaded += 1; } });
  fireEvent.change(screen.getByLabelText("Site name"), { target: { value: "Samphire Bay Swimmers" } });
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toContain("Changed in another tab.");
  // The warning icon the page's own conflict has (SaveStatus), before the
  // words and hidden from a screen reader, which hears the words.
  expect(alert.firstElementChild?.tagName.toLowerCase()).toBe("svg");
  expect(alert.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  await act(async () => {
    fireEvent.click(within(alert).getByRole("button", { name: "Keep mine" }));
  });
  expect(saves).toEqual([{ values: expect.objectContaining({ name: "Samphire Bay Swimmers" }), from: 6 }]);
  await act(async () => {
    fireEvent.click(within(alert).getByRole("button", { name: "Reload" }));
  });
  expect(reloaded).toBe(1);
});

test("a link is offered the site's pages, the sections of the page edited and those of the home page, by their page's address", async () => {
  draw();
  const list = () => [...document.querySelectorAll("datalist option")].map((o) => [o.getAttribute("value"), o.textContent]);
  await waitFor(() => expect(list()).toContainEqual(["/#swims", "Home, Swims section"]));
  expect(list()).toEqual(expect.arrayContaining([["/", "Home"], ["/winter-series", "Winter series"]]));
  // The page edited: its sections with an anchor, from its document.
  expect(list().filter(([value]) => value?.startsWith("/winter-series#"))).toEqual([["/winter-series#join", "Winter series, Join section"]]);
  const input = within(linkGroup(1)).getByLabelText("Link");
  expect(input.getAttribute("list")).toBe(document.querySelector("datalist")!.id);
});

test("the way back to the Page tab closes it", () => {
  const { closed } = draw();
  fireEvent.click(screen.getByRole("button", { name: "Back to Page" }));
  expect(closed()).toBe(1);
});
