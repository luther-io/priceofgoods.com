import { fetchItemHistory } from "./fetchUtils";
import { cacheAnalysis, getCachedAnalysis } from "./llmcache";
import { ANALYSIS_MODEL, fetchAnthropicAnalysis, fetchPerplexityAnalysis } from "./analysisClient";
import { analyzePrices } from "./analysisService";

/**
 * @param {import('./types').Good} item
 * @param {boolean} useAnthropic
 * @returns {Promise<import('./types').PriceAnalysis>}
 */
export async function analyzeItemPrices(item, useAnthropic = true) {
  return analyzePrices(item, {
    development: import.meta.env.DEV,
    cacheResponse: import.meta.env.PUBLIC_CACHE_AI_RESPONSE,
    provider: useAnthropic ? "Claude" : "Perplexity",
    ...(useAnthropic ? { model: ANALYSIS_MODEL } : {}),
  }, {
    loadHistory: (itemKey) => fetchItemHistory("national", itemKey),
    generate: (prompt) => useAnthropic
      ? fetchAnthropicAnalysis(prompt, { apiKey: import.meta.env.PUBLIC_ANTHROPIC_API_KEY })
      : fetchPerplexityAnalysis(prompt, import.meta.env.PUBLIC_PERPLEXITY_API_KEY),
    cache: {
      get: getCachedAnalysis,
      set: (itemKey, result, prompt) => cacheAnalysis(
        itemKey, result.data, result.citations, `${prompt.system}\n\n${prompt.user}`,
        useAnthropic ? "anthropic" : "perplexity",
        result.model,
      ),
    },
  });
}
