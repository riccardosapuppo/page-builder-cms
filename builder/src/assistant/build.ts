// A plan's sections made into the page's blocks (./plan.ts), one section
// at a time, as they arrive (./stream-json.ts): the Assistant puts each in
// with a command of its own (../document/commands.ts, makeInsert), which
// the store holds to the page's schema and rules like any other. What a
// model wrote is never trusted to fit: every value is read as the page's
// schema wants it, and what cannot be made to fit is left out and said in
// a note, never guessed.
//
// - Words lose control characters and runs of spaces, and are cut at a
//   word, with an ellipsis, at the schema's length; a text with nothing
//   visible left is no text, and its block goes.
// - Headings keep the page's order for a screen reader: the first is the
//   page's one level 1, a later level 1 is a 2, and no level is skipped
//   below the one before.
// - A button leads to a section of this plan (#anchor), to a page of the
//   site, or to an address, an email or a phone number the person's own
//   brief gives; never to one the model made up. A section it names that
//   is not on the page once the plan ends is said (unmet), and its buttons
//   go too. A plan's button, in a pricing block, leads by the same rules
//   but cannot go without its plan: where its address cannot be kept, or
//   its section never comes, it keeps its words and leads to the top of
//   the page (#), as a new button does, and the note says so.
// - An image is one of the library's, by id; an empty alt text means the
//   image only decorates.
// - Stats, steps and pricing keep the first of their figures, steps, plans
//   and features, as many as the page's schema takes, and the note says
//   what was cut; with fewer than it asks for (a figure, two steps, a
//   plan), the block goes.
// - A form's fields get names from their labels, the page at most one form.
// - A section's background is never the colour of the keys it holds: a
//   button, a plan's too, is drawn in the accent colour, a form's send key
//   in the primary one (site.css, .sw-btn and .sw-btn-primary); such a
//   section takes the soft background instead, and the note says so.
import {
  COLUMN_WIDTHS_BY_COUNT, type ColumnBlock, type ColumnWidthsToken, type FormField, type HeadingLevel, type ImageProps, type PageDocument, type Paragraph,
  type PricingPlan, type RichTextBlock, type SectionBlock, type WidgetBlock,
} from "../shared/document.ts";
import { allBlocks } from "../document/tree.ts";
import { isLine } from "../shared/validate.ts";
import { checkLink } from "../editor/rich/link-check.ts";
import type { MediaItem } from "../storage/adapter.ts";
import { readSection, type PlanBlock, type PlanColumn, type PlanOffer, type PlanSection } from "./plan.ts";

export interface SiteFacts {
  // The site's library: an image block names one of these.
  media: readonly Pick<MediaItem, "id" | "alt">[];
  // The site's pages, by path ("/", "/winter-series").
  paths: readonly string[];
  // The person's own words, where an address of another site, an email or
  // a phone number must be written for a button to lead there.
  brief: string;
}

// A button whose section never came: a button block, or a plan's button,
// with the plan's place in its pricing block and its name.
export interface Unmet {
  id: string;
  label: string;
  plan?: { index: number; name: string };
}

// The schema's lengths (schema/block-document.schema.json), in code points.
const MAX = {
  title: 120, description: 160, label: 60, heading: 200, paragraph: 2000, item: 300, button: 80,
  iconTitle: 80, iconText: 300, quote: 500, attribution: 120, question: 200, answer: 2000,
  figureValue: 24, figureLabel: 80, stepTitle: 120, stepText: 1000,
  planName: 80, price: 24, period: 40, planText: 400, feature: 120, badge: 30,
  fieldLabel: 200, submit: 60, confirmation: 500, alt: 300,
} as const;
// How much of each a page takes from a plan.
const MOST = { columns: 4, blocks: 12, paragraphs: 12, items: 20, questions: 30, figures: 8, steps: 10, plans: 4, features: 12, fields: 20 } as const;
const ANCHOR = /^[a-z][a-z0-9-]{0,63}$/;
const FIELD_NAME = /^[a-z][a-z0-9-]{0,39}$/;
// The schema's line controls ($defs/lineControls): C0, DEL and C1, and the
// two Unicode separators.
const control = (code: number): boolean => code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;

// One line of words, cleaned and cut to `max` at a word, or "" when
// nothing visible is left.
export function line(raw: string, max: number): string {
  const clean = Array.from(raw, (character) => (control(character.codePointAt(0)!) ? " " : character)).join("").replace(/\s+/g, " ").trim();
  const points = [...clean];
  let kept = clean;
  if (points.length > max) {
    const head = points.slice(0, max - 1).join("");
    const space = head.lastIndexOf(" ");
    kept = `${space > head.length * 0.6 ? head.slice(0, space) : head}…`;
  }
  return isLine(kept, max) ? kept : "";
}

