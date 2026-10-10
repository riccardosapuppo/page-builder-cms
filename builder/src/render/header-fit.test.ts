// Where the header's links fold (./header-fit.ts), on the cases the
// server's own test holds HeaderFit to (cms/test/models/header_fit_test.rb),
// from the example site's header as config/site.yml gives it. That the two
// add up the same on any header is header-fit.rails.test.ts's to show,
// through Ruby.
// @vitest-environment node
import { expect, test } from "vitest";
import { readSiteTheme } from "../../build/site-file.ts";
import { advanceOf, headerFold, METRICS as metrics, rubySum, runWidth, widthNeeded, type HeaderWords } from "./header-fit.ts";

const theme = readSiteTheme();
const defaults: HeaderWords = { name: theme.name as string, menu: theme.menu as HeaderWords["menu"], action: theme.action as HeaderWords["action"] };
const links = (...labels: string[]) => labels.map((label) => ({ label, href: "/" }));

test("the design's own header fits the bar from 800 up, so it names no fold", () => {
  expect(headerFold(defaults)).toBeNull();
  expect(Math.abs(widthNeeded(defaults) - 761)).toBeLessThanOrEqual(1);
});

test("a fifth link needs a wider bar: each count of links lands on the next width, until no bar holds them", () => {
  expect(headerFold({ ...defaults, menu: [...defaults.menu, ...links("Contact")] })).toBe("880");
  const folds = [1, 3, 4, 5, 6, 7, 8, 9].map((n) => headerFold({ ...defaults, menu: links(...Array.from({ length: n }, () => "Timetable")) }));
  expect(folds).toEqual([null, null, "880", "960", "1040", "1200", "1248", "all"]);
  expect(headerFold({ ...defaults, menu: links(...Array.from({ length: 8 }, () => "W".repeat(24))) })).toBe("all");
});

test("the name and the button count too, and with no links there is nothing to fold", () => {
  const menu = [...defaults.menu, ...links("Contact")];
  expect(headerFold({ ...defaults, menu, name: "The Northfield Swimming Club" })).toBe("1120");
  expect(headerFold({ ...defaults, menu, action: null })).toBeNull();
  expect(headerFold({ ...defaults, menu: [], name: "W".repeat(28) })).toBeNull();
});

test("a character neither the face nor a script has a measure for counts 1.5 times the font size, wider than any letter of the face", () => {
  const link = metrics.link;
  expect(link.otherwise).toBe(link.size * 1.5);
  expect(link.otherwise).toBeGreaterThan(Math.max(...Object.values(link.advances)));
  for (const character of ["🌊", "\u{FDFD}", "→", "΅", "Ϗ"]) expect(advanceOf(link, character), character).toBe(link.otherwise);
});

test("the letters of the scripts the file measured count what they were drawn at, less than a character nothing measured", () => {
  for (const place of [metrics.brand, metrics.link, metrics.button]) {
    expect(place.scripts.map((script) => script.name)).toEqual(["Greek", "Cyrillic", "Hebrew", "Arabic", "CJK"]);
    for (const script of place.scripts) {
      expect(script.advance, script.name).toBeGreaterThan(0);
      expect(script.advance, script.name).toBeLessThan(place.otherwise);
      const widths = Object.values(script.letters);
      if (widths.length > 0) expect(script.advance, script.name).toBe(Math.max(...widths));
    }
  }
  const scripts = Object.fromEntries(metrics.link.scripts.map((script) => [script.name, script]));
  // Greek, Cyrillic, Hebrew and Arabic list each of their letters: a letter counts its own width.
  for (const [name, letter] of [["Greek", "Ω"], ["Cyrillic", "Щ"], ["Hebrew", "ש"], ["Arabic", "ض"]] as const) {
    expect(advanceOf(metrics.link, letter), name).toBe(scripts[name]!.letters[letter]);
  }
  // A code point of a script's range that is no letter listed (an unassigned
  // one) counts the script's widest, and CJK, which lists none, counts it
  // for every ideograph, kana, Hangul syllable and fullwidth form.
  expect(advanceOf(metrics.link, "΋")).toBe(scripts.Greek!.advance);
  for (const character of ["日", "本", "の", "한", "！", "　"]) expect(advanceOf(metrics.link, character), character).toBe(scripts.CJK!.advance);
  expect(scripts.CJK!.advance).toBeLessThan(metrics.link.otherwise);
});

// The Hebrew, Greek, Cyrillic, Arabic or CJK header as short as it is: the
// same four links, a name and a button, whose letters are no wider than a
// Latin header's, keep their links in the bar from the design's 800 up. Each
// letter counted at 1.5 em folded the Hebrew one below 1200 and the Greek
// one at every width.
test("short headers in Hebrew, Greek, Cyrillic, Arabic and CJK keep their links in the bar from 800 up, as the design's does", () => {
  const one = (name: string, labels: string[], action: string): HeaderWords => ({ name, menu: links(...labels), action: { label: action } });
  const headers: Record<string, HeaderWords> = {
    Hebrew: one("מים שקטים", ["שחייה", "גלריה", "עלינו", "שאלות"], "הצטרפו"),
    Greek: one("Ήρεμα νερά", ["Κολύμπι", "Εικόνες", "Εμείς", "Ερωτήσεις"], "Γραφτείτε"),
    Cyrillic: one("Тихая вода", ["Заплывы", "Галерея", "Встречи", "Вопросы"], "Вступить"),
    Arabic: one("المياه الهادئة", ["السباحة", "المعرض", "لقاء", "أسئلة"], "انضم"),
    CJK: one("潮の会", ["泳ぎ方", "写真", "会合", "質問"], "参加する"),
  };
  for (const [name, header] of Object.entries(headers)) {
    expect(headerFold(header), name).toBeNull();
    expect(widthNeeded(header), name).toBeLessThanOrEqual(metrics.fold.breakpoint);
  }
});

test("a longer menu in another script folds below the width its letters need, and one no bar holds folds at every width", () => {
  const greek: HeaderWords = { name: "Ήρεμα νερά", menu: links("Κολύμπι", "Εικόνες", "Εμείς", "Ερωτήσεις", "Επικοινωνία", "Τιμές"), action: { label: "Γραφτείτε" } };
  expect(headerFold(greek)).toBe("1040");
  expect(headerFold({ name: "潮の会", menu: links(...Array.from({ length: 8 }, () => "日本語の案内です")), action: null })).toBe("all");
});

test("a combining accent adds nothing to its letter, as the face draws it", () => {
  expect(runWidth(metrics.brand, "Café")).toBeCloseTo(runWidth(metrics.brand, "Cafe"), 9);
});

test("a run of floats adds up as Ruby's sum does, compensated, not as a loop of + does", () => {
  // 0.1 + 0.2 + 0.3 is 0.6000000000000001 added in turn; Ruby's
  // [0.1, 0.2, 0.3].sum is 0.6.
  expect([0.1, 0.2, 0.3].reduce((a, b) => a + b, 0)).not.toBe(0.6);
  expect(rubySum([0.1, 0.2, 0.3])).toBe(0.6);
  expect(rubySum([3, 1e100, -1e100])).toBe(3);
  expect(rubySum([])).toBe(0);
});
