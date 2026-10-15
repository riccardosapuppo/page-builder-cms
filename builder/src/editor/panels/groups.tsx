// The sidebar's groups (design/layout/, the editor, style and section
// states): a block's settings, and the page's, under collapsible groups
// named after what they hold, in place of the Content, Style and Advanced
// tabs. A closed group says its value in words ("Display, Sea", "Every
// device"); a group whose settings have a tablet's or a phone's own value
// says which device differs, open or closed. The override controls
// themselves, inherited or the device's own, and Remove taking the key
// out, are the settings' own (./StyleFields.tsx), inside the groups.
//
// Which groups are open is the person's, per block type (and for the
// page), kept by the shell in this browser (../open-groups.ts); a group
// never opened or closed is drawn as the layout draws it first: the
// block's first group open, the others closed, every group of the page
// open. A value the server refused opens the group that holds its field,
// so the refusal shows on the field it names, until the group is closed
// by hand; closed, it says it holds one.
import { isFreeColor } from "../../shared/free-colors.ts";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { tokenName } from "../../document/labels.ts";
import type { Block, BlockType, PaletteSlot, WidgetBlock } from "../../shared/document.ts";
import { slotTone } from "../../shared/site-tokens.ts";
import type { BlockFieldError } from "../../storage/adapter.ts";
import { WIDGET_PANELS } from "../../widgets/panels.ts";
import { useEnv, useUi } from "../context.tsx";
import { deviceOf, OVERRIDE_DEVICES, ownValue, shownValue, type OverrideDevice } from "../device-style.ts";
import { Icon } from "../icons.tsx";
import { excerpt } from "../names.ts";
import { paletteName } from "../palette.ts";
import type { WidgetPanel } from "./types.ts";
import { ShownOn, shownOnWords } from "./ShownOn.tsx";
import { advancedWords, BlockAdvanced } from "./advanced.tsx";
import { columnsWords, nameWords, SectionColumns, SectionName } from "./structure.tsx";
import { acceptedKeys, inUseOf, StyleFields, useColumnStyle, type StyleKey } from "./StyleFields.tsx";

// A group as the sidebar draws it.
export interface GroupSpec {
  // Its key in the person's open groups: the same for the same kind of
  // group on every block type ("content" is a widget's own).
  id: string;
  name: string;
  // The style keys it sets, for "Tablet differs".
  keys: readonly StyleKey[];
  // Whether a field the server named (its pointer inside the block, or
  // inside the page for the page's own) is one of the group's.
  holds: (field: string) => boolean;
  // What it says closed, and a dot of the colour it names, if one.
  summary: string;
  dot?: ReactNode;
  body: ReactNode;
}

// The style groups each type has, by the keys they hold, in the layout's
// order around the widget's own content and Shown on. Every key a type
// accepts is in exactly one of its groups (groups.test.tsx holds it).
type StyleGroupId = "size" | "type" | "colors" | "text-color" | "line-color" | "disc-color" | "highlight-color" | "shape" | "spacing" | "background" | "alignment";
const STYLE_GROUPS: Readonly<Record<StyleGroupId, { name: string; keys: readonly StyleKey[] }>> = {
  size: { name: "Size and color", keys: ["textSize", "typeface", "color"] },
  type: { name: "Text size and color", keys: ["textSize", "color"] },
  colors: { name: "Colors", keys: ["background", "color"] },
  "text-color": { name: "Text color", keys: ["color"] },
  "line-color": { name: "Line color", keys: ["color"] },
  "disc-color": { name: "Disc color", keys: ["color"] },
  "highlight-color": { name: "Highlight color", keys: ["color"] },
  shape: { name: "Shape", keys: ["aspect"] },
  spacing: { name: "Spacing", keys: ["spaceInside", "spaceAbove", "spaceBelow", "spaceBetween"] },
  background: { name: "Background", keys: ["background"] },
  alignment: { name: "Alignment", keys: ["verticalAlign", "align"] },
};

