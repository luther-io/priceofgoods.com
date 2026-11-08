import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ANALYSIS_POLICY, buildAnalysisPrompt } from "../src/lib/analysisPrompt.ts";
import type { BlsObservation } from "../src/lib/analysisPrompt.ts";
import { MAX_CONTINUATIONS, buildAnthropicRequest, fetchAnthropicAnalysis } from "../src/lib/analysisClient.ts";
import { analyzePrices } from "../src/lib/analysisService.ts";
import { analysisCostUsd } from "../src/lib/analysisPricing.ts";
import { cacheAnalysis, getCachedAnalysis } from "../src/lib/llmcache.js";
import { analysisModelName } from "../src/lib/analysisModel.ts";
import type { Good, PriceAnalysis } from "../src/lib/types.ts";

const item: Good = {
  name: "Eggs", dataKey: "eggs", unit: "dozen", icon: "", bgColor: "", lineColor: "",
  seriesId: { national: "APU0000708111" },
};
const rows: BlsObservation[] = [
  { year: "2026", period: "M09", value: "2.272", footnotes: [{}, { code: "P", text: "Preliminary" }] },
  { year: "2025", period: "M09", value: "3.488" },
  { year: "2026", period: "M08", value: "2.272" },
  { year: "2026", period: "M06", value: "2.141" },
];
const date = "2026-11-08";

test("ISC-1: full valid monthly history and meaningful footnotes survive compaction", () => {
  const invalid: BlsObservation[] = [
    { year: "2026", period: "M13", value: "3" },
    { year: "2026", period: "M00", value: "3" },
    { year: "2026", period: "M12", value: "-" },
    { year: "2026", period: "M10", value: "" },
    { year: "2026", period: "M11", value: null },
    { year: "2026", period: "M11", value: "Infinity" },
    { year: "2026", period: "M11", value: -1 },
    { year: "oops", period: "M01", value: "3" },
  ];
  const prompt = buildAnalysisPrompt(item, [...rows, ...invalid], date);
  assert.deepEqual(prompt.input.monthlyPrices, [
    ["2025-09", 3.488], ["2026-06", 2.141], ["2026-08", 2.272], ["2026-09", 2.272],
  ]);
  assert.deepEqual(prompt.input.footnotes, [{ period: "2026-09", notes: [{ code: "P", text: "Preliminary" }] }]);
  assert.equal(prompt.user.includes("calculations"), false);
  assert.equal(prompt.user.includes("periodName"), false);
  assert.deepEqual(rows[0].footnotes, [{}, { code: "P", text: "Preliminary" }]);
});

test("ISC-1: ten years of monthly observations are not truncated", () => {
  const history = Array.from({ length: 120 }, (_, index) => ({
    year: String(2016 + Math.floor(index / 12)),
    period: `M${String(index % 12 + 1).padStart(2, "0")}`,
    value: "2.000",
    periodName: "Repeated month metadata",
    latest: "false",
    footnotes: [{}],
    calculations: { net_changes: { "1": "0", "3": "0", "6": "0", "12": "0" }, pct_changes: { "1": "0", "3": "0", "6": "0", "12": "0" } },
  }));
  const prompt = buildAnalysisPrompt(item, history, date);
  assert.equal(prompt.input.monthlyPrices.length, 120);
  assert.deepEqual(prompt.input.monthlyPrices[0], ["2016-01", 2]);
  assert.deepEqual(prompt.input.monthlyPrices.at(-1), ["2025-12", 2]);
  assert.ok(prompt.user.length < JSON.stringify(history).length / 4);
});

test("ISC-2: requests identify the unit, source, geography, reporting period, and research date", () => {
  const { input, user } = buildAnalysisPrompt(item, rows, date);
  assert.equal(input.name, "Eggs");
  assert.equal(input.unit, "dozen");
  assert.equal(input.currency, "USD");
  assert.equal(input.geography, "United States, national average");
  assert.equal(input.source, "BLS");
  assert.equal(input.seriesId, item.seriesId.national);
  assert.equal(input.dataThrough, "2026-09");
  assert.equal(input.researchDate, date);
  assert.equal(input.title, "Eggs Price Analysis - September 2026");
  assert.deepEqual(JSON.parse(user), input);
});

