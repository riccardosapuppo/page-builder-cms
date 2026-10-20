// OpenAI's models for the Assistant (./providers.ts), through OpenAI's own
// SDK, loaded only when the Assistant first calls on it. The browser calls
// the API with the person's own key (dangerouslyAllowBrowser: the SDK's
// guard against shipping a site's key to its visitors, which does not
// apply to a key the visitor brings).
//
// A question is one Chat Completions request, streamed, the answer held to
// the question's JSON schema (response_format json_schema, strict), with
// the usage counted in the last piece. The models offered are the ones
// that take such a schema, newest first: GPT-4o and later, the o3 and o4
// reasoning models; not the audio, image, search and other special ones.
//
// What it used is that last piece's usage: prompt_tokens, of which
// prompt_tokens_details.cached_tokens were read from the cache and
// prompt_tokens_details.cache_write_tokens written to it, and
// completion_tokens, the reasoning included. That both are parts of
// prompt_tokens is read from the SDK's description of the fields; the
// prices are the pricing page's (./prices.ts).
//
// Photos for a page (./pictures.ts) are one Images API request each
// (images.generate), with the newest GPT Image model the key may use: one
// photo, at the size of its shape and the quality the person chose, as a
// WebP at PHOTO_COMPRESSION, asked once (no retry of the SDK's: one that
// timed out may still have been billed), within the client's own timeout.
// What it used is the response's usage:
// input_tokens, of which input_tokens_details gives the text's and any
// image's, and output_tokens.
import OpenAI from "openai";
import { AssistantError, NO_USAGE, said, type ImageUsage, type ModelChoice, type ProviderClient, type Question, type Usage } from "./providers.ts";

export const NAME = "OpenAI";
// A photo's WebP compression, out of 100: small files for a page, the
// picture still sharp.
export const PHOTO_COMPRESSION = 80;

type Chunk = {
  choices: Array<{ delta?: { content?: string | null; refusal?: string | null }; finish_reason?: string | null }>;
  usage?: OpenAI.CompletionUsage | null;
};

// The tokens a completion used, from the SDK's usage object: the prompt's
// tokens read from the cache and written to it, as parts of prompt_tokens,
// the rest of it plain input. Parts that would add up to more than the
// prompt are cut to it, the cached tokens first, so none goes below nothing.
export function usageOf(usage: Pick<OpenAI.CompletionUsage, "prompt_tokens" | "completion_tokens" | "prompt_tokens_details">): Usage {
  const prompt = Math.max(0, usage.prompt_tokens);
  const cacheRead = Math.min(Math.max(0, usage.prompt_tokens_details?.cached_tokens ?? 0), prompt);
  const cacheWrite = Math.min(Math.max(0, usage.prompt_tokens_details?.cache_write_tokens ?? 0), prompt - cacheRead);
  return { input: prompt - cacheRead - cacheWrite, cacheRead, cacheWrite, output: usage.completion_tokens };
}

// The tokens a photo used, from the Images API's usage object: of
// input_tokens, the image tokens input_tokens_details gives (none when it
// gives no details), the rest the words; and output_tokens.
export function imageUsageOf(usage: Pick<OpenAI.ImagesResponse.Usage, "input_tokens" | "output_tokens"> & { input_tokens_details?: Partial<OpenAI.ImagesResponse.Usage.InputTokensDetails> | null }): ImageUsage {
  const input = Math.max(0, usage.input_tokens);
  const imageInput = Math.min(Math.max(0, usage.input_tokens_details?.image_tokens ?? 0), input);
  return { textInput: input - imageInput, imageInput, output: Math.max(0, usage.output_tokens) };
}

// The parts of the SDK's client the Assistant uses: a test gives its own,
// with no images where it makes no photo.
export interface OpenAILike {
  models: { list(options?: { signal?: AbortSignal | undefined }): AsyncIterable<{ id: string; created: number }> };
  chat: { completions: { create(body: OpenAI.ChatCompletionCreateParamsStreaming, options?: { signal?: AbortSignal | undefined; maxRetries?: number }): PromiseLike<AsyncIterable<Chunk>> } };
  images?: { generate(body: OpenAI.ImageGenerateParamsNonStreaming, options?: { signal?: AbortSignal | undefined; maxRetries?: number }): PromiseLike<OpenAI.ImagesResponse> };
}

const client = (key: string): OpenAILike => new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 5 * 60 * 1000 }) as unknown as OpenAILike;

