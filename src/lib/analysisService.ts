import { buildAnalysisPrompt } from "./analysisPrompt.ts";
import type { AnalysisPrompt, BlsObservation } from "./analysisPrompt.ts";
import type { AnalysisResponse } from "./analysisClient.ts";
import type { Good, PriceAnalysis } from "./types.ts";

interface AnalysisDependencies {
  loadHistory: (itemKey: string) => Promise<BlsObservation[]>;
  generate: (prompt: AnalysisPrompt) => Promise<AnalysisResponse>;
  cache: {
    get: (itemKey: string, model?: string) => Promise<PriceAnalysis | null>;
    set: (itemKey: string, result: PriceAnalysis, prompt: AnalysisPrompt) => Promise<void>;
  };
  logger?: Pick<Console, "error" | "warn">;
}

export async function analyzePrices(
  item: Good,
  options: {
    development: boolean;
    cacheResponse?: string | boolean;
    provider: string;
    /** Expected model; local reports from other models are not reused. */
    model?: string;
    now?: () => Date;
  },
  dependencies: AnalysisDependencies,
): Promise<PriceAnalysis> {
  const logger = dependencies.logger ?? console;
  const now = options.now ?? (() => new Date());
  const readLocalCache = options.development && (
    options.cacheResponse === true || String(options.cacheResponse).trim().toLowerCase() === "true"
  );
  if (readLocalCache) {
    try {
      const cached = await dependencies.cache.get(item.dataKey, options.model);
      if (cached) return cached;
    } catch (error) {
      logger.warn(`Local analysis cache unavailable for ${item.name}`, error);
    }
  }
  try {
    const history = await dependencies.loadHistory(item.dataKey);
    const prompt = buildAnalysisPrompt(item, history, now().toISOString().slice(0, 10));
    const response = await dependencies.generate(prompt);
    const result: PriceAnalysis = {
      data: response.markdown,
      citations: response.citations,
      timestamp: now().getTime(),
      provider: options.provider,
      ...(response.usage ? { model: response.usage.model, usage: response.usage } : {}),
    };
    if (options.development) {
      try {
        await dependencies.cache.set(item.dataKey, result, prompt);
      } catch (error) {
        logger.warn(`Could not save local analysis for ${item.name}`, error);
      }
    }
    return result;
  } catch (error) {
    logger.error(`Error analyzing prices for ${item.name}`, error);
    return {
      data: `# ${item.name} Price Analysis\n\nPrice analysis data is currently unavailable. Please check back later.`,
      citations: [],
      timestamp: now().getTime(),
      provider: "None",
    };
  }
}
