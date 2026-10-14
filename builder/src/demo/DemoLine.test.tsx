// The demo's line (./DemoLine.tsx): who made it is a link to the author's
// site; its key shuts the line down to who made it and opens it again, the
// browser keeping the choice, and a browser that keeps nothing still
// shuts and opens it; an offer of a newer example site shows either way.
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AUTHOR_ADDRESS, DemoLine, SHUT_KEY, SOURCE_ADDRESS, seedNews } from "./DemoLine.tsx";

beforeEach(() => localStorage.removeItem(SHUT_KEY));
afterEach(() => vi.restoreAllMocks());

const LINE = "Browser demo: drafts stay in this browser. The full CMS runs on Rails 8, with publishing, shared versions and caching. Source on GitHub. Developed by Riccardo Sapuppo";
const line = () => screen.getByRole("complementary", { name: "About this demo" });
const key = () => screen.getByRole("button", { name: "About this demo" });
const words = (element: HTMLElement) => (element.textContent ?? "").replace(/\s+/g, " ").trim();

test("who made it is a link to the author's site, the face and the words with it; the source a link to the repository", () => {
  render(<DemoLine />);
  expect(words(line())).toBe(LINE);
  const author = screen.getByRole("link", { name: "Developed by Riccardo Sapuppo" });
  expect(author.getAttribute("href")).toBe(AUTHOR_ADDRESS);
  expect(AUTHOR_ADDRESS).toBe("https://riccardosapuppo.com");
  expect(author.getAttribute("rel")).toBe("author");
  expect(author.querySelector("img")?.getAttribute("alt"), "the face says nothing the words do not").toBe("");
  expect(screen.getByRole("link", { name: "Source on GitHub" }).getAttribute("href")).toBe(SOURCE_ADDRESS);
});

test("its key shuts the line down to who made it and opens it again; the browser keeps the choice for the next visit", () => {
  const { unmount } = render(<DemoLine />);
  expect(key().getAttribute("aria-expanded")).toBe("true");
  const controlled = document.getElementById(key().getAttribute("aria-controls")!);
  expect(controlled?.textContent, "the key names the words it shuts").toContain("Browser demo: drafts stay in this browser.");
  expect(key().getAttribute("title")).toBe("Hide what this demo is");

  fireEvent.click(key());
  expect(words(line())).toBe("Developed by Riccardo Sapuppo");
  expect(key().getAttribute("aria-expanded")).toBe("false");
  expect(key().hasAttribute("aria-controls"), "no words to name while they are not there").toBe(false);
  expect(key().getAttribute("title")).toBe("Show what this demo is");
  expect(line().hasAttribute("data-shut")).toBe(true);
  expect(screen.getByRole("link", { name: "Developed by Riccardo Sapuppo" }).getAttribute("href")).toBe(AUTHOR_ADDRESS);
  expect(localStorage.getItem(SHUT_KEY)).toBe("shut");
  unmount();

  render(<DemoLine />);
  expect(words(line()), "shut on the next visit").toBe("Developed by Riccardo Sapuppo");
  fireEvent.click(key());
  expect(words(line())).toBe(LINE);
  expect(key().getAttribute("aria-expanded")).toBe("true");
  expect(line().hasAttribute("data-shut")).toBe(false);
  expect(localStorage.getItem(SHUT_KEY), "open again, the browser keeps nothing").toBeNull();
});

test("a browser that keeps nothing: the key still shuts and opens the line, and each visit starts with it open", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
  });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  });
  const { unmount } = render(<DemoLine />);
  expect(words(line())).toBe(LINE);
  fireEvent.click(key());
  expect(words(line())).toBe("Developed by Riccardo Sapuppo");
  fireEvent.click(key());
  expect(words(line())).toBe(LINE);
  fireEvent.click(key());
  unmount();
  render(<DemoLine />);
  expect(words(line())).toBe(LINE);
});

test("an offer of a newer example site shows with the line shut, its buttons with it", () => {
  localStorage.setItem(SHUT_KEY, "shut");
  const news = seedNews();
  news.set("newer kept");
  render(<DemoLine news={news} startOver={() => Promise.resolve()} />);
  expect(words(line())).not.toContain("Browser demo");
  expect(words(line())).toContain("Developed by Riccardo Sapuppo");
  expect(words(line())).toContain("A newer example site is out; this browser kept the pages you changed. Start over with it");
  fireEvent.click(screen.getByRole("button", { name: "Start over with it" }));
  expect(screen.getByRole("button", { name: "Keep my pages" })).toBeTruthy();
});
