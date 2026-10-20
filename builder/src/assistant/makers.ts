// The pictures a page asks for (./write.ts, PictureMaker), made with the
// person's key (./README.md, "Pictures made for a page"):
// - photoMaker: one photo of OpenAI's image model at the quality the
//   person chose (./context.tsx, photo), from what the plan says it shows
//   and the rules every picture keeps (./prompts.ts, photoPrompt); its
//   bytes read for what they are and their size (./draw.ts).
// - illustrationMaker: the model the person chose draws an SVG in the
//   site's palette (./prompts.ts, illustrationQuestion), counted as an
//   illustration; it is cleaned (./svg.ts) and drawn to a picture
//   (./draw.ts). One that is not clean cost its tokens all the same, said
//   with them (PictureError).
// Each is made for one run, bound to the key the run began with (Bound):
// its pictures are asked with that key and model alone, and once that key
// is forgotten or replaced the maker's `gone` aborts, so that ./write.ts
// stops what is in flight and asks for nothing more. What finishes a
// picture in the browser is passed in, so a test runs these without a
// canvas.
import type { PaletteSlot } from "../shared/document.ts";
import type { AssistantStore, Bound } from "./context.tsx";
import { drawSvg, fromBase64, readPhoto, type Finished } from "./draw.ts";
import { PICTURE_SIZES, sizeName } from "./pictures.ts";
import type { ImageQuality } from "./prices.ts";
import { illustrationQuestion, photoPrompt } from "./prompts.ts";
import { cleanSvg } from "./svg.ts";
import { PictureError, type PictureMaker } from "./write.ts";

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// A new site's pictures keep to its imagery, the sentence its direction
// gives (`imagery`), which goes with each one's question.
export function photoMaker(assistant: AssistantStore, bound: Bound, quality: ImageQuality, read: (bytes: Uint8Array) => Promise<Finished> = readPhoto, imagery = ""): PictureMaker {
  return {
    kind: "photo",
    gone: bound.gone,
    async make(ask, signal) {
      const answer = await assistant.getState().photo({ prompt: photoPrompt(ask, imagery), size: sizeName(ask.shape), quality }, signal, bound);
      try {
        return { ...(await read(fromBase64(answer.base64))), tally: answer.tally };
      } catch (error) {
        throw new PictureError(`what came back could not be used: ${reason(error)}.`, answer.tally);
      }
    },
  };
}

// The SVG an illustration's answer holds: its one key, any code fence a
// model put around it taken off.
export function svgOf(text: string): string | null {
  let answer: unknown;
  try {
    answer = JSON.parse(text);
  } catch {
    return null;
  }
  const svg = (answer as { svg?: unknown } | null)?.svg;
  if (typeof svg !== "string") return null;
  const fenced = /^\s*```[a-z]*\s*\n([\s\S]*?)\n?\s*```\s*$/i.exec(svg);
  return fenced ? fenced[1]! : svg;
}

export function illustrationMaker(assistant: AssistantStore, bound: Bound, palette: Readonly<Record<PaletteSlot, string>>, draw: (svg: string, size: { width: number; height: number }) => Promise<Finished> = drawSvg, imagery = ""): PictureMaker {
  return {
    kind: "illustration",
    gone: bound.gone,
    async make(ask, signal) {
      const answer = await assistant.getState().ask((model) => illustrationQuestion(model, ask, palette, imagery), () => undefined, signal, "illustration", bound);
      const size = PICTURE_SIZES[ask.shape];
      const svg = svgOf(answer.text);
      if (svg === null) throw new PictureError("its answer held no SVG.", answer.tally);
      const cleaned = cleanSvg(svg, size);
      if (!cleaned.ok) throw new PictureError(`it was not clean: ${cleaned.reason}.`, answer.tally);
      try {
        return { ...(await draw(cleaned.svg, size)), tally: answer.tally };
      } catch (error) {
        throw new PictureError(`the browser could not draw it: ${reason(error)}.`, answer.tally);
      }
    },
  };
}
