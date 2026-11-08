# Price Of Goods

![Repobeats analytics](https://repobeats.axiom.co/api/embed/df56ca63d6008b0548dd0962d333b25994d73746.svg "Repobeats analytics image")

A data-driven website that tracks the historical prices of everyday goods. Compare current prices to historical data using official statistics rather than anecdotal evidence.

## Overview

This website allows you to easily track and visualize the price trends of common goods over time. It addresses the common debate about inflation and rising costs with factual data.

Data is sourced from the [Bureau of Labor Statistics](https://www.bls.gov/) (BLS), providing reliable and official price information. If you want to explore the data yourself, visit the [BLS Data Query Tool](https://data.bls.gov/PDQWeb/ap).

## Features

- Historical price charts for common goods
- Categorized items (groceries, meats, produce, etc.)
- Interactive visualizations with Recharts
- Data-backed inflation tracking
- Mobile-friendly design with Tailwind CSS
- LLM-powered price analysis using Anthropic Claude

## Roadmap

- [x] Track everyday essentials (eggs, milk, bread, gas)
- [x] Track meat products (beef, chicken, bacon, etc.)
- [x] Track produce (apples, oranges, bananas, etc.)
- [x] Organize items into categories with dedicated pages
- [x] Add LLM cache versioning system
- [ ] Improve mobile UI/UX
- [ ] Create a Github issue or PR to contribute!

## Technology Stack

1. [Astro](https://astro.build) v7.4+ - Web framework
2. React 19 - UI components
3. TailwindCSS v4 - Styling
4. Recharts - Data visualization
5. Cloudflare Pages - Web hosting
6. Cloudflare Workers - Data fetching
7. Cloudflare R2 - Data storage/caching
8. Github - Source control
9. Anthropic Claude - Price analysis via the Anthropic SDK

## Development

### Prerequisites

- Node.js 24 (see `.nvmrc`); use the same version for Cloudflare Pages builds
- pnpm (v10+) - This project uses pnpm as its package manager

### Getting Started

1. Clone the repository
2. Install dependencies:
   ```
   pnpm install
   ```
3. Be sure to set up your environment variables in `.env.local`
4. Start the development server:
   ```
   pnpm run dev
   ```
5. Visit `http://localhost:4321` in your browser

### Build for Production

```
pnpm run check
pnpm test
pnpm run build
pnpm run test:build
```

The site is statically generated into `dist/`; no server adapter is required for Cloudflare Pages.

### Price Analysis

- Production generates fresh analysis for every build and never reads or writes local response caches, regardless of `PUBLIC_CACHE_AI_RESPONSE`.
- In development, `PUBLIC_CACHE_AI_RESPONSE=true` reuses reports from `.cache/llm` for formatting tests. Successful fresh local reports are saved even when cache reads are disabled. The cache expires after 24 hours; the prompt change invalidates older entries.
- Requests retain full monthly date/price history and meaningful footnotes, with calendar-aligned comparisons, units, and separate reporting/research dates. Missing observations remain unavailable rather than being interpolated.
- Claude receives a shared evidence/output policy cached for five minutes. Item data and research dates remain outside that prefix. Usage logs report input/output tokens, cache writes/reads, and web searches; fresh searches and generated output are still billed.
- The production default is `claude-sonnet-5-5`, using basic web search (`web_search_20250305`, up to two searches; filtered search needs code execution, which this HIPAA-configured organization rejects). Paused search turns are continued, and only the text after the last search is kept as the report. Local cached reports from a different model are ignored. The existing Perplexity alternate is retained, but is not included in this initiative's testing.
- Analysis footers show the provider-reported model, for example **Claude · Opus 5**. The model is retained in local cached reports; older reports without model metadata show **Model unavailable**.
- `pnpm test` exercises the prompt, citation processing, usage logging, and cache boundary with mocked requests and no paid calls.

`pnpm run review:analysis` performs a cost preflight without model calls. `pnpm run review:analysis --run --budget 5` makes **nine paid requests**: Opus 5, Sonnet 5.5, and Opus 5.5 on eggs, apples, and electricity. It reads `PUBLIC_ANTHROPIC_API_KEY` from the shell or `.env`, disables automatic retries, and saves timestamped evidence under `.cache/analysis-review/`; results are never reused by builds. The budget uses an allowance for search-result tokens, not a provider-enforced spending cap. Review pricing in the script before future runs.

Use `--models claude-sonnet-5-5` for a three-report baseline run. For an approved follow-up in the same budget, pass `--spent <previous-total-usd>` so its preflight and cost journal include prior spending. Prices are defined in `src/lib/analysisPricing.ts`.

The acceptance criteria are in `docs/isa/price-analysis-prompts.md`.

### Dependency Security

- `pnpm test` checks dependency compatibility, SDK responses without paid API calls, and SVG rasterization.
- Renovate inherits dependency-update and vulnerability-alert policy from the shared organization preset.
- Use `pnpm-lock.yaml` as the only JavaScript lockfile. The typography parser override in `pnpm-workspace.yaml` can be removed once upstream no longer pins its vulnerable parser.

## Architecture

The application uses a JAMstack approach with pre-fetched data to minimize API calls:

1. A Cloudflare Worker ([pog-cache repository](https://github.com/vidluther/pog-cache)) fetches data from the BLS API
2. The data is processed and stored in Cloudflare R2 storage
3. The website retrieves this cached data rather than calling the BLS API directly
4. The worker runs on a scheduled basis to keep data current
5. LLM analysis is fresh on production builds; local report caching and shared prompt-prefix caching serve different purposes

### Project Structure

- `src/pages/` - Astro page components and routing
- `src/components/` - Reusable UI components (Astro and React)
- `src/lib/` - Utility functions for data processing and analysis
- `src/layouts/` - Layout components for consistent page structure
- `src/styles/` - Global CSS and Tailwind configurations

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.