// The groups of each type, top to bottom: "content" is a widget's own
// group (its folder's panel), "columns" and "name" a section's, "shown"
// every block's.
type GroupId = StyleGroupId | "content" | "columns" | "name" | "shown" | "advanced";
const TEXT: readonly GroupId[] = ["content", "size", "alignment", "shown", "advanced"];
export const GROUPS_BY_TYPE: Readonly<Record<BlockType, readonly GroupId[]>> = {
  section: ["columns", "background", "spacing", "shown", "name", "advanced"],
  column: ["spacing", "background", "type", "alignment", "shown", "advanced"],
  heading: TEXT,
  text: TEXT,
  quote: TEXT,
  image: ["content", "shape", "shown", "advanced"],
  button: ["content", "colors", "alignment", "shown", "advanced"],
  divider: ["line-color", "shown", "advanced"],
  accordion: ["content", "line-color", "shown", "advanced"],
  spacer: ["content", "shown", "advanced"],
  video: ["content", "shown", "advanced"],
  map: ["content", "shown", "advanced"],
  gallery: ["content", "spacing", "shown", "advanced"],
  iconbox: ["content", "text-color", "alignment", "shown", "advanced"],
  stats: ["content", "text-color", "alignment", "shown", "advanced"],
  steps: ["content", "disc-color", "shown", "advanced"],
  pricing: ["content", "highlight-color", "shown", "advanced"],
  form: ["content", "shown", "advanced"],
  logo: ["content", "text-color", "alignment", "shown", "advanced"],
  menu: ["content", "text-color", "alignment", "shown", "advanced"],
};

// A type's style groups and the keys each holds, those the type accepts.
export function styleGroupKeys(type: BlockType): Array<{ id: string; keys: StyleKey[] }> {
  return GROUPS_BY_TYPE[type].flatMap((id) => (id in STYLE_GROUPS ? [{ id, keys: acceptedKeys(type, STYLE_GROUPS[id as StyleGroupId].keys) }] : []));
}

const STYLE_FIELD = /^\/style\/(?:base|tablet|phone)\/([A-Za-z]+)$/;
const styleKeyOf = (field: string) => STYLE_FIELD.exec(field)?.[1] ?? null;

// ------------------------------------------------------------- words

const SPACE_SHORT: Readonly<Record<string, string>> = { spaceInside: "inside", spaceAbove: "above", spaceBelow: "below", spaceBetween: "between" };

interface WordsContext {
  block: Block;
  device: ReturnType<typeof deviceOf>;
  palette: Readonly<Record<string, string>> | null | undefined;
  columnStyle: unknown;
}

// A colour slot's tone in the site's palette, and a dot of it; a free
// colour (../../shared/free-colors.ts) is said as itself.
function tone(slot: string, palette: WordsContext["palette"]): { label: string; dot: ReactNode } {
  if (isFreeColor(slot)) return { label: paletteName(slot) ?? slot, dot: <i className="sum-dot" style={{ "--c": slot } as CSSProperties} aria-hidden="true" /> };
  const found = slotTone(slot as PaletteSlot, palette);
  return { label: found.label, dot: <i className="sum-dot" style={{ "--c": found.hex } as CSSProperties} aria-hidden="true" /> };
}

