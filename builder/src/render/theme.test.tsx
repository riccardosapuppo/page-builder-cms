// The site's header and footer as the canvas and the demo draw them
// (./theme.tsx): a menu too long for the bar carries the width it folds
// below, as the layout's header does; a menu with no link has no Menu to
// open; a link the page's rules refuse is left out, and with it the Menu
// when it was the only one. That the whole matches the CMS's layout,
// element for element, is ../../test/theme.rails.test.tsx's to show.
// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { SiteFooter, SiteHeader, type Site } from "./theme.tsx";

const site: Site = {
  name: "Slack Water",
  menu: [{ label: "Swims", href: "/#swims" }, { label: "Gallery", href: "/#gallery" }, { label: "Meet us", href: "/#meet" }, { label: "Questions", href: "/#questions" }],
  action: { label: "Join", href: "/#join" },
  footer: { lead: "Slack Water swimming club.", text: "Tide times are a guide, not a promise." },
};

const header = (value: Site) => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<SiteHeader site={value} />);
  return host.querySelector("header")!;
};

test("the design's header names no fold; a fifth link names the width its links fold below", () => {
  expect(header(site).hasAttribute("data-fold")).toBe(false);
  const longer = header({ ...site, menu: [...site.menu, { label: "Contact", href: "/contact" }] });
  expect(longer.getAttribute("data-fold")).toBe("880");
  expect([...longer.querySelectorAll(".sw-nav-links a")].map((a) => a.textContent)).toEqual(["Swims", "Gallery", "Meet us", "Questions", "Contact"]);
});

test("no links, no Menu; no button, no button", () => {
  const bare = header({ ...site, menu: [], action: null });
  expect(bare.querySelector(".sw-menu")).toBeNull();
  expect(bare.querySelector(".sw-btn")).toBeNull();
  expect(bare.querySelector(".sw-nav-links")!.children).toHaveLength(0);
  expect(header(site).querySelector(".sw-menu summary")!.textContent).toBe("Menu");
});

test("a link the page's rules refuse is left out, and a Menu that would hold nothing with it", () => {
  const refused = header({ ...site, menu: [{ label: "Run", href: "javascript:alert(1)" }] });
  expect(refused.querySelector(".sw-nav-links")!.children).toHaveLength(0);
  expect(refused.querySelector(".sw-menu")).toBeNull();
});

test("the footer's two lines run on as one paragraph, the lead in bold", () => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<SiteFooter site={site} />);
  expect(host.querySelector("footer p")!.innerHTML).toBe("<strong>Slack Water swimming club.</strong> Tide times are a guide, not a promise.");
});
