// Site style, the one screen that changes the site's tokens: the palette's
// slots with only their curated tones, each change handed to the session
// whole (every slot and the type scale, as the CMS takes it); the contrast
// of a tone said in words where the site uses it; back to a new site's
// tone; the type scale, chosen by click or arrows, its steps read from the
// tokens.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import tokens from "../../../schema/tokens.json";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import type { SiteStyle, SiteStyleChange } from "../storage/adapter.ts";
import { contrastRatio } from "../shared/site-tokens.ts";
import { contrastWords, ratioWords, SiteStylePanel } from "./SiteStylePanel.tsx";

// The site style as the CMS answers it, from the tokens.
function siteStyle(palette: Record<string, string> = {}, typeScale = "balanced"): SiteStyle {
  const tones = tokens["site-tones"];
  const slots = ["text", "background", "primary", "accent", "soft", "muted"] as const;
  const colors: Record<string, string> = tokens.color;
  return {
    palette: Object.fromEntries(slots.map((slot) => [slot, palette[slot] ?? tones[slot].default])),
    typeScale,
    updatedAt: null,
    choices: {
      palette: Object.fromEntries(slots.map((slot) => [slot, tones[slot].tones.map((t) => ({ color: t.color, label: t.label, hex: colors[t.color]! }))])),
      typeScales: tokens["site-type-scale"].choices.map((c) => ({ name: c.name, label: c.label })),
    },
  };
}

function draw(style: SiteStyle = siteStyle()) {
  const changes: SiteStyleChange[] = [];
  let closed = 0;
  const kit = editorKit({ document: page(), session: { saveSiteStyle: (change) => { changes.push(change); } } });
  kit.ui.getState().setSiteStyle(style);
  kit.render(<SiteStylePanel onClose={() => { closed += 1; }} />);
  return { kit, changes, closed: () => closed };
}

test("the slots with one tone are rows, the others open on their curated tones, and a choice goes whole to the session", () => {
  const { changes } = draw();
  expect(screen.getByRole("heading", { name: "Site style" })).toBeTruthy();
  // Text, Background, Soft and Muted have one tone each: nothing to press.
  expect(screen.getAllByRole("button", { expanded: false }).map((b) => b.querySelector(".slot-name")?.firstChild?.textContent)).toEqual(["Primary", "Accent"]);
  fireEvent.click(screen.getByRole("button", { name: /^Primary/ }));
  const tones = screen.getByRole("radiogroup", { name: "Primary color" });
  expect(within(tones).getAllByRole("radio").map((r) => [r.textContent, r.getAttribute("aria-checked")])).toEqual([["Sea", "true"], ["Harbour", "false"], ["Kelp", "false"], ["Basalt", "false"]]);
  fireEvent.click(within(tones).getByRole("radio", { name: "Harbour" }));
  expect(changes).toEqual([{ palette: { text: "site-ink", background: "site-paper", primary: "site-harbour", accent: "site-buoy", soft: "site-shallows", muted: "site-slate" }, typeScale: "balanced" }]);
});

test("an edited slot says what it was, reads its contrast in words, and resets to a new site's tone", () => {
  const { changes } = draw(siteStyle({ primary: "site-harbour" }));
  const slot = screen.getByRole("button", { name: /^Primary/ });
  expect(slot.textContent).toBe("PrimaryHarbourEdited, was Sea");
  fireEvent.click(slot);
  // Harbour on white is 8.86 to 1: cut to 8.8, where the design rounded to 8.9.
  const checks = screen.getByRole("list", { name: "Contrast checks" });
  expect(within(checks).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
    "Button text on it: 8.8 to 1, easy to read",
    "Links on the background: 8.8 to 1, easy to read",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Reset to Sea" }));
  expect(changes.at(-1)!.palette.primary).toBe("site-sea");
});

test("every curated tone reads at least 4.5 to 1 where the site puts it", () => {
  const colors: Record<string, string> = tokens.color;
  for (const tone of tokens["site-tones"].primary.tones) {
    expect(contrastWords(contrastRatio(colors[tone.color]!, colors["site-paper"]!)).passes, tone.label).toBe(true);
  }
  for (const tone of tokens["site-tones"].accent.tones) {
    expect(contrastWords(contrastRatio(colors["site-ink"]!, colors[tone.color]!)).passes, tone.label).toBe(true);
  }
  // Cut, never rounded up: 4.48 is not readable text.
  expect(contrastWords(4.48)).toEqual({ words: "4.4 to 1, for large text only", passes: false });
  expect(contrastWords(2.1)).toEqual({ words: "2.1 to 1, hard to read", passes: false });
});

test("the type scale is three choices, the arrows move it, and its steps are the tokens'", () => {
  const { changes } = draw();
  const group = screen.getByRole("radiogroup", { name: "Contrast between sizes" });
  expect(within(group).getAllByRole("radio").map((r) => [r.textContent, r.getAttribute("aria-checked"), r.tabIndex])).toEqual([["Gentle", "false", -1], ["Balanced", "true", 0], ["Strong", "false", -1]]);
  const steps = () => [...document.querySelectorAll(".scale li")].map((li) => `${li.querySelector(".scale-name")?.textContent} ${li.querySelector(".scale-num")?.textContent}`);
  expect(steps()).toEqual(["Display : 76 px", "Heading 1 : 56 px", "Heading 2 : 42 px", "Heading 3 : 32 px", "Large text : 24 px", "Body : 18 px", "Small : 14 px"]);
  expect(document.querySelector(".scale li")?.getAttribute("title")).toBe("76 px in a wide window, line height 76");
  expect(screen.getByText(/^Balanced: each size is about a third larger than the next\./)).toBeTruthy();

  act(() => {
    fireEvent.keyDown(within(group).getByRole("radio", { name: "Balanced" }), { key: "ArrowRight" });
  });
  expect(changes.at(-1)!.typeScale).toBe("strong");
  fireEvent.click(within(group).getByRole("radio", { name: "Gentle" }));
  expect(changes.at(-1)!.typeScale).toBe("gentle");
  expect(ratioWords(1.2)).toBe("a fifth");
  expect(ratioWords(1.414)).toBe("two fifths");
});

test("the close button closes it, and the session's word on the last change is said in the head", () => {
  const { closed } = draw();
  fireEvent.click(screen.getByRole("button", { name: "Close site style" }));
  expect(closed()).toBe(1);

  document.body.innerHTML = "";
  const kit = editorKit({ document: page(), session: { styleSave: { phase: "failed", message: "Not saved, the site keeps its style as it was: no answer." } } });
  kit.ui.getState().setSiteStyle(siteStyle());
  kit.render(<SiteStylePanel onClose={() => {}} />);
  expect(screen.getByRole("alert").textContent).toBe("Not saved, the site keeps its style as it was: no answer.");
});