test("ISC-3: comparisons use calendar months, not array offsets", () => {
  const { comparisons } = buildAnalysisPrompt(item, rows, date).input;
  assert.deepEqual(comparisons["1m"], { period: "2026-08", price: 2.272, change: 0, percentChange: 0 });
  assert.deepEqual(comparisons["3m"], { period: "2026-06", price: 2.141, change: 0.131, percentChange: 6.1186 });
  assert.equal(comparisons["6m"], null);
  assert.deepEqual(comparisons["12m"], { period: "2025-09", price: 3.488, change: -1.216, percentChange: -34.8624 });
});

test("ISC-3: missing months, year boundaries, and zero baselines are explicit", () => {
  const prompt = buildAnalysisPrompt(item, [
    { year: "2026", period: "M01", value: "1" },
    { year: "2025", period: "M12", value: "0" },
    { year: "2025", period: "M10", value: "0.5" },
  ], date);
  assert.deepEqual(prompt.input.comparisons["1m"], { period: "2025-12", price: 0, change: 1, percentChange: null });
  assert.deepEqual(prompt.input.comparisons["3m"], { period: "2025-10", price: 0.5, change: 0.5, percentChange: 100 });
  assert.equal(prompt.input.comparisons["12m"], null);
  assert.deepEqual(prompt.input.unavailableMonths, ["2025-11"]);
  assert.throws(() => buildAnalysisPrompt(item, [], date), /No valid monthly prices/);
});

test("ISC-1: unavailable monthly prices retain explanatory footnotes", () => {
  const prompt = buildAnalysisPrompt(item, [
    ...rows,
    { year: "2025", period: "M10", value: "-", footnotes: [{ code: "X", text: "Data unavailable due to the 2025 lapse in appropriations" }] },
  ], date);
  assert.ok(prompt.input.unavailableMonths.includes("2025-10"));
  assert.ok(prompt.input.footnotes.some((note) => note.period === "2025-10" && note.notes[0].code === "X"));
});

test("ISC-4: the shared policy specifies evidence, time alignment, and the concise output contract", () => {
  for (const instruction of [
    "300–450 words", "Summary, Price Trends, Possible Drivers, Limitations",
    "nominal USD", "not inflation-adjusted", "not proof of causation",
    "statistically significant", "subsequent context", "must not explain earlier",
    "Cite each externally sourced factual claim", "external evidence is insufficient",
    "not acknowledgments", "Do not forecast prices", "Do not output raw HTML",
  ]) assert.ok(ANALYSIS_POLICY.includes(instruction), instruction);
});

test("ISC-3: long-term summaries are computed rather than inferred by the model", () => {
  const { historySummary } = buildAnalysisPrompt(item, rows, date).input;
  assert.deepEqual(historySummary.first, { period: "2025-09", price: 3.488 });
  assert.deepEqual(historySummary.maximum, { period: "2025-09", price: 3.488 });
  assert.deepEqual(historySummary.minimum, { period: "2026-06", price: 2.141 });
  assert.deepEqual(historySummary.changeSinceFirst, { change: -1.216, percentChange: -34.8624 });
});

test("ISC-8, ISC-9: cost accounting includes search, cache writes, and cache reads without double-counting", () => {
  const usage = { input_tokens: 1653, output_tokens: 1839, cache_creation_input_tokens: 15257, cache_read_input_tokens: 3971, web_search_requests: 1 };
  assert.equal(analysisCostUsd("claude-opus-5", usage), 0.16158175);
  assert.ok(analysisCostUsd("claude-sonnet-5-5", usage) < analysisCostUsd("claude-opus-5", usage));
  assert.throws(() => analysisCostUsd("unknown-model", usage), /No reviewed pricing/);
});

function messageFixture() {
  return {
    id: "msg_fixture", type: "message", role: "assistant", model: "claude-opus-5",
    content: [
      { type: "text", text: "# Eggs Price Analysis - September 2026", citations: null },
      { type: "text", text: "\n\n## Summary\n\nThe supplied price is $2.272 per dozen.", citations: [{
        type: "web_search_result_location", url: "https://www.bls.gov/example", title: "BLS source",
        cited_text: "Supporting source passage", encrypted_index: "fixture-index",
      }] },
    ],
    stop_reason: "end_turn", stop_sequence: null,
    usage: {
      input_tokens: 1300, output_tokens: 500, cache_creation_input_tokens: 1000, cache_read_input_tokens: 250,
      server_tool_use: { web_search_requests: 1 },
    },
  };
}

