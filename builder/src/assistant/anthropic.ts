// Anthropic's models for the Assistant (./providers.ts), through Anthropic's
// own SDK, loaded only when the Assistant first calls on it. The browser
// calls the API with the person's own key (dangerouslyAllowBrowser: the
// SDK's guard against shipping a site's key to its visitors, which does
// not apply to a key the visitor brings).
//
// A question is one Messages request, streamed: adaptive thinking, the
// answer held to the question's JSON schema (structured outputs,
// output_config.format), and an effort that fits the task. Only models
// that take both are offered: Claude 4.6 and later.
//
// What it used is the message's usage, which the stream adds up as it
// comes: input_tokens (not read from the cache, not written to it),
// cache_read_input_tokens, cache_creation_input_tokens and output_tokens,
// the thinking included. The Assistant asks for no cache: a write, should
// one come, is priced as the five-minute cache's.
import Anthropic from "@anthropic-ai/sdk";
import { AssistantError, said, type ModelChoice, type ProviderClient, type Question, type Usage } from "./providers.ts";

export const NAME = "Anthropic";
// The model a key that may use it starts with.
export const PREFERRED = "claude-opus-5-5";

// The parts of the SDK's client the Assistant uses: a test gives its own.
export interface AnthropicLike {
  models: { list(params?: { limit?: number }, options?: { signal?: AbortSignal | undefined }): AsyncIterable<{ id: string; display_name: string; created_at: string }> };
  messages: {
    stream(body: Anthropic.MessageStreamParams, options?: { signal?: AbortSignal | undefined; maxRetries?: number }): {
      on(event: "text", listener: (delta: string) => void): unknown;
      finalMessage(): Promise<Anthropic.Message>;
    };
  };
}

const client = (key: string): AnthropicLike => new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 5 * 60 * 1000 });

// A model's version from its id ("claude-opus-4-6" is 4.6, "claude-sonnet-5"
// 5, a date at the end is not a version), or null.
export function versionOf(id: string): number | null {
  const found = /^claude-[a-z]+-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(id);
  return found ? Number(found[1]) + Number(found[2] ?? 0) / 10 : null;
}

// The tokens a message used, from the SDK's usage object. A count the
// stream never gave is none.
export function usageOf(usage: Pick<Anthropic.Usage, "input_tokens" | "cache_read_input_tokens" | "cache_creation_input_tokens" | "output_tokens">): Usage {
  return {
    input: usage.input_tokens,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
    output: usage.output_tokens,
  };
}

export function anthropic(make: (key: string) => AnthropicLike = client): ProviderClient {
  return {
    async models(key, signal) {
      try {
        const found: Array<ModelChoice & { created: string }> = [];
        for await (const model of make(key).models.list({ limit: 100 }, { signal })) {
          const version = versionOf(model.id);
          if (version !== null && version >= 4.6) found.push({ id: model.id, name: model.display_name, created: model.created_at });
        }
        found.sort((a, b) => (a.id === PREFERRED ? -1 : b.id === PREFERRED ? 1 : b.created.localeCompare(a.created)));
        return found.map(({ id, name }) => ({ id, name }));
      } catch (error) {
        throw said(error, NAME, key, signal);
      }
    },

    async ask(key, question: Question, written, signal) {
      try {
        const content: Anthropic.ContentBlockParam[] = [];
        if (question.image) content.push({ type: "image", source: { type: "base64", media_type: question.image.mediaType as Anthropic.Base64ImageSource["media_type"], data: question.image.base64 } });
        content.push({ type: "text", text: question.text });
        const stream = make(key).messages.stream({
          model: question.model,
          max_tokens: question.maxTokens,
          system: question.system,
          thinking: { type: "adaptive" },
          output_config: { format: { type: "json_schema", schema: question.schema }, effort: question.effort },
          messages: [{ role: "user", content }],
        }, question.once ? { signal, maxRetries: 0 } : { signal });
        stream.on("text", (delta) => written(delta));
        const message = await stream.finalMessage();
        const usage = usageOf(message.usage);
        if (message.stop_reason === "refusal") throw new AssistantError("Claude would not write this. Try other words.", "refused", usage);
        if (message.stop_reason === "max_tokens") throw new AssistantError("The answer was longer than the Assistant allows, and was cut. Ask for less.", "cut", usage);
        const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
        return { text, usage };
      } catch (error) {
        throw said(error, NAME, key, signal);
      }
    },
  };
}
