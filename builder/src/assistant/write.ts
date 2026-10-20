// A page written from a brief (./README.md): the model's plan streams in
// (./plan-stream.ts); the page is made and opened as soon as the plan's
// title has come; each section is built (./build.ts) and put on it by a
// command of its own the moment it closes, so the person watches the page
// grow and History holds each step, each one undoable. What the editor
// does is passed in (PageHooks), so this runs the same in a test.
//
// A stop, a refusal or a fault keeps what is already on the page, and a
// stop lets nothing more land, not even sections that had come while the
// page was being made. However the answer ends, a button that leads to a
// section the page does not have is taken out (a plan's button loses its
// link instead), while the page is open. The page is left alone once
// another one is opened in its place: nothing written for it lands on
// another page. What the request used, priced (./tally.ts), is said at the
// end, a refused or cut answer's too: a sample written by hand used none.
import { makeDelete, makeInsert, makeSetItem, makeSetPage, type Made } from "../document/commands.ts";
import { idDraw, type NewId } from "../document/ids.ts";
import type { PageDocument } from "../shared/document.ts";
import { PlanBuilder, type SiteFacts } from "./build.ts";
import { PlanStream } from "./plan-stream.ts";
import { AssistantError, type Answer } from "./providers.ts";
import type { Tally } from "./tally.ts";

export interface PageHooks {
  // Makes and opens a page with this title: null once it is open, or why not.
  open(title: string): Promise<string | null>;
  // Whether the page opened is still the one in the editor.
  still(): boolean;
  document(): PageDocument;
  // Applies a command: null once applied, or the page's refusal, in a sentence.
  apply(made: Made): string | null;
}

export interface SectionWritten {
  label: string;
  // In the page, or left out (with the reason in the notes).
  kept: boolean;
}

export interface Writing {
  phase: "asking" | "writing" | "done" | "stopped" | "failed";
  title: string | null;
  sections: SectionWritten[];
  notes: string[];
  // What the request used and what it comes to at list price, once the
  // provider has said it: none for a sample, or for a request stopped
  // before its end.
  tally: Tally | null;
  error: string | null;
}

// "Added section Hero" said as the Assistant's: "Assistant added section Hero".
export const ASSISTANTS = (label: string): string => `Assistant ${label.charAt(0).toLowerCase()}${label.slice(1)}`;

export function asAssistants(made: Made): Made {
  return made.ok ? { ok: true, command: { ...made.command, label: ASSISTANTS(made.command.label) } } : made;
}

const UNTITLED = "New page";

export async function writePage(options: {
  // The answer, and what asking for it used, priced: a sample has no tally.
  ask: (written: (piece: string) => void) => Promise<Answer & { tally?: Tally }>;
  facts: SiteFacts;
  newId: NewId;
  hooks: PageHooks;
  tell: (writing: Writing) => void;
  // The run's stop: what has not landed when it comes never does.
  signal?: AbortSignal;
}): Promise<Writing> {
  const { ask, facts, newId, hooks, tell, signal } = options;
  const stopped = (): boolean => signal?.aborted === true;
  const builder = new PlanBuilder(facts);
  let writing: Writing = { phase: "asking", title: null, sections: [], notes: [], tally: null, error: null };
  const update = (change: Partial<Writing>): void => {
    writing = { ...writing, ...change, notes: [...builder.notes] };
    tell(writing);
  };
  update({});

  // The page, made once: from the plan's title, or a plain one if a section comes first.
  let opening: Promise<string | null> | null = null;
  const open = (title: string): Promise<string | null> => {
    opening ??= hooks.open(title).then((why) => {
      if (why === null) update({ title });
      return why;
    });
    return opening;
  };
  // Each step waits for the one before: the page is open before anything goes on it.
  let steps: Promise<void> = Promise.resolve();
  let lost: string | null = null;
  const step = (run: () => Promise<void> | void): void => {
    steps = steps.then(async () => {
      if (lost !== null || stopped()) return;
      const why = await open(UNTITLED);
      if (why !== null) lost = why;
      else if (!hooks.still()) lost = "Another page was opened: the Assistant stopped writing to this one.";
      if (lost === null && !stopped()) await run();
    });
  };

  const stream = new PlanStream({
    head: (key, value) => {
      if (key === "title") {
        void open(builder.title(value) ?? UNTITLED);
        return;
      }
      const description = builder.description(value);
      if (description !== null) step(() => void hooks.apply(asAssistants(makeSetPage(hooks.document(), { description }))));
    },
    section: (raw) => step(() => {
      const doc = hooks.document();
      const section = builder.section(raw, idDraw(doc, newId));
      if (section === null) {
        update({ sections: [...writing.sections, { label: labelOf(raw), kept: false }] });
        return;
      }
      const refused = hooks.apply(asAssistants(makeInsert(doc, section, { parentId: null, index: doc.sections.length })));
      if (refused !== null) builder.notes.push(`Left out ${section.props.label ? `the section “${section.props.label}”` : "a section"}: ${refused}`);
      update({ sections: [...writing.sections, { label: section.props.label ?? `Section ${writing.sections.length + 1}`, kept: refused === null }] });
    }),
  });

  // The buttons whose section never came go, however the answer ended:
  // once the steps waiting are through, while the page made is the one open.
  // A plan's button stays with its plan and leads to the top of the page.
  const tidy = async (): Promise<void> => {
    if (opening === null || lost !== null || (await opening) !== null || !hooks.still()) return;
    for (const button of builder.unmet(hooks.document())) {
      if (button.plan) {
        hooks.apply(asAssistants(makeSetItem(hooks.document(), button.id, button.plan.index, { button: { label: button.label, href: "#" } })));
        builder.notes.push(`Took the link out of the button “${button.label}” of the plan “${button.plan.name}”: the section it leads to was not written.`);
        continue;
      }
      hooks.apply(asAssistants(makeDelete(hooks.document(), button.id)));
      builder.notes.push(`Took out the button “${button.label}”: the section it leads to was not written.`);
    }
  };

  try {
    const answer = await ask((piece) => {
      if (writing.phase === "asking") update({ phase: "writing" });
      stream.push(piece);
    });
    await steps;
    try {
      stream.end();
    } catch {
      builder.notes.push("The answer ended before it was whole: what came is on the page.");
    }
    await tidy();
    if (stopped()) {
      update({ phase: "stopped", tally: answer.tally ?? null, error: null });
      return writing;
    }
    if (opening === null) builder.notes.push("The answer held no page.");
    update({ phase: lost === null ? "done" : "failed", tally: answer.tally ?? null, error: lost });
  } catch (error) {
    await steps;
    await tidy();
    const halted = stopped() || (error instanceof AssistantError && error.kind === "stopped");
    const tally = error instanceof AssistantError ? error.tally : null;
    update({ phase: halted ? "stopped" : "failed", tally, error: halted ? null : error instanceof Error ? error.message : String(error) });
  }
  return writing;
}

function labelOf(raw: unknown): string {
  const label = (raw as { label?: unknown } | null)?.label;
  return typeof label === "string" && label.trim() !== "" ? label.trim().slice(0, 60) : "A section";
}
