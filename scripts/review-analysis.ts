import Anthropic from "@anthropic-ai/sdk";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildAnalysisPrompt } from "../src/lib/analysisPrompt.ts";
import type { BlsObservation } from "../src/lib/analysisPrompt.ts";
import { buildAnthropicRequest, parseAnthropicTurn, requestAnthropicAnalysis } from "../src/lib/analysisClient.ts";
import { ANALYSIS_REVIEW_RATES as rates, analysisCostUsd } from "../src/lib/analysisPricing.ts";
import type { Good, GoodsConfig } from "../src/lib/types.ts";

const execute = process.argv.includes("--run");
const budgetIndex = process.argv.indexOf("--budget");
const budget = budgetIndex === -1 ? 5 : Number(process.argv[budgetIndex + 1]);
if (!Number.isFinite(budget) || budget <= 0) throw new Error("Budget must be a positive USD amount");
const spentIndex = process.argv.indexOf("--spent");
const previousSpend = spentIndex === -1 ? 0 : Number(process.argv[spentIndex + 1]);
if (!Number.isFinite(previousSpend) || previousSpend < 0 || previousSpend > budget) throw new Error("Invalid previous spend");
const modelsIndex = process.argv.indexOf("--models");
const models = modelsIndex === -1 ? Object.keys(rates) : (process.argv[modelsIndex + 1] ?? "").split(",");
if (!models.length || models.some((model) => !Object.hasOwn(rates, model))) throw new Error("Choose only reviewed Claude model IDs");
const researchDate = new Date().toISOString().slice(0, 10);

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Data fetch failed: ${response.status} ${url}`);
  return response.json();
}

const config = await fetchJson<GoodsConfig>("https://data.priceofgoods.com/goods.json");
const goods = Object.values(config.categories).flatMap((category) => Object.values(category.items));
const cases = await Promise.all(["eggs", "apples", "electricity"].map(async (key) => {
  const item = goods.find((good) => good.dataKey === key) as Good | undefined;
  if (!item) throw new Error(`Missing good: ${key}`);
  const { data } = await fetchJson<{ data: BlsObservation[] }>(`https://data.priceofgoods.com/national/${key}.json`);
  return { item, prompt: buildAnalysisPrompt(item, data, researchDate), originalCharacters: JSON.stringify(data).length };
}));

// Reserve search-result input beyond the submitted prompt; this is not a provider-enforced cap.
function reserve(model: string, prompt: ReturnType<typeof buildAnalysisPrompt>) {
  const price = rates[model];
  const promptBytes = Buffer.byteLength(JSON.stringify(buildAnthropicRequest(prompt, model)));
  return (promptBytes * price.write + 100000 * price.input + 4000 * price.output) / 1e6 + 0.01;
}

const planned = models.flatMap((model) => cases.map((example) => ({ model, ...example })));
const projected = planned.reduce((sum, run) => sum + reserve(run.model, run.prompt), 0);
console.log(JSON.stringify({
  mode: execute ? "live" : "preflight-only", budgetUsd: budget, previousSpendUsd: previousSpend, reservedTotalUsd: projected + previousSpend,
  reports: planned.length, researchDate,
  inputs: cases.map(({ item, prompt, originalCharacters }) => ({
    item: item.dataKey, dataThrough: prompt.input.dataThrough,
    observations: prompt.input.monthlyPrices.length, originalCharacters, compactCharacters: prompt.user.length,
  })),
}, null, 2));
if (projected + previousSpend > budget) throw new Error("Projected reserve exceeds the approved budget; no model calls made");

if (execute) {
  const apiKey = process.env.PUBLIC_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("PUBLIC_ANTHROPIC_API_KEY is required for live review");
  const directory = path.resolve(".cache/analysis-review", new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(directory, { recursive: true });
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const journal: Record<string, unknown>[] = [];
  let spent = previousSpend;
  for (const run of planned) {
    if (spent + reserve(run.model, run.prompt) > budget) throw new Error(`Budget reserve exhausted; results: ${directory}`);
    const started = performance.now();
    const turn = await requestAnthropicAnalysis(client, run.prompt, run.model);
    const elapsedMs = Math.round(performance.now() - started);
    const costUsd = analysisCostUsd(run.model, turn.usage);
    spent += costUsd;
    const stem = `${run.model}-${run.item.dataKey}`;
    await writeFile(path.join(directory, `${stem}.json`), JSON.stringify({
      input: run.prompt.input, system: run.prompt.system, responses: turn.responses, elapsedMs, costUsd,
    }, null, 2));
    let report;
    let error;
    try {
      report = parseAnthropicTurn(turn);
      await writeFile(path.join(directory, `${stem}.md`), report.markdown);
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    }
    const markdown = report?.markdown ?? "";
    const body = markdown.replace(/^# .+$/m, "").replace(/^## /gm, "").replace(/[*_`]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    const entry = {
      model: run.model, item: run.item.dataKey, elapsedMs, costUsd, totalCostUsd: spent,
      wordCount: body.trim() ? body.trim().split(/\s+/).length : 0,
      headings: [...markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1]),
      exactTitle: markdown.startsWith(`# ${run.prompt.input.title}\n`),
      citations: report?.citations.length ?? 0,
      requests: turn.responses.length, usage: turn.usage, ...(error ? { error } : {}),
    };
    journal.push(entry);
    await writeFile(path.join(directory, "summary.json"), JSON.stringify({ researchDate, budgetUsd: budget, previousSpendUsd: previousSpend, runCostUsd: spent - previousSpend, totalCostUsd: spent, runs: journal }, null, 2));
    console.log(JSON.stringify(entry));
    if (error) throw new Error(`Incomplete live response; stopped without retrying: ${error}`);
    if (spent > budget) throw new Error(`Budget exceeded; no further calls. Results: ${directory}`);
  }
  console.log(`Live review saved to ${directory}`);
}
