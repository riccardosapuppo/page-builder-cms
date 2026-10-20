// The two providers a person can bring a key for (./key.ts), behind one
// interface: the models the key may use, and one question asked of one of
// them, its answer JSON in a schema, streamed as it is written. Each
// provider's module (./anthropic.ts, ./openai.ts) and its SDK are loaded
// the first time the Assistant calls on it: the editor's own code carries
// neither, and a person who never opens the Assistant downloads neither.
//
// Calls go from this browser straight to the provider, with the person's
// own key: no server of this site is in between. What goes wrong is said
// in a sentence (AssistantError), with the key taken out of anything a
// provider's message might have repeated of it.
//
// Each call hands back the tokens it used (Usage), read from the provider's
// own count in its SDK's usage object, as it bills them: input at the base
// price, input read from the prompt cache, input written to it, and output,
// thinking and reasoning included. ./tally.ts prices them.
//
// A provider that makes photos (OpenAI's, ./pictures.ts) has `photos`: the
// image model a key would make them with, and one photo, with the tokens
// its making used (ImageUsage), as the Images API counts them. A picture,
// photo or illustration (Question.once), is asked once: the SDK tries a
// failed or timed-out request again on its own, and one that timed out may
// still have been billed. The page's own question keeps the SDK's retry.
import type { ProviderId } from "./key.ts";
import type { ImageQuality, ImageSize } from "./prices.ts";
import type { Tally } from "./tally.ts";

export interface ModelChoice {
  id: string;
  name: string;
}

export interface Usage {
  // Input tokens at the base price: neither read from the cache nor written to it.
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

export const NO_USAGE: Usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };

export interface Question {
  model: string;
  system: string;
  text: string;
  // A picture to look at with the text (an image's alt text).
  image?: { mediaType: string; base64: string };
  schema: Record<string, unknown>;
  // The schema's name, letters, digits, "_" and "-".
  name: string;
  maxTokens: number;
  // How much thought the answer deserves.
  effort: "low" | "medium" | "high";
  // Asked once, never tried again by the SDK behind the person's back: a
  // picture's request, which may have been billed though it timed out.
  once?: boolean;
}

export interface Answer {
  text: string;
  usage: Usage;
}

// The tokens a picture model used: the words asked (text in), any picture
// sent with them (image in), and the picture made (out).
export interface ImageUsage {
  textInput: number;
  imageInput: number;
  output: number;
}

// One photo asked of a provider's image model.
export interface PhotoAsk {
  model: string;
  prompt: string;
  size: ImageSize;
  quality: ImageQuality;
}

export interface PhotoAnswer {
  // The picture as the provider sent it, in base64.
  base64: string;
  // What making it used, or null where the answer did not say.
  usage: ImageUsage | null;
}

export interface ProviderClient {
  models(key: string, signal?: AbortSignal): Promise<ModelChoice[]>;
  // Streams the answer's text to `written` piece by piece, then gives the
  // whole of it.
  ask(key: string, question: Question, written: (piece: string) => void, signal?: AbortSignal): Promise<Answer>;
  // The photos of a provider that makes them: the image model the key
  // would make them with (null: none it may use), and one photo.
  photos?: {
    model(key: string, signal?: AbortSignal): Promise<string | null>;
    make(key: string, ask: PhotoAsk, signal?: AbortSignal): Promise<PhotoAnswer>;
  };
}

export type AssistantErrorKind = "key" | "model" | "limit" | "busy" | "refused" | "cut" | "network" | "stopped" | "answer" | "other";

export class AssistantError extends Error {
  readonly kind: AssistantErrorKind;
  // An answer refused or cut short was billed all the same: the tokens it
  // used, as the provider said them, and what they come to, priced by the
  // Assistant's state (./context.tsx).
  readonly usage: Usage | null;
  readonly tally: Tally | null;

  constructor(message: string, kind: AssistantErrorKind, usage: Usage | null = null, tally: Tally | null = null) {
    super(message);
    this.name = "AssistantError";
    this.kind = kind;
    this.usage = usage;
    this.tally = tally;
  }
}

export async function providerClient(id: ProviderId): Promise<ProviderClient> {
  if (id === "anthropic") return (await import("./anthropic.ts")).anthropic();
  return (await import("./openai.ts")).openai();
}

// What a call to a provider came to, said in a sentence: an SDK's error
// read by its HTTP status and its name, which both SDKs give, the key
// taken out of its message. A call its caller stopped (`signal`) is
// stopped, whatever the error: neither SDK's abort error carries its
// class's name.
export function said(error: unknown, provider: string, key: string, signal?: AbortSignal): AssistantError {
  if (signal?.aborted) return new AssistantError("Stopped.", "stopped");
  if (error instanceof AssistantError) return error;
  const { status, name, message } = (error ?? {}) as { status?: number; name?: string; message?: string };
  const detail = (message ?? "").split(key).join("…").replace(/\s+/g, " ").trim();
  if (name === "APIUserAbortError" || name === "AbortError") return new AssistantError("Stopped.", "stopped");
  if (name === "APIConnectionError" || name === "APIConnectionTimeoutError" || error instanceof TypeError) {
    return new AssistantError(`${provider} could not be reached from this browser. Check the connection, then try again.`, "network");
  }
  switch (status) {
    case 401:
      return new AssistantError(`${provider} did not accept this key. Check it was copied whole, or make a new one.`, "key");
    case 403:
      return new AssistantError(`${provider} does not let this key do this.${detail ? ` It said: ${detail}` : ""}`, "key");
    case 404:
      return new AssistantError(`${provider} has no such model for this key. Pick another.`, "model");
    case 429:
      return new AssistantError(`${provider} asks to wait: too many requests, or the account's credit has run out.`, "limit");
    case 500: case 502: case 503: case 529:
      return new AssistantError(`${provider} is busy just now. Try again in a minute.`, "busy");
    case 400: case 413: case 422:
      return new AssistantError(`${provider} refused the request.${detail ? ` It said: ${detail}` : ""}`, "other");
    default:
      return new AssistantError(`Something went wrong with ${provider}.${detail ? ` ${detail}` : ""}`, "other");
  }
}