// What a style group says closed: the values the device previewed shows,
// the ones the block leaves unset said as what is in use; on a tablet or
// a phone, "from desktop" when none of them is the device's own.
function styleWords(id: StyleGroupId, keys: readonly StyleKey[], { block, device, palette, columnStyle }: WordsContext): { words: string; dot: ReactNode } {
  const style: unknown = block.style;
  const shown = (key: StyleKey) => shownValue(style, device, key);
  const inUse = (key: StyleKey) => shown(key) ?? inUseOf(block, key, device, columnStyle);
  let dot: ReactNode = null;
  let words: string;
  const colorWord = (unset: string) => {
    const slot = shown("color");
    if (slot === null) return unset;
    const t = tone(slot, palette);
    dot ??= t.dot;
    return t.label;
  };
  switch (id) {
    case "size":
    case "type": {
      const step = inUse("textSize");
      // The typeface only where the block sets one: the type's own is
      // what a heading, a text or a quote is expected in.
      const face = shown("typeface");
      words = [step === null ? "Theme default" : tokenName(step), ...(face === null ? [] : [`${tokenName(face)} typeface`]), colorWord("theme color")].join(", ");
      break;
    }
    case "colors": {
      const background = inUse("background");
      let backgroundWord = "no background";
      if (background !== null && background !== "none") {
        const t = tone(background, palette);
        dot = t.dot;
        backgroundWord = t.label;
      }
      const text = shown("color");
      words = `${backgroundWord}, ${text === null ? "theme text" : `${tone(text, palette).label} text`}`;
      break;
    }
    case "text-color":
    case "line-color":
    case "disc-color":
    case "highlight-color":
      words = colorWord("Theme default");
      break;
    case "background": {
      const value = inUse("background");
      if (value === null || value === "none") words = "None";
      else {
        const t = tone(value, palette);
        dot = t.dot;
        words = t.label;
      }
      break;
    }
    case "shape":
      words = tokenName(inUse("aspect") ?? "original");
      break;
    case "alignment": {
      const parts = keys.map((key) => tokenName(inUse(key) ?? "left"));
      words = parts.map((part, index) => (index === 0 ? part : part.toLowerCase())).join(", ");
      break;
    }
    case "spacing": {
      const set = keys.flatMap((key) => {
        const value = shown(key);
        return value === null ? [] : [`${SPACE_SHORT[key]} ${tokenName(value)}`];
      });
      words = set.length === 0 ? "Theme default" : set.join(", ").replace(/^./, (c) => c.toUpperCase());
      break;
    }
  }
  if (device !== "base" && keys.every((key) => ownValue(style, device, key) === null) && keys.some((key) => shownValue(style, "base", key) !== null)) {
    words += ", from desktop";
  }
  return { words, dot };
}

// What a widget's own group says closed: its words, its count.
function contentWords(block: WidgetBlock): string {
  if (block.type === "accordion") {
    const count = block.props.items.length;
    return `${count} ${count === 1 ? "question" : "questions"}, the first open`;
  }
  if (block.type === "stats") {
    const count = block.props.items.length;
    return `${count} ${count === 1 ? "figure" : "figures"}`;
  }
  if (block.type === "steps") {
    const count = block.props.items.length;
    return `${count} ${count === 1 ? "step" : "steps"}`;
  }
  if (block.type === "pricing") {
    const count = block.props.plans.length;
    const featured = block.props.plans.filter((plan) => plan.featured).length;
    return `${count} ${count === 1 ? "plan" : "plans"}, ${featured === 0 ? "none" : featured} featured`;
  }
  if (block.type === "image" && block.props.decorative !== true && !block.props.alt) return "No alt text";
  if (block.type === "form") {
    const count = block.props.items.length;
    const required = block.props.items.filter((field) => field.required).length;
    return `${count} ${count === 1 ? "field" : "fields"}, ${required === 0 ? "none" : required} required`;
  }
  return excerpt(block) || "Empty";
}

// ------------------------------------------------------------ the specs

