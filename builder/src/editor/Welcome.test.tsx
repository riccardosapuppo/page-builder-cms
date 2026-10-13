// The page's place beside its title (./PageSwitch.tsx) and the first-run
// note under it (./Welcome.tsx): what is open and where its changes go, on
// the CMS and in the browser demo; Got it closes it for good in that
// browser; it is not drawn while the list of pages is open.
// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import { TopBar } from "./TopBar.tsx";
import { WELCOME_KEY } from "./welcome-key.ts";

// The test setup closes the note for every other test: these open it.
beforeEach(() => localStorage.removeItem(WELCOME_KEY));

const links = (id: number) => ({ preview: `/preview/${id}`, live: null });
const home = { id: 1, kind: "page" as const, slug: "home", home: true, published: null, revision: 0, links: links(1) };
const winter = { ...home, id: 2, slug: "winter-series", home: false, links: links(2) };
const header = { ...home, id: 7, kind: "header" as const, slug: null, home: false, links: links(7) };
const note = () => screen.queryByRole("region", { name: "What you are editing" });

test("beside the title, where the page is: the home page, its address, or every page for a part", () => {
  for (const [current, where] of [[home, "home page"], [winter, "/winter-series"], [header, "every page"]] as const) {
    localStorage.setItem(WELCOME_KEY, "seen");
    const kit = editorKit({ document: page(), session: { current } });
    const { unmount } = kit.render(<TopBar />);
    const title = screen.getByRole("button", { name: /^Switch page\. Open: / });
    const [whereId] = title.getAttribute("aria-describedby")!.split(" ");
    expect(document.getElementById(whereId!)?.textContent, current.slug ?? current.kind).toBe(where);
    unmount();
  }
});

test("the first time, a note says what is open and that changes go live with Publish, on the site's address; Got it closes it for good", () => {
  const kit = editorKit({ document: page(), session: { current: home } });
  const { unmount } = kit.render(<TopBar />);
  const shown = note()!;
  expect(shown.textContent).toContain(`The draft of the home page, “${page().title}”.`);
  expect(shown.textContent).toContain("Visitors see them only once you press Publish, on the site at");
  expect(screen.getByRole("link", { name: "127.0.0.1:3900" }).getAttribute("href")).toBe("http://127.0.0.1:3900/");
  expect(document.activeElement, "it takes no focus").toBe(document.body);
  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  expect(note()).toBeNull();
  expect(localStorage.getItem(WELCOME_KEY)).toBe("seen");
  unmount();

  kit.render(<TopBar />);
  expect(note(), "not again in this browser").toBeNull();
});

test("in the browser demo the note says the changes stay in this browser and nothing goes online", () => {
  const kit = editorKit({
    document: page(),
    session: { current: winter, cmsOrigin: null, capabilities: { publish: true, schedule: false, responses: false, imageVariants: false, livePages: false } },
  });
  kit.render(<TopBar />);
  expect(note()!.textContent).toContain(`The draft of “${page().title}”, at /winter-series.`);
  expect(note()!.textContent).toContain("Publish keeps them as the published version, here in this browser: nothing goes online.");
  expect(screen.queryByRole("link", { name: /127\.0\.0\.1/ })).toBeNull();
});

test("the note waits while the list of pages is open, where it would be, and is back when the list closes", () => {
  const kit = editorKit({ document: page(), session: { current: header } });
  kit.render(<TopBar />);
  expect(note()!.textContent).toContain("The draft of the header, on every page.");
  const title = screen.getByRole("button", { name: /^Switch page\. Open: / });
  fireEvent.click(title);
  expect(note()).toBeNull();
  fireEvent.click(title);
  expect(note()).not.toBeNull();
});
