// A colour shown on the canvas while it is picked, before it is kept
// (ColorPicker.tsx): dragging over the picker's area or its hue bar shows
// the colour under the pointer at once, and letting go keeps it, one
// change. The preview is the editor's own: the document and the site style
// are as they were until then, and nothing is saved.
import type { Device, PageDocument, PaletteSlot } from "../shared/document.ts";
import type { FreeColor } from "../shared/free-colors.ts";

export type ColorPreview =
  // A slot of Site style.
  | { slot: PaletteSlot; color: FreeColor }
  // A block's background or colour, on a device.
  | { id: string; device: Device; key: "background" | "color"; color: FreeColor };

// The site style as the canvas draws it: the slot being picked in its
// colour.
export function withPalettePreview<T extends { palette: Readonly<Record<string, string>> } | null>(style: T, preview: ColorPreview | null): T {
  if (!style || !preview || !("slot" in preview)) return style;
  return { ...style, palette: { ...style.palette, [preview.slot]: preview.color } };
}

type Node = { id?: unknown; style?: unknown; children?: unknown };

// A block's style with the colour being picked for it, on its device.
export function previewedStyle(style: unknown, preview: Extract<ColorPreview, { id: string }>): Record<string, unknown> {
  const own = typeof style === "object" && style !== null ? (style as Record<string, unknown>) : { base: {} };
  const part = typeof own[preview.device] === "object" && own[preview.device] !== null ? (own[preview.device] as Record<string, unknown>) : {};
  return { ...own, [preview.device]: { ...part, [preview.key]: preview.color } };
}

// The document as the canvas draws it: the block being picked with the
// colour on the device, every other block the very same object, so only
// the blocks on the way to it are drawn again.
export function withBlockPreview(document: PageDocument, preview: ColorPreview | null): PageDocument {
  if (!preview || !("id" in preview)) return document;
  const along = (blocks: readonly unknown[]): readonly unknown[] => {
    let changed = false;
    const next = blocks.map((block) => {
      if (typeof block !== "object" || block === null) return block;
      const node = block as Node;
      if (node.id === preview.id) {
        changed = true;
        return { ...node, style: previewedStyle(node.style, preview) };
      }
      if (!Array.isArray(node.children) || node.children.length === 0) return block;
      const children = along(node.children);
      if (children === node.children) return block;
      changed = true;
      return { ...node, children };
    });
    return changed ? next : blocks;
  };
  const sections = along(document.sections);
  return sections === document.sections ? document : ({ ...document, sections } as PageDocument);
}