// The selected block's groups, in order, each with what it holds.
export function useBlockGroups(block: Block): GroupSpec[] {
  const preview = useUi((u) => u.preview);
  const siteStyle = useUi((u) => u.siteStyle);
  const columnStyle = useColumnStyle(block.id);
  const context: WordsContext = { block, device: deviceOf(preview), palette: siteStyle?.palette, columnStyle };
  return GROUPS_BY_TYPE[block.type].flatMap((id): GroupSpec[] => {
    switch (id) {
      case "content": {
        if (block.type === "section" || block.type === "column") return [];
        const panel = WIDGET_PANELS[block.type] as WidgetPanel<WidgetBlock["type"]>;
        if (!panel.content) return [];
        const Content = panel.content.Content;
        // A further group holds its props and everything under them; the
        // first holds the other props.
        const more = (panel.more ?? []).map((group) => ({
          group,
          holds: (field: string) => group.props.some((prop) => field === `/props/${prop}` || field.startsWith(`/props/${prop}/`)),
        }));
        return [
          { id, name: panel.content.name, keys: [], holds: (field) => field.startsWith("/props/") && !more.some((m) => m.holds(field)), summary: contentWords(block), body: <Content block={block as never} /> },
          ...more.map(({ group, holds }): GroupSpec => {
            const More = group.Content;
            return { id: group.id, name: group.name, keys: [], holds, summary: group.summary(block as never), body: <More block={block as never} /> };
          }),
        ];
      }
      case "columns":
        if (block.type !== "section") return [];
        return [{ id, name: "Columns", keys: [], holds: (field) => field === "/children" || field === "/props/columnWidths" || field === "/props/stack", summary: columnsWords(block), body: <SectionColumns block={block} /> }];
      case "name":
        if (block.type !== "section") return [];
        return [{ id, name: "Name and link", keys: [], holds: (field) => field === "/props/label" || field === "/props/anchor", summary: nameWords(block), body: <SectionName block={block} /> }];
      case "shown":
        return [{ id, name: "Shown on", keys: [], holds: (field) => styleKeyOf(field) === "visibility", summary: shownOnWords(block.style), body: <ShownOn block={block} /> }];
      case "advanced":
        return [{
          id,
          name: "Advanced",
          keys: [],
          holds: (field) => field === "/props/className" || (block.type !== "section" && field === "/props/anchor"),
          summary: advancedWords(block),
          body: <BlockAdvanced block={block} />,
        }];
      default: {
        const keys = acceptedKeys(block.type, STYLE_GROUPS[id].keys);
        if (keys.length === 0) return [];
        const { words, dot } = styleWords(id, keys, context);
        return [{
          id,
          name: STYLE_GROUPS[id].name,
          keys,
          holds: (field) => (keys as readonly string[]).includes(styleKeyOf(field) ?? ""),
          summary: words,
          dot,
          body: <StyleFields block={block} keys={keys} />,
        }];
      }
    }
  });
}

// The devices on which a group's settings have values of their own.
export function differsOn(style: unknown, keys: readonly StyleKey[]): OverrideDevice[] {
  return OVERRIDE_DEVICES.filter((device) => keys.some((key) => ownValue(style, device, key) !== null));
}

// ------------------------------------------------------------ drawing

interface GroupListProps {
  // Whose groups: a block's type, or "page".
  owner: string;
  specs: readonly GroupSpec[];
  // The groups open when the person has not chosen: by their place.
  openFirst: (index: number) => boolean;
  // The style the "differs" words are read from; null for the page.
  style: unknown;
  // The server's errors for these groups' fields, from the last refused
  // save.
  errors: readonly BlockFieldError[];
}

export function GroupList({ owner, specs, openFirst, style, errors }: GroupListProps) {
  const { ui } = useEnv();
  const chosen = useUi((u) => u.openGroups[owner]);
  const all = useUi((u) => u.serverErrors);
  const refusedIds = (list: readonly BlockFieldError[]) => specs.filter((spec) => list.some((error) => spec.holds(error.field))).map((spec) => spec.id);
  // The groups a refusal opened: open while the panel is, so a field the
  // person is putting right does not close under them once the next save
  // is taken, until closed by hand. Each new refusal opens its groups
  // again; the person's own choice is left as it was. Adjusted while
  // drawing, as React keeps state that follows a value from outside.
  const [held, setHeld] = useState<{ seen: readonly BlockFieldError[]; ids: ReadonlySet<string> }>(() => ({ seen: all, ids: new Set(refusedIds(errors)) }));
  if (held.seen !== all) setHeld({ seen: all, ids: new Set([...held.ids, ...refusedIds(errors)]) });
  return (
    <>
      {specs.map((spec, index) => {
        const refused = errors.some((error) => spec.holds(error.field));
        const wanted = chosen?.[spec.id] ?? openFirst(index);
        const open = wanted || held.ids.has(spec.id);
        return (
          <Group
            key={spec.id}
            spec={spec}
            open={open}
            refused={refused}
            differs={style === null ? [] : differsOn(style, spec.keys)}
            onToggle={() => {
              ui.getState().setGroupOpen(owner, spec.id, !open);
              if (open && held.ids.has(spec.id)) setHeld({ seen: held.seen, ids: new Set([...held.ids].filter((id) => id !== spec.id)) });
            }}
          />
        );
      })}
    </>
  );
}

