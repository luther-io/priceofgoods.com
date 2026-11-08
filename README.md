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
9. Anthropic Claude - Price analysis via LangChain

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
pnpm run build
pnpm run test:build
```

The site is statically generated into `dist/`; no server adapter is required for Cloudflare Pages.

## Architecture

The application uses a JAMstack approach with pre-fetched data to minimize API calls:

1. A Cloudflare Worker ([pog-cache repository](https://github.com/vidluther/pog-cache)) fetches data from the BLS API
2. The data is processed and stored in Cloudflare R2 storage
3. The website retrieves this cached data rather than calling the BLS API directly
4. The worker runs on a scheduled basis to keep data current
5. LLM analysis of price trends is cached with version control to optimize costs

### Project Structure

- `src/pages/` - Astro page components and routing
- `src/components/` - Reusable UI components (Astro and React)
- `src/lib/` - Utility functions for data processing and analysis
- `src/layouts/` - Layout components for consistent page structure
- `src/styles/` - Global CSS and Tailwind configurations

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.
