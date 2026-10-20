// Site style, the one screen that changes the site's tokens: the palette's
// slots with only their curated tones, each change handed to the session
// whole (every slot and the type scale, as the CMS takes it); the contrast
// of a tone said in words where the site uses it; back to a new site's
// tone; the type scale, chosen by click or arrows, its steps read from the
// tokens; the letter width, its samples drawn at it; and the style a new
// site replaced, put back in one click.
// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import tokens from "../../../schema/tokens.json";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import type { SiteStyle, SiteStyleChange } from "../storage/adapter.ts";
import { contrastRatio } from "../shared/site-tokens.ts";
import { COMMIT_AFTER_MS } from "./controls.tsx";
import { contrastWords, ratioWords, SiteStylePanel } from "./SiteStylePanel.tsx";

// The site style as the CMS answers it, from the tokens.
function siteStyle(palette: Record<string, string> = {}, typeScale = "balanced"): SiteStyle {
  const tones = tokens["site-tones"];
  const slots = ["text", "background", "primary", "accent", "soft", "muted"] as const;
  const colors: Record<string, string> = tokens.color;
  return {
    palette: Object.fromEntries(slots.map((slot) => [slot, palette[slot] ?? tones[slot].default])),
    typeScale,
    letterWidth: "normal",
    customCss: "",
    updatedAt: null,
    kept: null,
    choices: {
      palette: Object.fromEntries(slots.map((slot) => [slot, tones[slot].tones.map((t) => ({ color: t.color, label: t.label, hex: colors[t.color]! }))])),
      typeScales: tokens["site-type-scale"].choices.map((c) => ({ name: c.name, label: c.label })),
      letterWidths: tokens["site-letter-width"].choices.map((c) => ({ name: c.name, label: c.label })),
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

test("the style a new site replaced is put back in one click, which lets it go; with none kept, there is no such key", () => {
  const before = { palette: siteStyle().palette, typeScale: "balanced", letterWidth: "normal", keptAt: "2026-10-20T09:00:00.000Z" };
  const { changes } = draw({ ...siteStyle({ primary: "#b3361b", background: "#f7f5f0" }, "strong"), letterWidth: "wide", kept: before });
  expect(screen.getByText("The style this site had before the Assistant's new site is kept.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Put the old style back" }));
  expect(changes).toEqual([{ palette: before.palette, typeScale: "balanced", letterWidth: "normal", kept: "none" }]);
  cleanup();
  draw();
  expect(screen.queryByRole("button", { name: "Put the old style back" })).toBeNull();
});

test("every slot opens on its curated tones and the palette, Custom last, and a choice goes whole to the session", () => {
  const { changes } = draw();
  expect(screen.getByRole("heading", { name: "Site style" })).toBeTruthy();
  // Every slot, those with one curated tone too: a colour of the site's
  // own can go in any of them.
  expect(screen.getAllByRole("button", { expanded: false }).map((b) => b.querySelector(".slot-name")?.firstChild?.textContent)).toEqual(["Text", "Background", "Primary", "Accent", "Soft", "Muted"]);
  fireEvent.click(screen.getByRole("button", { name: /^Primary/ }));
  const tones = screen.getByRole("radiogroup", { name: "Primary color" });
  expect(within(tones).getAllByRole("radio").map((r) => [r.textContent, r.getAttribute("aria-checked")])).toEqual([["Signal", "true"], ["Sea", "false"], ["Harbour", "false"], ["Kelp", "false"], ["Basalt", "false"]]);
  // Under the tones, the palette: its nineteen hues, none in use, and the
  // tile that opens the picker.
  const palette = within(screen.getByRole("group", { name: "Primary: swatches" })).getAllByRole("button");
  expect(palette).toHaveLength(20);
  expect(palette.filter((b) => b.getAttribute("aria-pressed") === "true")).toEqual([]);
  expect(palette.at(-1)!.getAttribute("aria-label")).toBe("A colour of its own");
  fireEvent.click(within(tones).getByRole("radio", { name: "Harbour" }));
  expect(changes).toEqual([{ palette: { text: "site-deep-water", background: "site-paper", primary: "site-harbour", accent: "site-buoy", soft: "site-shallows", muted: "site-slate" }, typeScale: "balanced", letterWidth: "normal" }]);
});

test("an edited slot says what it was, reads its contrast in words, and resets to a new site's tone", () => {
  const { changes } = draw(siteStyle({ primary: "site-harbour" }));
  const slot = screen.getByRole("button", { name: /^Primary/ });
  expect(slot.textContent).toBe("PrimaryHarbourEdited, was Signal");
  fireEvent.click(slot);
  // Harbour on white is 8.86 to 1: cut to 8.8, where the design rounded to 8.9.
  const checks = screen.getByRole("list", { name: "Contrast checks" });
  expect(within(checks).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
    "Button text on it: 8.8 to 1, easy to read",
    "Links on the background: 8.8 to 1, easy to read",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Reset to Signal" }));
  expect(changes.at(-1)!.palette.primary).toBe("site-signal");
});

test("a tone chosen in the pause after the picker's arrows wins, and a colour kept after the pause keeps the type scale chosen in it", async () => {
  const changes: SiteStyleChange[] = [];
  // The session as the editor's: the panel shows a change at once.
  const kit = editorKit({
    document: page(),
    session: {
      saveSiteStyle: (change) => {
        changes.push(change);
        const { kept: _kept, ...rest } = change;
        kit.ui.getState().setSiteStyle({ ...kit.ui.getState().siteStyle!, ...rest });
      },
    },
  });
  kit.ui.getState().setSiteStyle(siteStyle());
  kit.render(<SiteStylePanel onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /^Primary/ }));
  const pick = () => {
    fireEvent.click(within(screen.getByRole("group", { name: "Primary: swatches" })).getByRole("button", { name: "A colour of its own" }));
    fireEvent.keyDown(screen.getByRole("slider", { name: "Primary: saturation and brightness" }), { key: "ArrowLeft", shiftKey: true });
  };
  pick();
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Primary color" })).getByRole("radio", { name: "Harbour" }));
  await act(() => kit.clock.advance(COMMIT_AFTER_MS));
  expect(changes.map((change) => change.palette.primary)).toEqual(["site-harbour"]);
  // The picker again, and the type scale in the pause: the colour kept
  // after it goes with the new scale, not the one it was picked under.
  pick();
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Contrast between sizes" })).getByRole("radio", { name: "Strong" }));
  await act(() => kit.clock.advance(COMMIT_AFTER_MS));
  expect(changes.map((change) => change.typeScale)).toEqual(["balanced", "strong", "strong"]);
  expect(changes.at(-1)!.palette.primary).toMatch(/^#[0-9a-f]{6}$/);
});

test("every curated tone reads at least 4.5 to 1 where the site puts it", () => {
  const colors: Record<string, string> = tokens.color;
  for (const tone of tokens["site-tones"].primary.tones) {
    expect(contrastWords(contrastRatio(colors[tone.color]!, colors["site-paper"]!)).passes, tone.label).toBe(true);
  }
  for (const text of tokens["site-tones"].text.tones) {
    for (const tone of tokens["site-tones"].accent.tones) {
      expect(contrastWords(contrastRatio(colors[text.color]!, colors[tone.color]!)).passes, `${text.label} on ${tone.label}`).toBe(true);
    }
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

test("the letter width is four choices, Normal on; a choice goes whole to the session, and the type scale's samples are drawn at its width", () => {
  const { kit, changes } = draw();
  const group = screen.getByRole("radiogroup", { name: "How wide the Headings typeface is drawn" });
  expect(within(group).getAllByRole("radio").map((r) => [r.textContent, r.getAttribute("aria-checked")])).toEqual([["Narrow", "false"], ["Normal", "true"], ["Wide", "false"], ["Widest", "false"]]);
  const sans = () => [...document.querySelectorAll<HTMLElement>(".scale li .scale-aa:not(.serif)")].map((aa) => aa.style.fontStretch);
  expect(sans()).toEqual(["100%", "100%", "100%", "100%"]);

  fireEvent.click(within(group).getByRole("radio", { name: "Widest" }));
  expect(changes.at(-1)).toEqual({ palette: siteStyle().palette, typeScale: "balanced", letterWidth: "widest" });
  // As the session shows a change at once: the samples follow it.
  act(() => kit.ui.getState().setSiteStyle({ ...siteStyle(), letterWidth: "widest" }));
  expect(sans()).toEqual(["125%", "125%", "125%", "125%"]);
  // A change of the type scale keeps the letter width.
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Contrast between sizes" })).getByRole("radio", { name: "Strong" }));
  expect(changes.at(-1)).toMatchObject({ typeScale: "strong", letterWidth: "widest" });
});

test("the way back to the Page tab closes it, and the session's word on the last change is said in the head", () => {
  const { closed } = draw();
  fireEvent.click(screen.getByRole("button", { name: "Back to Page" }));
  expect(closed()).toBe(1);

  document.body.innerHTML = "";
  const kit = editorKit({ document: page(), session: { styleSave: { phase: "failed", message: "Not saved, the site keeps its style as it was: no answer." } } });
  kit.ui.getState().setSiteStyle(siteStyle());
  kit.render(<SiteStylePanel onClose={() => {}} />);
  expect(screen.getByRole("alert").textContent).toBe("Not saved, the site keeps its style as it was: no answer.");
});