const slug = (raw: string): string => raw.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z]+/, "").replace(/-+$/, "");

const paragraph = (text: string): Paragraph => ({ type: "paragraph", content: [{ type: "text", text }] });

// The facts of the page as a plan's sections fill it, and the notes on
// what was left out. One per plan.
export class PlanBuilder {
  readonly notes: string[] = [];
  private readonly anchors = new Set<string>();
  private readonly links: Array<{ id: string; anchor: string; label: string }> = [];
  private headings = { first: true, last: 0 };
  private forms = 0;
  private readonly facts: SiteFacts;

  constructor(facts: SiteFacts) {
    this.facts = facts;
  }

  // The page's title and description from the plan's head; null where the
  // plan's would not do (the editor keeps what the page has).
  title(raw: unknown): string | null {
    const title = typeof raw === "string" ? line(raw, MAX.title) : "";
    return title === "" ? null : title;
  }

  description(raw: unknown): string | null {
    const description = typeof raw === "string" ? line(raw, MAX.description) : "";
    return description === "" ? null : description;
  }

  // One section of the plan as the page's, its ids drawn from `draw`, or
  // null when nothing of it could be kept.
  section(raw: unknown, draw: () => string): SectionBlock | null {
    const plan = readSection(raw);
    if (!plan) {
      this.notes.push("Left out a section that was not written as a plan's section.");
      return null;
    }
    const id = draw();
    const columns = plan.columns.slice(0, MOST.columns).map((column) => this.column(column, draw)).filter((column) => column.children.length > 0);
    if (plan.columns.length > MOST.columns) this.notes.push(`Kept the first ${MOST.columns} columns of ${this.called(plan)}: a section has at most ${MOST.columns}.`);
    if (columns.length === 0) {
      this.notes.push(`Left out ${this.called(plan)}: nothing in it could be kept.`);
      return null;
    }
    const props: SectionBlock["props"] = {};
    const label = line(plan.label, MAX.label);
    if (label !== "") props.label = label;
    const anchor = this.anchorOf(plan.anchor);
    if (anchor !== null) props.anchor = anchor;
    const widths = plan.widths === "equal" ? null : plan.widths;
    if (widths !== null && (COLUMN_WIDTHS_BY_COUNT[columns.length as 1 | 2 | 3 | 4] as readonly string[]).includes(widths)) props.columnWidths = widths as ColumnWidthsToken;
    const background = this.behindKeys(plan, columns);
    const style: SectionBlock["style"] = { base: background === "none" ? {} : { background } };
    return { id, type: "section", props, children: columns, style };
  }

  // The buttons on the page that lead to a section of this plan the page
  // does not have once the plan has ended (it never came, or was refused):
  // they go, since a link must lead somewhere. A plan's button is said
  // with its plan, which it cannot leave: it loses its link instead.
  unmet(doc: PageDocument): Unmet[] {
    const blocks = [...allBlocks(doc)].map((located) => located.block);
    const anchors = new Set(blocks.map((block) => (block.props as { anchor?: string }).anchor).filter((anchor) => anchor !== undefined));
    const byId = new Map(blocks.map((block) => [block.id, block]));
    const said = new Set<string>();
    return this.links.flatMap((link): Unmet[] => {
      const block = byId.get(link.id);
      if (!block || anchors.has(link.anchor)) return [];
      if (block.type !== "pricing") return [{ id: link.id, label: link.label }];
      // Every plan of the block that still leads there, once.
      const href = `#${link.anchor}`;
      if (said.has(`${link.id} ${href}`)) return [];
      said.add(`${link.id} ${href}`);
      return block.props.plans.flatMap((plan, index) => (plan.button.href === href ? [{ id: link.id, label: plan.button.label, plan: { index, name: plan.name } }] : []));
    });
  }

  // The plan's background, or soft where the plan's would hide the keys
  // the section holds.
  private behindKeys(plan: PlanSection, columns: readonly ColumnBlock[]): PlanSection["background"] {
    const types = new Set(columns.flatMap((column) => column.children.map((block) => block.type)));
    const hidden = plan.background === "primary" && types.has("form") ? "its form's send key"
      : plan.background === "accent" && types.has("button") ? "its buttons"
      : plan.background === "accent" && types.has("pricing") ? "its plans' buttons"
      : null;
    if (hidden === null) return plan.background;
    this.notes.push(`Gave ${this.called(plan)} the soft background: ${hidden} would not show on the ${plan.background} one.`);
    return "soft";
  }

  private called(plan: PlanSection): string {
    const label = line(plan.label, MAX.label);
    return label === "" ? "a section" : `the section “${label}”`;
  }