const DIFFERS_WORDS = (devices: readonly OverrideDevice[]) =>
  devices.length === 2 ? "Tablet and phone differ" : devices[0] === "tablet" ? "Tablet differs" : "Phone differs";

// The groups of a block that is being moved (design/layout/, the drag
// state): closed, each with its value, and out of reach (no key, no field):
// the page is about to change under the drag, so nothing is edited until it
// is dropped, or put back with Esc.
export function StaticGroups({ specs, style }: { specs: readonly GroupSpec[]; style: unknown }) {
  return (
    <>
      {specs.map((spec) => {
        const differs = style === null ? [] : differsOn(style, spec.keys);
        return (
          <div className="grp" data-group={spec.id} key={spec.id}>
            <div className="grp-head grp-head-static">
              <Icon name="chevron-right" className="i i-xs grp-chev" />
              <span className="grp-name">{spec.name}</span>
              <span className="grp-sum">{spec.dot}<span className="grp-sum-words">{spec.summary}</span></span>
              {differs.length > 0 && (
                <span className="grp-dev" title={DIFFERS_WORDS(differs)}>
                  {differs.map((device) => <Icon key={device} name={device} className="i i-xs" />)}
                  <span className="visually-hidden">{DIFFERS_WORDS(differs)}</span>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

// The head is a disclosure button named by the group's name alone, so a
// person (or a voice command) finds it by that name; its value, the device
// that differs and a refusal are its description, read after it, and kept
// out of its name.
function Group({ spec, open, refused, differs, onToggle }: { spec: GroupSpec; open: boolean; refused: boolean; differs: readonly OverrideDevice[]; onToggle: () => void }) {
  const id = useId();
  const described = [!open ? `${id}-sum` : null, differs.length > 0 ? `${id}-dev` : null, refused ? `${id}-err` : null].filter((x): x is string => x !== null);
  return (
    <div className="grp" data-group={spec.id}>
      <button
        className="grp-head"
        type="button"
        aria-expanded={open}
        aria-controls={open ? `${id}-body` : undefined}
        aria-describedby={described.length > 0 ? described.join(" ") : undefined}
        onClick={onToggle}
      >
        <Icon name="chevron-right" className="i i-xs grp-chev" />
        <span className="grp-name">{spec.name}</span>
        {!open && <span className="grp-sum" aria-hidden="true">{spec.dot}<span className="grp-sum-words" id={`${id}-sum`}>{spec.summary}</span></span>}
        {/* Closed, the device's glyph alone, beside the value: its words
            are for the description, and for the pointer's tip. */}
        {differs.length > 0 && (
          <span className="grp-dev" id={`${id}-dev`} aria-hidden="true" title={open ? undefined : DIFFERS_WORDS(differs)}>
            {differs.map((device) => <Icon key={device} name={device} className="i i-xs" />)}
            <span className={open ? undefined : "visually-hidden"}>{DIFFERS_WORDS(differs)}</span>
          </span>
        )}
        {refused && <span className="grp-err" id={`${id}-err`} aria-hidden="true"><Icon name="error" className="i i-xs" />Refused</span>}
      </button>
      {open && <div className="grp-body" id={`${id}-body`}>{spec.body}</div>}
    </div>
  );
}
