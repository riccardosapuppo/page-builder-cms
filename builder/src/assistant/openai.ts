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
import OpenAI from "openai";
import { AssistantError, NO_USAGE, said, type ModelChoice, type ProviderClient, type Question, type Usage } from "./providers.ts";

export const NAME = "OpenAI";

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

// The parts of the SDK's client the Assistant uses: a test gives its own.
export interface OpenAILike {
  models: { list(options?: { signal?: AbortSignal | undefined }): AsyncIterable<{ id: string; created: number }> };
  chat: { completions: { create(body: OpenAI.ChatCompletionCreateParamsStreaming, options?: { signal?: AbortSignal | undefined }): PromiseLike<AsyncIterable<Chunk>> } };
}

const client = (key: string): OpenAILike => new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 5 * 60 * 1000 }) as unknown as OpenAILike;

const TAKES_A_SCHEMA = /^(?:gpt-4o|gpt-4\.1|gpt-[5-9]|o3|o4)/;
const SPECIAL = /audio|realtime|tts|transcribe|image|embedding|search|instruct|codex|moderation|computer-use|oss|deep-research/;

export function offered(id: string): boolean {
  return TAKES_A_SCHEMA.test(id) && !SPECIAL.test(id);
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
        throw said(error, NAME, key);
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
        }, { signal });
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
        throw said(error, NAME, key);
      }
    },
  };
}