  private anchorOf(raw: string): string | null {
    const asked = raw.trim();
    if (asked === "") return null;
    const anchor = ANCHOR.test(asked) ? asked : slug(asked).slice(0, 64).replace(/-+$/, "");
    if (!ANCHOR.test(anchor) || this.anchors.has(anchor)) return null;
    this.anchors.add(anchor);
    return anchor;
  }

  private column(plan: PlanColumn, draw: () => string): ColumnBlock {
    const id = draw();
    const children: WidgetBlock[] = [];
    for (const block of plan.blocks.slice(0, MOST.blocks)) {
      const made = this.block(block, draw);
      if (made) children.push(made);
    }
    return { id, type: "column", props: {}, children, style: { base: plan.align === "center" ? { align: "center" } : {} } };
  }

  private level(asked: HeadingLevel): HeadingLevel {
    let level: number = asked;
    if (this.headings.first) level = 1;
    else if (level === 1) level = 2;
    level = Math.min(level, Math.max(this.headings.last, 1) + 1, 4);
    this.headings = { first: false, last: level };
    return level as HeadingLevel;
  }

  // Where a button leads, or null: a section of this plan (said again at
  // the end if it never comes), a page of the site, or an address of the
  // brief's.
  private target(raw: string, id: string, label: string): string | null {
    const target = raw.trim();
    if (target.startsWith("#")) {
      const anchor = target.slice(1);
      if (!ANCHOR.test(anchor)) return null;
      this.links.push({ id, anchor, label });
      return target;
    }
    if (target.startsWith("/")) {
      const path = target === "/" ? "/" : target.replace(/\/+$/, "");
      return this.facts.paths.includes(path) ? path : null;
    }
    if (target === "" || !this.inBrief(target)) return null;
    const checked = checkLink(target);
    return checked.ok ? checked.href : null;
  }

  private block(plan: PlanBlock, draw: () => string): WidgetBlock | null {
    const id = draw();
    // The store holds every block to the schema as it goes in.
    const widget = (block: { type: WidgetBlock["type"]; props: object; style?: { base: object } }): WidgetBlock =>
      ({ id, children: [], style: { base: {} }, ...block }) as WidgetBlock;
    switch (plan.kind) {
      case "heading": {
        const text = line(plan.text, MAX.heading);
        if (text === "") return this.leave("a heading with no words");
        const level = this.level(plan.level);
        return widget({ type: "heading", props: { level, text }, style: { base: level === 1 && plan.display ? { textSize: "display" } : {} } });
      }
      case "text": {
        const paragraphs = plan.paragraphs.slice(0, MOST.paragraphs).map((text) => line(text, MAX.paragraph)).filter((text) => text !== "");
        if (paragraphs.length === 0) return this.leave("a text with no words");
        return widget({ type: "text", props: { doc: { type: "doc", content: paragraphs.map(paragraph) } } });
      }
      case "list": {
        const items = plan.items.slice(0, MOST.items).map((text) => line(text, MAX.item)).filter((text) => text !== "");
        if (items.length === 0) return this.leave("a list with no items");
        const listItems = items.map((text) => ({ type: "listItem" as const, content: [paragraph(text)] as [Paragraph] }));
        const list: RichTextBlock = plan.ordered ? { type: "orderedList", content: listItems } : { type: "bulletList", content: listItems };
        return widget({ type: "text", props: { doc: { type: "doc", content: [list] } } });
      }
      case "button": {
        const label = line(plan.label, MAX.button);
        if (label === "") return this.leave("a button with no words");
        const href = this.target(plan.target, id, label);
        if (href === null) return this.leave(`the button “${label}”: it would lead to an address the brief does not give`);
        return widget({ type: "button", props: { label, href } });
      }
      case "image": {
        const item = this.facts.media.find((media) => media.id === plan.mediaId);
        if (!item) return this.leave("an image that is not in the site's library");
        const alt = line(plan.alt, MAX.alt);
        const props: ImageProps = alt === "" ? { mediaId: item.id, decorative: true } : { mediaId: item.id, alt };
        return widget({ type: "image", props });
      }
      case "iconbox": {
        const title = line(plan.title, MAX.iconTitle);
        const text = line(plan.text, MAX.iconText);
        if (title === "" || text === "") return this.leave("an icon box with no title or no text");
        return widget({ type: "iconbox", props: { icon: plan.icon, title, text } });
      }
      case "quote": {
        const text = line(plan.text, MAX.quote);
        if (text === "") return this.leave("a quotation with no words");
        const attribution = line(plan.attribution, MAX.attribution);
        return widget({ type: "quote", props: attribution === "" ? { text } : { text, attribution } });
      }
      case "questions": {
        const items = plan.items.slice(0, MOST.questions)
          .map((item) => ({ question: line(item.question, MAX.question), answer: line(item.answer, MAX.answer) }))
          .filter((item) => item.question !== "" && item.answer !== "");
        if (items.length === 0) return this.leave("questions with no answers");
        return widget({ type: "accordion", props: { items } });
      }
      case "stats": {
        const figures = plan.figures.map((figure) => ({ value: line(figure.value, MAX.figureValue), label: line(figure.label, MAX.figureLabel) }))
          .filter((figure) => figure.value !== "" && figure.label !== "");
        if (figures.length === 0) return this.leave("a stats block with no figures");
        return widget({ type: "stats", props: { items: this.first(figures, MOST.figures, "figures", "a stats block") } });
      }
      case "steps": {
        const steps = plan.steps.map((step) => ({ title: line(step.title, MAX.stepTitle), text: line(step.text, MAX.stepText) }))
          .filter((step) => step.title !== "" && step.text !== "");
        if (steps.length < 2) return this.leave("a steps block with fewer than two steps");
        return widget({ type: "steps", props: { items: this.first(steps, MOST.steps, "steps", "a steps block") } });
      }
      case "pricing": {
        const offers = plan.plans.filter((offer) => line(offer.name, MAX.planName) !== "" && line(offer.price, MAX.price) !== "");
        if (offers.length === 0) return this.leave("a pricing block with no plans");
        return widget({ type: "pricing", props: { plans: this.first(offers, MOST.plans, "plans", "a pricing block").map((offer) => this.offer(offer, id)) } });
      }
      case "form": {
        if (this.forms > 0) return this.leave("a second form: a page takes one");
        const taken = new Set<string>();
        const fields: FormField[] = [];
        for (const field of plan.fields.slice(0, MOST.fields)) {
          const label = line(field.label, MAX.fieldLabel);
          if (label === "") continue;
          const name = this.fieldName(label, taken);
          const base = { name, label, required: field.required };
          fields.push(field.type === "text" ? { ...base, kind: "text", maxLength: 300 }
            : field.type === "longtext" ? { ...base, kind: "textarea", maxLength: 2000 }
            : { ...base, kind: field.type });
        }
        if (fields.length === 0) return this.leave("a form with no fields");
        this.forms += 1;
        const submitLabel = line(plan.submitLabel, MAX.submit) || "Send";
        const confirmation = line(plan.confirmation, MAX.confirmation) || "Thank you: your answer is kept.";
        return widget({ type: "form", props: { items: fields, submitLabel, confirmation } });
      }
      case "divider":
        return widget({ type: "divider", props: {} });
    }
  }

