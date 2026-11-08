import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  ContentBlockParam,
  Message,
  MessageCreateParamsNonStreaming,
  TextBlock,
} from "@anthropic-ai/sdk/resources/messages";
import type { AnalysisPrompt } from "./analysisPrompt.ts";
import type { AnalysisUsage, Citation } from "./types.ts";

export const ANALYSIS_MODEL = "claude-sonnet-5-5";
export const MAX_WEB_SEARCHES = 2;
// Server-side search turns can pause; each continuation is another billed request.
export const MAX_CONTINUATIONS = 3;
const REQUEST_TIMEOUT_MS = 180000;

export interface AnalysisResponse {
  markdown: string;
  citations: (string | Citation)[];
  usage?: AnalysisUsage;
}

export interface AnthropicTurn {
  responses: Message[];
  content: ContentBlock[];
  stopReason: Message["stop_reason"];
  usage: AnalysisUsage;
}

export function buildAnthropicRequest(
  prompt: AnalysisPrompt,
  model = ANALYSIS_MODEL,
): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 4000,
    system: [{ type: "text", text: prompt.system, cache_control: { type: "ephemeral", ttl: "5m" } }],
    messages: [{ role: "user", content: prompt.user }],
    tools: [
      {
        // Basic search: dynamic filtering (20260209+) needs code execution, which HIPAA-configured orgs reject.
        type: "web_search_20250305",
        name: "web_search",
        blocked_domains: ["apple.com", "appleinsider.com"],
        max_uses: MAX_WEB_SEARCHES,
      },
    ],
  };
}

function responseUsage(response: Message): AnalysisUsage {
  return {
    model: response.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    web_search_requests: response.usage.server_tool_use?.web_search_requests ?? 0,
  };
}

function addUsage(total: AnalysisUsage, next: AnalysisUsage): AnalysisUsage {
  return {
    model: next.model,
    input_tokens: total.input_tokens + next.input_tokens,
    output_tokens: total.output_tokens + next.output_tokens,
    cache_creation_input_tokens: total.cache_creation_input_tokens + next.cache_creation_input_tokens,
    cache_read_input_tokens: total.cache_read_input_tokens + next.cache_read_input_tokens,
    web_search_requests: total.web_search_requests + next.web_search_requests,
  };
}

/** Sends the request, continuing paused server-tool turns, and returns every raw response. */
export async function requestAnthropicAnalysis(
  client: Anthropic,
  prompt: AnalysisPrompt,
  model = ANALYSIS_MODEL,
): Promise<AnthropicTurn> {
  const request = buildAnthropicRequest(prompt, model);
  const responses = [await client.messages.create(request, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })];
  let content = [...responses[0].content];
  let usage = responseUsage(responses[0]);
  while (responses.at(-1)!.stop_reason === "pause_turn" && responses.length <= MAX_CONTINUATIONS) {
    const response = await client.messages.create(
      {
        ...request,
        messages: [
          ...request.messages,
          { role: "assistant", content: content as ContentBlockParam[] },
        ],
      },
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    responses.push(response);
    content = [...content, ...response.content];
    usage = addUsage(usage, responseUsage(response));
  }
  return { responses, content, stopReason: responses.at(-1)!.stop_reason, usage };
}

export function parseAnthropicTurn(turn: AnthropicTurn): AnalysisResponse {
  if (turn.stopReason === "max_tokens" || turn.stopReason === "pause_turn") {
    throw new Error(`Incomplete analysis: ${turn.stopReason}`);
  }
  // Text before or between tool calls is search narration ("I'll search..."), not the report.
  const lastToolBlock = turn.content.findLastIndex((block) => block.type !== "text");
  const text = turn.content
    .slice(lastToolBlock + 1)
    .filter((block): block is TextBlock => block.type === "text");
  const markdown = text.map((block) => block.text).join("").trim();
  if (!markdown) throw new Error("Empty analysis response");
  const citations = text.flatMap((block) => block.citations ?? []).map((citation) => ({
    url: "url" in citation ? citation.url : "",
    title: "title" in citation ? citation.title ?? "Reference source" : "Reference source",
    text: citation.cited_text,
  }));
  return { markdown, citations, usage: turn.usage };
}

export async function fetchAnthropicAnalysis(
  prompt: AnalysisPrompt,
  options: {
    apiKey: string;
    model?: string;
    fetch?: typeof globalThis.fetch;
    maxRetries?: number;
    logger?: Pick<Console, "info">;
  },
): Promise<AnalysisResponse> {
  if (!options.apiKey) throw new Error("Anthropic API key is not configured");
  const client = new Anthropic({
    apiKey: options.apiKey,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
  });
  const turn = await requestAnthropicAnalysis(client, prompt, options.model);
  (options.logger ?? console).info("Price analysis API usage", {
    ...turn.usage,
    requests: turn.responses.length,
  });
  return parseAnthropicTurn(turn);
}

export async function fetchPerplexityAnalysis(prompt: AnalysisPrompt, apiKey: string): Promise<AnalysisResponse> {
  if (!apiKey) throw new Error("Perplexity API key is not configured");
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
      frequency_penalty: 1,
      temperature: 0.2,
      max_tokens: 1000,
    }),
  });
  if (!response.ok) throw new Error(`Perplexity request failed (${response.status})`);
  const result = await response.json();
  const markdown = result.choices?.[0]?.message?.content;
  if (typeof markdown !== "string" || !markdown.trim()) throw new Error("Empty analysis response");
  return { markdown, citations: result.citations ?? [] };
}
