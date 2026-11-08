# Price-analysis prompt quality and efficiency — ISA

## Ideal State

Every production build generates a fresh, concise report from the latest available BLS data and current research. Reports distinguish measured trends from supported explanations. Inputs retain the full useful monthly history without repetitive API metadata. Shared instructions can be reused by the provider without reusing generated reports or research results.

## Constraints

- Production defaults are Claude Sonnet 5.5 (changed from Opus 5; see Decisions) and the existing Perplexity alternate. Do not introduce batching. Perplexity testing and Google integration are outside this initiative.
- Never read or write response caches in production. Keep local response caching for formatting tests.
- Publish observed trends with explicit limitations when external evidence cannot support an explanation; do not invent drivers or fail the build solely for missing evidence.
- Use the existing package manager and test tooling. Do not add dependencies.
- Live acceptance compares Claude Opus 5, Sonnet 5.5, and Opus 5.5 on eggs, apples, and electricity: nine fresh reports, with identical data and prompt policy. Three separately approved Opus 5 reports validate the final refinements. Project the cost before starting, record returned usage, and stop before additional calls would exceed the $5 application-side budget across both rounds. This is not a provider-enforced cap.
- Do not commit or push implementation changes without a separate request.

## Decisions

- 2026-11-08 — Improve and compact prompts before comparing models; separate common instructions from variable data to support prefix caching.
- 2026-11-08 — Retain full monthly date/price history and meaningful footnotes, rather than shortening the reporting window.
- 2026-11-08 — Keep data-backed reports available with explicit evidence limitations when research is insufficient.
- 2026-11-08 — Require mocked automated checks and a three-report live review, with a $5 budget, before calling this initiative complete.
- 2026-11-08 — Expand live acceptance to three Claude models across the same three goods (nine reports), retaining the $5 total budget. Do not test Perplexity or change the production model selection.
- 2026-11-08 — Initial live review found an inaccurate historical trend statement and reports over the word target. Supply computed long-term summaries, tighten section word budgets, and preserve unavailable-price footnotes. The user approved three additional Opus 5 reports to validate the final prompt within the same $5 total budget.
- 2026-11-08 — Switch the production default to Claude Sonnet 5.5; the user reviews its output manually. Adopt SDK 1.x (API version 2026-10-21) with web search `max_uses` 2 (filtered search was rejected: it needs code execution, unavailable to this HIPAA-configured organization, so the basic `web_search_20250305` tool remains), continue `pause_turn` responses, and drop search narration before the last tool result. Validate with three Sonnet 5.5 reports (eggs, apples, electricity) within the remaining $5 budget.
- 2026-11-08 — Show the provider-reported model alongside Claude in each analysis footer, preserving the model in local cached reports. Older reports without recorded model metadata must not be labeled with the currently configured model.

## Ideal State Criteria