test("ISC-5, ISC-8: the real SDK request path retains cited_text and logs API usage", async () => {
  const logs: unknown[] = [];
  const prompt = buildAnalysisPrompt(item, rows, date);
  const result = await fetchAnthropicAnalysis(prompt, {
    apiKey: "fake-test-key", maxRetries: 0, logger: { info: (...args) => logs.push(args) },
    fetch: async (input, init) => {
      assert.equal(new URL(String(input)).pathname, "/v1/messages");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "claude-sonnet-5-5");
      assert.deepEqual(body, buildAnthropicRequest(prompt));
      assert.deepEqual(body.tools, [{
        type: "web_search_20250305", name: "web_search",
        blocked_domains: ["apple.com", "appleinsider.com"], max_uses: 2,
      }]);
      assert.equal("temperature" in body, false);
      return Response.json(messageFixture());
    },
  });
  assert.deepEqual(result.citations, [{ url: "https://www.bls.gov/example", title: "BLS source", text: "Supporting source passage" }]);
  assert.ok(result.markdown.includes("2026\n\n## Summary"));
  assert.deepEqual(result.usage, {
    model: "claude-opus-5", input_tokens: 1300, output_tokens: 500,
    cache_creation_input_tokens: 1000, cache_read_input_tokens: 250, web_search_requests: 1,
  });
  assert.deepEqual(logs, [["Price analysis API usage", { ...result.usage, requests: 1 }]]);
  assert.equal(JSON.stringify(logs).includes("fake-test-key"), false);
});

test("ISC-5: citation-split text blocks preserve paragraph and punctuation boundaries", async () => {
  const fixture = messageFixture();
  fixture.content = [
    { type: "text", text: "A supported ", citations: null },
    { ...fixture.content[1], text: "claim" },
    { type: "text", text: ".\n\nThe next paragraph.", citations: null },
  ];
  const result = await fetchAnthropicAnalysis(buildAnalysisPrompt(item, rows, date), {
    apiKey: "test", maxRetries: 0, logger: { info: () => {} },
    fetch: async () => Response.json(fixture),
  });
  assert.equal(result.markdown, "A supported claim.\n\nThe next paragraph.");
});

test("ISC-6: only identical shared instructions are cacheable across goods and research dates", () => {
  const eggs = buildAnthropicRequest(buildAnalysisPrompt(item, rows, date));
  const apples = buildAnthropicRequest(buildAnalysisPrompt({ ...item, name: "Apples", dataKey: "apples", unit: "pound" }, rows, "2026-11-09"));
  assert.deepEqual(eggs.system, apples.system);
  assert.deepEqual(eggs.tools, apples.tools);
  assert.notDeepEqual(eggs.messages, apples.messages);
  assert.equal("cache_control" in eggs, false);
  assert.ok(Array.isArray(eggs.system));
  assert.deepEqual(eggs.system[0].cache_control, { type: "ephemeral", ttl: "5m" });
  assert.equal(JSON.stringify(eggs.messages).includes("cache_control"), false);
  assert.equal(JSON.stringify(eggs.system).includes(date), false);
  assert.equal(buildAnthropicRequest(buildAnalysisPrompt(item, rows, date), "claude-sonnet-5-5").model, "claude-sonnet-5-5");
});

function harness() {
  const calls = { read: 0, write: 0, fetch: 0, generate: 0 };
  const cached: PriceAnalysis = { data: "cached layout", citations: [], timestamp: 1, provider: "Claude" };
  const dependencies = {
    loadHistory: async () => { calls.fetch++; return rows; },
    generate: async () => { calls.generate++; return { markdown: "fresh report", citations: [] }; },
    cache: {
      get: async (_key: string, _model?: string): Promise<PriceAnalysis | null> => { calls.read++; return cached; },
      set: async () => { calls.write++; },
    },
    logger: { error: () => {}, warn: () => {} },
  };
  return { calls, cached, dependencies };
}

test("ISC-7: production always generates fresh reports and never reads or writes local response caches", async () => {
  for (const flag of [true, false, "true", "false", "1", undefined]) {
    const { calls, dependencies } = harness();
    const options = { development: false, cacheResponse: flag, provider: "Claude" };
    const first = await analyzePrices(item, options, dependencies);
    const second = await analyzePrices(item, options, dependencies);
    assert.equal(first.data, "fresh report");
    assert.equal(second.data, "fresh report");
    assert.deepEqual(calls, { read: 0, write: 0, fetch: 2, generate: 2 });
  }
});

test("ISC-7: development can reuse a local report with provider metadata", async () => {
  for (const flag of [true, "true", "TRUE", " true "]) {
    const { calls, cached, dependencies } = harness();
    const result = await analyzePrices(item, { development: true, cacheResponse: flag, provider: "Claude" }, dependencies);
    assert.deepEqual(result, cached);
    assert.deepEqual(calls, { read: 1, write: 0, fetch: 0, generate: 0 });
  }
});

