// A plan written by hand (./plan.ts), for a person with no key to see what
// the Assistant does: it goes through the very same steps a model's answer
// takes (./write.ts), streamed a few characters at a time, so the page
// grows on the canvas the same way. The interface says it is a sample
// written by hand, never a model's work. The brief is the one it answers.
import type { Clock } from "../storage/clock.ts";
import { AssistantError, NO_USAGE, type Answer } from "./providers.ts";

export const SAMPLE_BRIEF = "An open day at the swimming club: Saturday 12 April, from 8 to 11 in the morning, at the slipway. Trial swims with a coach, hot drinks after. People book a place with a short form.";

const words = (...paragraphs: string[]) => ({ kind: "text", paragraphs });
const heading = (level: number, text: string, display = false) => ({ kind: "heading", level, text, display });
const iconbox = (icon: string, title: string, text: string) => ({ kind: "iconbox", icon, title, text });
const NONE = { source: "none" };
const section = (label: string, anchor: string, background: string, widths: string, columns: Array<{ align: string; blocks: unknown[] }>, picture: unknown = NONE, motion = "none") =>
  ({ label, anchor, background, picture, motion, widths, columns });

// The plan, with the library's first image behind its opening when there
// is one, under a strong dark veil; two sections come into view as the
// reader scrolls to them.
export function samplePlan(media: ReadonlyArray<{ id: string; alt: string }>): string {
  const first = media[0];
  const opening = [
    { align: "left", blocks: [heading(1, "Open day at the slipway", true), words("Saturday 12 April, from 8 to 11 in the morning. Try a swim with a coach beside you, then warm up with a hot drink."), { kind: "button", label: "Book a place", target: "#book" }] },
  ];
  const picture = first ? { source: "library", mediaId: first.id, veil: "dark", strength: "strong", focus: "center" } : NONE;
  return JSON.stringify({
    title: "Open day",
    description: "A morning of trial swims with a coach at the slipway, Saturday 12 April, 8 to 11. Book a place.",
    sections: [
      section("Opening", "", first ? "text" : "soft", "equal", opening, picture),
      section("The morning", "morning", "none", "equal", [
        { align: "left", blocks: [iconbox("clock", "From 8 to 11", "Come when it suits you: each trial swim takes half an hour.")] },
        { align: "left", blocks: [iconbox("buoys", "With a coach", "A coach swims beside you, at your pace, close to the shore.")] },
        { align: "left", blocks: [iconbox("cup", "Hot drinks after", "Tea and coffee on the slipway once you are out.")] },
      ], NONE, "rise"),
      section("Questions", "questions", "none", "equal", [
        { align: "left", blocks: [heading(2, "Before you come"), { kind: "questions", items: [
          { question: "Do I need to be a strong swimmer?", answer: "No: you swim close to the shore, with a coach beside you, as far as you like." },
          { question: "What should I bring?", answer: "A swimsuit, a towel and something warm to put on after." },
        ] }] },
      ], NONE, "fade"),
      section("Book", "book", "muted", "equal", [
        { align: "left", blocks: [heading(2, "Book a place"), { kind: "steps", steps: [
          { title: "Fill in the form", text: "Tell us below when you would like to swim." },
          { title: "Hear back from us", text: "We write to confirm your time." },
          { title: "Come to the slipway", text: "Saturday 12 April, at your time between 8 and 11. A coach swims beside you, and hot drinks wait after." },
        ] }, { kind: "form", fields: [
          { type: "text", label: "Your name", required: true },
          { type: "email", label: "Email", required: true },
          { type: "text", label: "When you would like to swim", required: false },
        ], submitLabel: "Book", confirmation: "Thank you: we will write to confirm your time." }] },
      ]),
    ],
  });
}

// The plan written out as a model would stream it: a few characters every
// tick of the clock, until it is all there, or the person stops it.
export function sampleAnswer(text: string, clock: Clock, signal?: AbortSignal, piece = 24, tick = 30) {
  return (written: (piece: string) => void): Promise<Answer> => new Promise((done, fail) => {
    let at = 0;
    const next = (): void => {
      if (signal?.aborted) {
        fail(new AssistantError("Stopped.", "stopped"));
        return;
      }
      written(text.slice(at, at + piece));
      at += piece;
      if (at >= text.length) done({ text, usage: NO_USAGE });
      else clock.setTimeout(next, tick);
    };
    clock.setTimeout(next, tick);
  });
}