- **ISC-1** — Compact inputs retain every valid monthly date/price observation and meaningful footnote without repeated API calculations — eval: test: history fixture tests, including invalid observations, annual summaries, and unsorted input.
- **ISC-2** — Each request identifies the good, unit, USD currency, US geography, BLS reporting period, and research date — eval: test: request metadata tests.
- **ISC-3** — Comparisons use matching calendar periods and explicitly mark missing or undefined comparisons unavailable — eval: test: missing-month, year-boundary, and zero-baseline tests.
- **ISC-4** — Reports use Summary, Price Trends, Possible Drivers, and Limitations sections, target 300–450 words, support external claims with evidence, and do not explain earlier price changes using later events — eval: question set: all three production-baseline live reports have the required sections and word range; numeric claims match supplied data; citations support driver claims; later events are labeled subsequent context; unsupported causes are not asserted. Apply the same checks to candidate models and record differences. Prompt contract tests check the instructions independently.
- **ISC-5** — Application citation records retain web-source URLs, titles, and cited text — eval: test: mocked web-search citation response.
- **ISC-6** — Anthropic receives an identical explicitly cacheable shared instruction prefix across goods, with item data and research dates outside it — eval: test: cross-item request comparison; assert: at least one later live report records nonzero cache-read tokens.
- **ISC-7** — Production always bypasses response-cache reads and writes, while development can reuse local reports for formatting — eval: test: production and development integration tests, including string boolean flags.
- **ISC-8** — Anthropic input, output, cache-creation, cache-read, and web-search usage is observable without logging credentials — eval: test: mocked usage logging; assert: live usage is recorded for each report.
- **ISC-9** — The three Claude models have comparable live evidence across the three goods within the approved budget — eval: question set: review all nine reports against ISC-4, recording accuracy, source relevance, formatting, latency, and cost; assert: recorded token/search costs total at most $5. Missing runs or failed checks remain explicit. Existing type checks, tests, build, and generated-page tests also pass with paid calls disabled.
- **ISC-10** — The analysis footer displays the generating model from response metadata, including cached reports, and identifies missing model metadata without guessing — eval: test: provider-reported model propagation, display-name, and filesystem-cache tests; assert: a production build against a local mock API displays its returned Sonnet 5.5 model even when Opus 5 was requested.

## Status

- ISC-1 — pass, 2026-11-08, uncommitted workspace: full-history, invalid-row, and unavailable-price footnote tests.
- ISC-2 — pass, 2026-11-08, uncommitted workspace: request metadata tests and both live rounds.
- ISC-3 — pass, 2026-11-08, uncommitted workspace: calendar-aligned, zero-baseline, missing-month, and computed history-summary tests.
- ISC-4 — fail, 2026-11-08: final reports meet the sections and length target, but the apple report calls a 1.4-cent increase a fraction of a cent; a cited apple source returns 404. Evidence remains insufficient to accept every narrative claim.
- ISC-5 — pass, 2026-11-08, uncommitted workspace: citation metadata and split-paragraph regression tests; saved live responses retain cited passages.
- ISC-6 — pass, 2026-11-08: identical-prefix request tests; later final-round requests report 8,456 cache-read tokens each.
- ISC-7 — pass, 2026-11-08, uncommitted workspace: production/development integration tests, filesystem cache tests, and keyless production build with the response-cache flag enabled.
- ISC-8 — pass, 2026-11-08: usage logging tests, including truncated responses, and complete usage journals for all 12 live requests.
- ISC-9 — pass, 2026-11-08: all nine comparison reports and three final baseline reports scored, with failures recorded below; combined usage-priced cost $1.69432275 of $5. All 25 automated tests, type checks, the 35-page build, and three generated-page tests pass without paid calls.
- ISC-10 — pass, 2026-11-08, uncommitted workspace: model metadata, display-name, and cache tests pass. A complete build with 27 local mock API requests verifies the returned model is rendered; no additional paid requests.

## Live Acceptance Evidence

