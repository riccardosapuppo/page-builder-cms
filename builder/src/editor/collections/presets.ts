// The sets of fields a new collection starts from (the design's three):
// Articles, with a summary, an image, a body and a date; Events, with a
// date, a place, a summary and an image; and Blank, with none. Each comes
// with the order its entries are listed in: the newest article first, the
// next event first, the latest change first. The fields are a start: the
// collection's settings change any of them later.
import type { CollectionSort, Field } from "../../shared/collection.ts";

export const PRESETS = ["articles", "events", "blank"] as const;
export type PresetId = (typeof PRESETS)[number];

export interface Preset {
  id: PresetId;
  name: string;
  fields: readonly Field[];
  sort: CollectionSort;
}

const field = (key: string, label: string, type: "paragraph" | "image" | "richText" | "date" | "text"): Field => ({ key, label, type, required: false });

export const PRESET_FIELDS: Readonly<Record<PresetId, Preset>> = {
  articles: {
    id: "articles",
    name: "Articles",
    fields: [field("summary", "Summary", "paragraph"), field("image", "Image", "image"), field("body", "Body", "richText"), field("date", "Date", "date")],
    sort: { by: "date", direction: "desc" },
  },
  events: {
    id: "events",
    name: "Events",
    fields: [field("date", "Date", "date"), field("place", "Place", "text"), field("summary", "Summary", "paragraph"), field("image", "Image", "image")],
    sort: { by: "date", direction: "asc" },
  },
  blank: {
    id: "blank",
    name: "Blank",
    fields: [],
    sort: { by: "updatedAt", direction: "desc" },
  },
};

// A preset's fields as a new collection takes them: copies, so a change
// to the collection's never reaches the preset.
export function presetFields(id: PresetId): Field[] {
  return PRESET_FIELDS[id].fields.map((f) => ({ ...f }));
}