test("analysis attribution uses the provider-reported model and passes it to the local cache", async () => {
  const { dependencies } = harness();
  const usage = {
    model: "claude-sonnet-5-5", input_tokens: 10, output_tokens: 20,
    cache_creation_input_tokens: 0, cache_read_input_tokens: 0, web_search_requests: 1,
  };
  let saved: PriceAnalysis | undefined;
  const result = await analyzePrices(item, { development: true, provider: "Claude" }, {
    ...dependencies,
    generate: async () => ({ markdown: "report", citations: [], usage }),
    cache: { ...dependencies.cache, set: async (_key, report) => { saved = report; } },
  });
  assert.equal(result.model, "claude-sonnet-5-5");
  assert.equal(saved?.model, "claude-sonnet-5-5");
});

test("analysis model labels show the model version without guessing unknown models", () => {
  assert.equal(analysisModelName("claude-opus-5"), "Opus 5");
  assert.equal(analysisModelName("claude-sonnet-5-5"), "Sonnet 5.5");
  assert.equal(analysisModelName("claude-opus-5-5"), "Opus 5.5");
  assert.equal(analysisModelName("claude-haiku-4-5-20251001"), "Haiku 4.5 (2025-10-01)");
  assert.equal(analysisModelName("claude-opus-5-20260707"), "Opus 5 (2026-07-07)");
  assert.equal(analysisModelName("some-new-model"), "some-new-model");
  assert.equal(analysisModelName(), "Model unavailable");
  assert.equal(analysisModelName(" "), "Model unavailable");
});

test("ISC-7: false-like local flags generate and save a fresh report for layout testing", async () => {
  for (const flag of [false, "false", "0", "", undefined]) {
    const { calls, dependencies } = harness();
    await analyzePrices(item, { development: true, cacheResponse: flag, provider: "Claude" }, dependencies);
    assert.deepEqual(calls, { read: 0, write: 1, fetch: 1, generate: 1 });
  }
});

test("ISC-7: generation failures are not cached, and cache-write failures do not discard valid reports", async () => {
  const { calls, dependencies } = harness();
  dependencies.generate = async () => { throw new Error("mock service failure"); };
  const result = await analyzePrices(item, { development: true, provider: "Claude" }, dependencies);
  assert.equal(result.provider, "None");
  assert.equal(calls.write, 0);
  dependencies.generate = async () => ({ markdown: "valid report", citations: [] });
  dependencies.cache.set = async () => { throw new Error("read-only cache"); };
  assert.equal((await analyzePrices(item, { development: true, provider: "Claude" }, dependencies)).data, "valid report");
});

test("ISC-7: the filesystem cache retains provider metadata and expires old prompt versions", async () => {
  const previous = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), "price-analysis-cache-test-"));
  try {
    process.chdir(directory);
    await cacheAnalysis("eggs", "local layout report", [], "test prompt", "anthropic", "claude-opus-5");
    assert.equal((await getCachedAnalysis("eggs"))?.provider, "Claude");
    assert.equal((await getCachedAnalysis("eggs"))?.model, "claude-opus-5");
    const file = path.join(directory, ".cache/llm/eggs.json");
    const cached = JSON.parse(await readFile(file, "utf8"));
    const { model: _model, ...legacy } = cached;
    await writeFile(file, JSON.stringify(legacy));
    assert.equal((await getCachedAnalysis("eggs"))?.model, undefined);
    await writeFile(file, JSON.stringify({ ...cached, version: 2 }));
    assert.equal(await getCachedAnalysis("eggs"), null);
    await writeFile(file, JSON.stringify({ ...cached, timestamp: Date.now() - 25 * 3600 * 1000 }));
    assert.equal(await getCachedAnalysis("eggs"), null);
  } finally {
    process.chdir(previous);
    await rm(directory, { recursive: true, force: true });
  }
});