Issues: [prompt quality](https://github.com/luther-io/priceofgoods.com/issues/112), [prefix caching](https://github.com/luther-io/priceofgoods.com/issues/113), [Claude comparison](https://github.com/luther-io/priceofgoods.com/issues/114).

### Initial comparison

All three models received identical item data and policy, with one permitted web search per request and automatic retries disabled. Prices were through September 2026; research date was November 8, 2026. Word counts below exclude the H1 and Markdown formatting. Live searches can return different evidence between models, so this is a small task-specific sample, not an isolated model benchmark.

| Model | Cost, three reports | Mean latency | Words: eggs / apples / electricity | Reports within 300–450 words |
| --- | --- | --- | --- | --- |
| Claude Opus 5 | $0.4852400 | 24.0 s | 438 / 421 / 429 | 3/3 |
| Claude Sonnet 5.5 | $0.2505015 | 17.9 s | 437 / 493 / 473 | 1/3 |
| Claude Opus 5.5 | $0.4326250 | 18.8 s | 460 / 495 / 514 | 0/3 |

- All nine reports used the requested title and four sections and retained the supplied monthly/yearly price comparisons. All recorded cache reads and one billed search.
- Opus 5's electricity report said the price declined in every month after June even though August and September were equal. Its apple report relied on an AgriLinkage URL that returned 404 during verification.
- Sonnet 5.5 was about 48% cheaper and 25% faster than Opus 5 in this sample, but exceeded the length target on two goods. It explicitly separated conflicting external egg prices from the authoritative supplied series.
- Opus 5.5 exceeded the length target on all three goods. Some secondary source pages returned 403 or timed out during direct verification; those claims are not considered independently verified merely because a search citation exists.
- [EIA's October outlook](https://www.eia.gov/outlooks/steo/report/elec_coal_renew.php), [EIA's August revenue data](https://www.eia.gov/electricity/monthly/update/end-use.php), [USApple's August outlook](https://usapple.org/news-resources/usapple-releases-2026-industry-outlook-report), and [USDA's October food-price findings](https://www.ers.usda.gov/data-products/food-price-outlook/summary-findings) supported the corresponding retrieved passages. These measures are not interchangeable with the supplied BLS average prices.

Initial raw evidence: `.cache/analysis-review/2026-11-08T06-16-39-534Z/`. This run preceded the unavailable-price footnote fix. Saved Markdown was reprocessed from the original response blocks after fixing citation-induced paragraph breaks; no model calls were repeated for that parsing fix.

### Final production-baseline check

The final prompt supplies calculated first/minimum/maximum observations and long-term changes, explicitly preserves missing-price footnotes and coverage gaps, discourages inferred continuous trends, and gives tighter section word budgets. Compact item inputs are 3,179–3,291 characters versus 25,814–29,730 for the original historical API records (about 88–89% smaller). This is a character comparison, not a measurement of total API token or bill savings.

| Good | Words | Latency | Cost | Result |
| --- | --- | --- | --- | --- |
| Eggs | 392 | 24.0 s | $0.19402275 | Numeric checks, required sections, supplied footnote, and cited supporting passages pass; source attribution still warrants review. |
| Apples | 433 | 18.2 s | $0.14344050 | Fails numeric wording: $0.014 is 1.4 cents, not a fraction of a cent. AgriLinkage source still returns 404; some other sources block direct access. |
| Electricity | 419 | 23.6 s | $0.18849300 | Supplied prices/comparisons and sections pass; an uncited statement about regulated/contracted-rate lags remains unsupported by the cited passages. |

Final raw evidence: `.cache/analysis-review/2026-11-08T06-43-00-390Z/`. Costs use returned input/output/cache/search usage and the published standard prices, not an invoice reconciliation. Search-result processing accounts for much of the input cost. Provider-internal search turns also contribute cache usage, so cache reads alone do not establish a precise cross-item cost reduction.

**Decision (Opus 5 round):** retain the production model default. The implementation and offline checks pass, but the initiative is not fully accepted while ISC-4 fails. No additional paid runs were made after the approved twelve reports.

### Sonnet 5.5 default

The production default later moved to Claude Sonnet 5.5 (see Decisions). Three fresh reports used SDK 1.6.0, basic web search with up to two searches, and the same data and policy. Prices were through September 2026; research date was November 8, 2026.

| Good | Words | Citations | Latency | Cost |
| --- | --- | --- | --- | --- |
| Eggs | 396 | 5 | 14.7 s | $0.1231261 |
| Apples | 444 | 7 | 24.8 s | $0.1414237 |
| Electricity | 446 | 7 | 15.1 s | $0.1088672 |

All three use the exact title and four sections within the word target, with no search narration. Combined usage-priced cost across all rounds is $2.06773975 of $5. ISC-4 narrative accuracy for these reports awaits manual review. Raw evidence: `.cache/analysis-review/2026-11-08T07-20-25-837Z/`.
