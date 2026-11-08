# CLAUDE.md - Development Guide

## Build & Development Commands
```bash
pnpm run dev      # Start local development server
pnpm run check    # Check Astro and TypeScript diagnostics
pnpm test         # Test dependencies and price analysis without live AI calls
pnpm run review:analysis # Preflight only; --run makes paid Claude calls
pnpm run build    # Build for production
pnpm run test:build # Verify generated social previews after building
pnpm run preview  # Preview production build
pnpm run astro    # Run Astro CLI commands
```

## Code Style & Conventions

### Project Structure
- Astro pages in `src/pages/`
- React components in `src/components/react/`
- Utility functions in `src/lib/`
- Layouts in `src/layouts/`

### TypeScript
- Strict mode enabled
- Use type annotations for function parameters and returns
- Use JSDoc for JavaScript files with `@ts-check` where needed

### Naming Conventions
- PascalCase for React components
- camelCase for functions, variables, and exports
- UPPERCASE for constants
- kebab-case for CSS classes and file names

### Formatting & Style
- 2-space indentation
- Trailing commas in multi-line objects and arrays
- Group related imports together
- Framework imports first, followed by project modules

### Error Handling
- Use try/catch for async operations
- Provide fallback values when operations fail
- Include context in error logging
