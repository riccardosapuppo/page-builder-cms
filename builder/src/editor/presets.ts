// The ready-made sections an empty page offers (design/shots/empty.png):
// a section already holding widgets, every block with an id the page does
// not have, made from the widgets' own definitions so each is valid from
// the start. A picture needs its image first, as the Image tile does.
import { idDraw, type NewId } from "../document/ids.ts";
import type { ColumnBlock, ImageRef, PageDocument, SectionBlock, WidgetBlock } from "../shared/document.ts";
import { widgetDefinition } from "../widgets/registry.ts";
import { newWidget } from "../widgets/types.ts";

export const PRESETS = ["intro", "picture", "icons"] as const;
export type Preset = (typeof PRESETS)[number];

export const PRESET_LABELS: Readonly<Record<Preset, string>> = {
  intro: "Heading and intro",
  picture: "Picture beside text",
  icons: "Three icon boxes",
};

export function presetSection(doc: PageDocument, preset: Preset, newId: NewId, image?: ImageRef): SectionBlock {
  const draw = idDraw(doc, newId);
  const column = (children: WidgetBlock[]): ColumnBlock => ({ id: draw(), type: "column", props: {}, children, style: { base: {} } });
  const heading = (text: string, level: 1 | 2): WidgetBlock => ({ ...newWidget(widgetDefinition("heading") as never, draw(), undefined as never), props: { level, text } } as WidgetBlock);
  const text = (): WidgetBlock => newWidget(widgetDefinition("text") as never, draw(), undefined as never) as WidgetBlock;
  const sectionId = draw();
  let columns: ColumnBlock[];
  switch (preset) {
    case "intro": {
      const button = newWidget(widgetDefinition("button") as never, draw(), undefined as never) as WidgetBlock;
      columns = [column([heading(doc.title, doc.sections.length === 0 ? 1 : 2), text(), button])];
      break;
    }
    case "picture": {
      if (!image) throw new Error("the picture preset needs its image");
      columns = [
        column([newWidget(widgetDefinition("image") as never, draw(), image as never) as WidgetBlock]),
        column([heading("Heading", 2), text()]),
      ];
      break;
    }
    case "icons": {
      const icons = ["sunrise", "buoys", "cup"] as const;
      columns = icons.map((icon) => {
        const box = newWidget(widgetDefinition("iconbox") as never, draw(), undefined as never) as WidgetBlock;
        return column([{ ...box, props: { ...(box.props as object), icon } } as WidgetBlock]);
      });
      break;
    }
  }
  return { id: sectionId, type: "section", props: {}, children: columns, style: { base: {} } };
}