  // A plan of a pricing block `id`, its name and price there. Its button
  // has words of its own, or else "Choose" and the plan's name; where its
  // address cannot be kept, it leads to the top of the page, as a new
  // button does.
  private offer(offer: PlanOffer, id: string): PricingPlan {
    const name = line(offer.name, MAX.planName);
    const features = offer.features.map((feature) => line(feature, MAX.feature)).filter((feature) => feature !== "");
    const kept = this.first(features, MOST.features, `features of the plan “${name}”`, "a plan");
    const label = line(offer.buttonLabel, MAX.button) || line(`Choose ${name}`, MAX.button);
    const href = this.target(offer.buttonTarget, id, label);
    if (href === null) this.notes.push(`Left out the link of the button “${label}” of the plan “${name}”: it would lead to an address the brief does not give.`);
    return {
      name, price: line(offer.price, MAX.price), period: line(offer.period, MAX.period), text: line(offer.text, MAX.planText),
      features: kept, button: { label, href: href ?? "#" }, featured: offer.featured, badge: line(offer.badge, MAX.badge),
    };
  }

  // The first `most` of a block's items, and a note when there were more.
  private first<T>(kept: T[], most: number, what: string, holder: string): T[] {
    if (kept.length > most) this.notes.push(`Kept the first ${most} ${what}: ${holder} has at most ${most}.`);
    return kept.slice(0, most);
  }

  // Whether the brief gives an address: as written, an email's address
  // without its mailto:, a phone number's digits however spaced.
  private inBrief(target: string): boolean {
    const brief = this.facts.brief;
    if (/^tel:/i.test(target)) {
      const digits = target.slice(4).replace(/[^0-9+]/g, "");
      return digits.length >= 6 && brief.replace(/[^0-9+]/g, "").includes(digits);
    }
    return brief.includes(target.replace(/^mailto:/i, ""));
  }

  private fieldName(label: string, taken: Set<string>): string {
    const base = (slug(label).slice(0, 36).replace(/-+$/, "") || "field");
    let name = base;
    for (let count = 2; taken.has(name) || !FIELD_NAME.test(name); count += 1) name = `${base}-${count}`;
    taken.add(name);
    return name;
  }

  private leave(what: string): null {
    this.notes.push(`Left out ${what}.`);
    return null;
  }
}