test("ISC-4: incomplete or empty provider responses are rejected instead of cached", async () => {
  await assert.rejects(fetchAnthropicAnalysis(buildAnalysisPrompt(item, rows, date), {
    apiKey: "test", maxRetries: 0,
    fetch: async () => Response.json({ ...messageFixture(), stop_reason: "max_tokens" }),
    logger: { info: () => {} },
  }), /Incomplete analysis/);
  let requests = 0;
  await assert.rejects(fetchAnthropicAnalysis(buildAnalysisPrompt(item, rows, date), {
    apiKey: "test", maxRetries: 0,
    fetch: async () => { requests++; return Response.json({ ...messageFixture(), stop_reason: "pause_turn" }); },
    logger: { info: () => {} },
  }), /Incomplete analysis: pause_turn/);
  assert.equal(requests, MAX_CONTINUATIONS + 1);
  await assert.rejects(fetchAnthropicAnalysis(buildAnalysisPrompt(item, rows, date), {
    apiKey: "test", maxRetries: 0, fetch: async () => Response.json({ ...messageFixture(), content: [] }),
    logger: { info: () => {} },
  }), /Empty analysis/);
});

test("ISC-8: billed usage remains visible when the model reaches its output limit", async () => {
  const logs: unknown[] = [];
  await assert.rejects(fetchAnthropicAnalysis(buildAnalysisPrompt(item, rows, date), {
    apiKey: "test", maxRetries: 0,
    fetch: async () => Response.json({ ...messageFixture(), stop_reason: "max_tokens" }),
    logger: { info: (...args) => logs.push(args) },
  }), /Incomplete analysis/);
  assert.equal(logs.length, 1);
  assert.ok(JSON.stringify(logs).includes('"output_tokens":500'));
});

const searchBlocks = [
  { type: "server_tool_use", id: "srvtoolu_fixture", name: "web_search", input: { query: "egg prices" } },
  { type: "web_search_tool_result", tool_use_id: "srvtoolu_fixture", content: [] },
];

test("ISC-4: search narration before the final tool result is excluded from the report", async () => {
  const fixture = messageFixture();
  fixture.content = [
    { type: "text", text: "I'll search for recent egg price evidence.", citations: null },
    ...searchBlocks,
    { type: "text", text: "Let me check one more source.", citations: null },
    ...searchBlocks,
    ...messageFixture().content,
  ] as typeof fixture.content;
  const result = await fetchAnthropicAnalysis(buildAnalysisPrompt(item, rows, date), {
    apiKey: "test", maxRetries: 0, logger: { info: () => {} },
    fetch: async () => Response.json(fixture),
  });
  assert.ok(result.markdown.startsWith("# Eggs Price Analysis - September 2026"));
  assert.equal(result.markdown.includes("I'll search"), false);
  assert.equal(result.citations.length, 1);
});

test("ISC-8: paused search turns continue with the paused content and sum billed usage", async () => {
  const bodies: { messages: { role: string; content: unknown }[] }[] = [];
  const paused = { ...messageFixture(), stop_reason: "pause_turn", content: [
    { type: "text", text: "Searching.", citations: null }, ...searchBlocks,
  ] };
  const logs: unknown[] = [];
  const result = await fetchAnthropicAnalysis(buildAnalysisPrompt(item, rows, date), {
    apiKey: "test", maxRetries: 0, logger: { info: (...args) => logs.push(args) },
    fetch: async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json(bodies.length === 1 ? paused : messageFixture());
    },
  });
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[1].messages.at(-1), { role: "assistant", content: paused.content });
  assert.deepEqual(bodies[1].messages.slice(0, -1), bodies[0].messages);
  assert.ok(result.markdown.startsWith("# Eggs Price Analysis"));
  assert.equal(result.usage?.input_tokens, 2600);
  assert.equal(result.usage?.web_search_requests, 2);
  assert.ok(JSON.stringify(logs).includes('"requests":2'));
});

test("ISC-7: local reports from a different model are not reused", async () => {
  const previous = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), "price-analysis-model-cache-"));
  try {
    process.chdir(directory);
    await cacheAnalysis("eggs", "opus report", [], "prompt", "anthropic", "claude-opus-5");
    assert.equal(await getCachedAnalysis("eggs", "claude-sonnet-5-5"), null);
    assert.equal((await getCachedAnalysis("eggs", "claude-opus-5"))?.data, "opus report");
  } finally {
    process.chdir(previous);
    await rm(directory, { recursive: true, force: true });
  }
  const { calls, dependencies } = harness();
  let requestedModel: string | undefined;
  dependencies.cache.get = async (_key: string, model?: string) => { calls.read++; requestedModel = model; return null; };
  await analyzePrices(item, { development: true, cacheResponse: "true", provider: "Claude", model: "claude-sonnet-5-5" }, dependencies);
  assert.equal(requestedModel, "claude-sonnet-5-5");
  assert.deepEqual(calls, { read: 1, write: 1, fetch: 1, generate: 1 });
});
