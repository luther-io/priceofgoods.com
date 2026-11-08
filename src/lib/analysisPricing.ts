import type { AnalysisUsage } from "./types.ts";

export const ANALYSIS_REVIEW_RATES: Record<string, { input: number; output: number; write: number; read: number }> = {
  "claude-opus-5": { input: 5, output: 25, write: 6.25, read: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, write: 2.5, read: 0.1 },
  "claude-opus-5-5": { input: 4, output: 20, write: 5, read: 0.2 },
};

export function analysisCostUsd(model: string, usage: Omit<AnalysisUsage, "model">): number {
  const price = ANALYSIS_REVIEW_RATES[model];
  if (!price) throw new Error(`No reviewed pricing for ${model}`);
  return (
    usage.input_tokens * price.input + usage.output_tokens * price.output +
    usage.cache_creation_input_tokens * price.write + usage.cache_read_input_tokens * price.read
  ) / 1e6 + usage.web_search_requests * 0.01;
}