const TAKES_A_SCHEMA = /^(?:gpt-4o|gpt-4\.1|gpt-[5-9]|o3|o4)/;
const SPECIAL = /audio|realtime|tts|transcribe|image|embedding|search|instruct|codex|moderation|computer-use|oss|deep-research/;

export function offered(id: string): boolean {
  return TAKES_A_SCHEMA.test(id) && !SPECIAL.test(id);
}

// The newest GPT Image model listed: by when it was made, a full model
// before its mini of the same day. A dated snapshot is left to its model,
// as the pricing page prices the model, not the snapshot.
export function photoModelOf(listed: ReadonlyArray<{ id: string; created: number }>): string | null {
  const small = (id: string) => (/mini|nano/.test(id) ? 1 : 0);
  const models = listed.filter(({ id }) => id.startsWith("gpt-image-") && !/-\d{4}-\d{2}-\d{2}$/.test(id));
  return models.toSorted((a, b) => b.created - a.created || small(a.id) - small(b.id) || a.id.localeCompare(b.id))[0]?.id ?? null;
}

export function openai(make: (key: string) => OpenAILike = client): ProviderClient {
  return {
    async models(key, signal) {
      try {
        const found: Array<{ id: string; created: number }> = [];
        for await (const model of make(key).models.list({ signal })) if (offered(model.id)) found.push({ id: model.id, created: model.created });
        // Newest first; of the same day, the full models before the mini and nano ones.
        const small = (id: string) => (/mini|nano/.test(id) ? 1 : 0);
        found.sort((a, b) => b.created - a.created || small(a.id) - small(b.id) || a.id.localeCompare(b.id));
        return found.map(({ id }): ModelChoice => ({ id, name: id }));
      } catch (error) {
        throw said(error, NAME, key, signal);
      }
    },

    async ask(key, question: Question, written, signal) {
      try {
        const content: OpenAI.ChatCompletionContentPart[] = [];
        if (question.image) content.push({ type: "image_url", image_url: { url: `data:${question.image.mediaType};base64,${question.image.base64}` } });
        content.push({ type: "text", text: question.text });
        const stream = await make(key).chat.completions.create({
          model: question.model,
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: question.maxTokens,
          messages: [{ role: "system", content: question.system }, { role: "user", content }],
          response_format: { type: "json_schema", json_schema: { name: question.name, schema: question.schema, strict: true } },
        }, question.once ? { signal, maxRetries: 0 } : { signal });
        let text = "";
        let refusal = "";
        let finish: string | null = null;
        let usage = NO_USAGE;
        for await (const chunk of stream) {
          const choice = chunk.choices[0];
          const piece = choice?.delta?.content ?? "";
          if (piece) {
            text += piece;
            written(piece);
          }
          refusal += choice?.delta?.refusal ?? "";
          finish = choice?.finish_reason ?? finish;
          if (chunk.usage) usage = usageOf(chunk.usage);
        }
        if (refusal || finish === "content_filter") throw new AssistantError(`The model would not write this.${refusal ? ` It said: ${refusal}` : ""}`, "refused", usage);
        if (finish === "length") throw new AssistantError("The answer was longer than the Assistant allows, and was cut. Ask for less.", "cut", usage);
        return { text, usage };
      } catch (error) {
        throw said(error, NAME, key, signal);
      }
    },

    photos: {
      async model(key, signal) {
        try {
          const listed: Array<{ id: string; created: number }> = [];
          for await (const model of make(key).models.list({ signal })) listed.push({ id: model.id, created: model.created });
          return photoModelOf(listed);
        } catch (error) {
          throw said(error, NAME, key, signal);
        }
      },

      async make(key, ask, signal) {
        try {
          const images = make(key).images;
          if (!images) throw new AssistantError("This connection to OpenAI makes no pictures.", "other");
          const response = await images.generate({
            model: ask.model,
            prompt: ask.prompt,
            n: 1,
            size: ask.size,
            quality: ask.quality,
            output_format: "webp",
            output_compression: PHOTO_COMPRESSION,
            // Asked once: a photo that timed out may have been billed, and is not asked again behind the person's back.
          }, { signal, maxRetries: 0 });
          const base64 = response.data?.[0]?.b64_json;
          if (typeof base64 !== "string" || base64 === "") throw new AssistantError("OpenAI sent no picture back.", "answer");
          return { base64, usage: response.usage ? imageUsageOf(response.usage) : null };
        } catch (error) {
          throw said(error, NAME, key, signal);
        }
      },
    },
  };
}
