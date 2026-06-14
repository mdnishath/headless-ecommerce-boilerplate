# Headless E-commerce Boilerplate

A white-label, multi-client headless commerce starter: **Next.js 15** (App Router, React 19, TypeScript strict, Tailwind v4, shadcn/ui) on the frontend, **headless WordPress + WooCommerce** (WPGraphQL + WooGraphQL) on the backend. One core engine; each client deployment differs only by configuration, theme, and optional overrides.

> Design spec: [`docs/superpowers/specs/2026-06-11-headless-ecommerce-boilerplate-design.md`](docs/superpowers/specs/2026-06-11-headless-ecommerce-boilerplate-design.md)
> Phase 0 plan: [`docs/superpowers/plans/2026-06-11-phase-0-foundation.md`](docs/superpowers/plans/2026-06-11-phase-0-foundation.md)

## Architecture

- `src/core/**` — the immutable engine (config schema, commerce logic, GraphQL, SEO). Never imports client code.
- `src/clients/<name>/` — per-client config + theme + overrides. White-labeling = copy `_default`, edit `client.config.ts` and `theme.css`.
- `src/client.ts` — the single bridge: imports the active client's config and validates it with the zod schema. An invalid config fails the build.
- `@core/*`, `@ui/*`, `@client/*` — path aliases. `@client` resolves to `src/clients/<CLIENT>` at build time via the `CLIENT` env var (see `next.config.ts`); ESLint enforces the core/client/app import boundaries.

## Selecting the active client

Set `CLIENT` to a folder name under `src/clients/` (defaults to `_default`):

```powershell
$env:CLIENT = "_default"   # PowerShell
```

```bash
CLIENT=_default            # bash / CI
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (webpack — not Turbopack; the `@client` alias depends on it) |
| `npm run build` | Production build |
| `npm test` | Vitest unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (`--max-warnings 0`) incl. import-boundary rules |
| `npm run verify:client-alias` | Proves the `CLIENT`-selected `@client` alias resolves end-to-end (white-label canary) |

CI runs all of these on every push/PR (`.github/workflows/ci.yml`).

## WordPress backend (local dev)

The backend runs on [LocalWP](https://localwp.com/). Create a site named `ecommerce-backend` (running/green), then provision it:

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\setup-localwp.ps1
```

This installs WooCommerce + WPGraphQL + WooGraphQL + the custom `headless-bridge` plugin and exposes GraphQL at `http://ecommerce-backend.local/graphql`.

## Theming

Every UI component consumes CSS variables. Reskin a client by editing `src/clients/<name>/theme.css` (token overrides only — loaded after `globals.css`).
