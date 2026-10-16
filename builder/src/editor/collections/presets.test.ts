// The presets a new collection starts from (./presets.ts): four, Blank
// last; each a valid definition; Products the shop's, its price a number
// field from nothing to 100,000 and its stock the toggle the shop reads,
// which the shop's rules take as its products and their price.
import { expect, test } from "vitest";
import { checkShop, IN_STOCK_KEY } from "../../shared/shop.ts";
import { validateCollection } from "../../shared/validate.ts";
import { PRESET_FIELDS, PRESETS, presetFields } from "./presets.ts";

test("four presets, Blank last, each a valid collection", () => {
  expect(PRESETS.map((id) => PRESET_FIELDS[id].name)).toEqual(["Articles", "Events", "Products", "Blank"]);
  for (const id of PRESETS) {
    const checked = validateCollection({ name: PRESET_FIELDS[id].name, prefix: id, fields: presetFields(id), sort: { ...PRESET_FIELDS[id].sort } });
    expect(checked.valid ? [] : checked.errors, id).toEqual([]);
  }
});

test("Products: a summary, an image, a body, a price from nothing to 100,000 and whether it is in stock, by name; the shop's rules take it", () => {
  expect(presetFields("products")).toEqual([
    { key: "summary", label: "Summary", type: "paragraph", required: false },
    { key: "image", label: "Image", type: "image", required: false },
    { key: "body", label: "Body", type: "richText", required: false },
    { key: "price", label: "Price", type: "number", required: false, min: 0, max: 100_000 },
    { key: IN_STOCK_KEY, label: "In stock", type: "toggle", required: false },
  ]);
  expect(PRESET_FIELDS.products.sort).toEqual({ by: "title", direction: "asc" });
  const fields = presetFields("products");
  expect(checkShop({ enabled: true, currency: "GBP", productsCollectionId: 3, priceField: "price" }, (id) => (id === 3 ? { id, name: "Products", fields } : null)).ok).toBe(true);
  // A copy each time: a change to a collection's fields never reaches the preset.
  fields[0]!.label = "Changed";
  expect(PRESET_FIELDS.products.fields[0]?.label).toBe("Summary");
});
