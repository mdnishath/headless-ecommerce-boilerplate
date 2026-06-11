# Headless E-commerce Boilerplate — Design Spec

**Date:** 2026-06-11
**Status:** Approved by user (brainstorming session)
**Scope:** Architecture + system design for a white-label, template-per-client headless e-commerce starter kit.

---

## 1. Purpose & Goals

A production-ready, reusable headless e-commerce boilerplate that can be white-labeled and deployed per client across Europe, America, and Asia. One core engine; each client deployment differs only by configuration, theme, and optional component/gateway overrides.

**Success criteria:**

- A new client storefront can be stood up by copying `clients/_default`, editing one config file and one theme file, and deploying — target "new client in 1 hour" (documented runbook).
- Core engine updates flow to client forks via upstream git pull without merge conflicts in client-owned files.
- Lighthouse / Core Web Vitals green out of the box on catalog pages.
- No secrets, tokens, or the WP GraphQL endpoint are ever exposed to the browser.

## 2. Locked Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Tenancy model | **Template-per-client** — each client = own fork/branch, own Vercel project, own WP instance | Full isolation, simplest ops, agency white-label standard |
| 2 | Dev backend | **Local WP via Docker** (reproducible recipe shipped in repo) | Same recipe reused per client backend |
| 3 | Multilingual content | **Custom companion WP plugin** ("headless-bridge") using translation-group linking | License-free, fully owned, per-language products enable regional divergence |
| 4 | Multi-currency | **Per-currency real pricing** via plugin fields; geo-based selection; charge in displayed currency | Trust + round pricing; Stripe supports multi-currency settlement |
| 5 | Checkout | **Fully headless** + pluggable payment gateway adapters; Stripe reference adapter in core | Localized checkout UX is the boilerplate's core value |
| 6 | Auth | **Guest checkout + full customer accounts** (JWT via HTTP-only cookie proxy) | Complete boilerplate; auth security built once, correctly |
| 7 | Repo layout | **Single Next.js app** with strict `@core/*` / `@client/*` import boundaries, `CLIENT` env var resolves active client | Simple, Vercel-friendly; clean boundaries keep monorepo/npm migration open |
| 8 | Rendering | **ISR + tag-based on-demand revalidation** default; PPR behind an experimental flag | PPR still experimental in Next 15; ISR is production-safe |

## 3. High-Level Data Flow

```
[ Browser ]
     │  (cookies: sealed cart session, refresh token, locale/currency prefs)
     ▼
[ Vercel Edge: middleware.ts ]  — locale/currency negotiation, rate limit, CSP
     │
     ▼
[ Next.js App (RSC + Server Actions + Route Handlers) ]
     │   fetch + cache tags (ISR)          ▲ revalidateTag
     ▼                                     │ (HMAC webhook)
[ WordPress + WooCommerce + headless-bridge plugin ]
     (GraphQL endpoint reachable ONLY from Next.js server, shared-secret header)

[ Payment gateways ] ⇄ adapter createIntent / PaymentUI / signed webhooks
```

## 4. Repository Structure

```
ecommerce-platform/
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── (shop)/                  # home, products/[slug], category/[slug], search, cart
│   │   │   ├── (checkout)/checkout/     # multi-step localized checkout
│   │   │   ├── (account)/account/       # login, register, orders, addresses
│   │   │   └── [...slug]/               # CMS pages from WP
│   │   ├── api/
│   │   │   ├── commerce/route.ts        # secure proxy: browser → Next → WP GraphQL
│   │   │   ├── revalidate/route.ts      # WP webhook → revalidateTag (HMAC verified)
│   │   │   └── webhooks/[gateway]/route.ts  # payment webhooks (signature verified)
│   │   ├── sitemap.ts
│   │   └── robots.ts
│   ├── core/                            # IMMUTABLE ENGINE — clients never edit
│   │   ├── commerce/                    # cart/checkout/pricing server actions + session logic
│   │   ├── graphql/                     # typed queries/fragments (codegen output)
│   │   ├── wordpress/                   # WP fetch client, cache-tag scheme, webhook verify
│   │   ├── i18n/                        # locale + currency resolution, routing helpers
│   │   ├── payments/                    # GatewayAdapter interface + registry + StripeAdapter
│   │   ├── security/                    # rate limiter, CSP builder, sealed-cookie helpers
│   │   ├── seo/                         # metadata factory, JSON-LD builders, sitemap utils
│   │   └── components/                  # CartProvider, Price, ProductImage, AddToCart, etc.
│   ├── components/ui/                   # shadcn/ui — consumes CSS variables only
│   ├── clients/
│   │   ├── _default/                    # reference client
│   │   │   ├── client.config.ts         # zod-validated typed config
│   │   │   ├── theme.css                # CSS variable tokens
│   │   │   ├── messages/{en,fr,...}.json# UI string overrides (merged over core base)
│   │   │   └── overrides/               # optional component replacements
│   │   └── <client-x>/                  # white-label = copy _default, edit
│   ├── client.ts                        # CLIENT env var → resolves active client module
│   └── middleware.ts
├── wp-plugin/headless-bridge/           # custom companion WP plugin (PHP)
├── wp-env/                              # docker-compose.yml, setup.sh (WP-CLI), seed script
├── docs/                                # runbooks + specs
├── codegen.ts                           # GraphQL codegen config
└── .env.example
```

**Boundary rules (ESLint-enforced):**

- `src/core/**` may not import from `src/clients/**`. Client resolution happens only through `src/client.ts`.
- `src/clients/**` may import from `@core/*` and `@ui/*`.
- `src/app/**` composes both via `src/client.ts`.

## 5. WordPress Backend

### 5.1 Environment (`wp-env/`)

> **Amended 2026-06-11:** Docker dropped per user decision — local backend runs on **LocalWP** (Local by Flywheel), which is already installed on the dev machine.

- One LocalWP site per project (e.g. `ecommerce-backend` → `http://ecommerce-backend.local`), created/started via the LocalWP GUI.
- `wp-env/setup-localwp.ps1`: idempotent provisioning script run after the site is created and running. It junctions `wp-plugin/headless-bridge` into the site's plugins folder (live plugin dev from the repo), uses LocalWP's bundled PHP + WP-CLI to install & activate WooCommerce, WPGraphQL, WPGraphQL-WooCommerce (WooGraphQL), and WPGraphQL-JWT-Authentication (soft-fail), sets pretty permalinks, and verifies the GraphQL endpoint.
- Seed script (Phase 1): creates sample catalog — products in 2 languages (linked translation groups) with prices in 2 currencies, categories, a CMS page, shipping zones.
- The same recipe is the documented procedure for provisioning any new client's local dev backend; production backends are ordinary WordPress hosting.

### 5.2 `headless-bridge` plugin (custom, part of this repo)

Single plugin, four modules:

1. **i18n module**
   - Registers a `language` taxonomy on posts, pages, products (variations inherit from their parent product), and product categories.
   - Translation linking via shared `_translation_group` meta (UUID). Admin metabox UI: assign language, link/unlink translations, "create translation" helper that clones a product into a new language draft.
   - WPGraphQL extensions: `language` field on nodes; `translations { language, slug, uri }` connection; `where: { language: $lang }` filter on relevant root queries; default language fallback behavior (configurable: fallback vs. exclude).
2. **Pricing module**
   - Per-currency price fields on products and variations: regular + sale per enabled currency (currency list is a plugin setting).
   - Admin UI: extra pricing fields in the product data panel.
   - WPGraphQL: `prices { currency, regular, sale }` field. Woo's native price remains the base-currency source of truth for orders' bookkeeping.
   - Missing currency on a product → flagged in GraphQL so the frontend applies exchange-rate fallback (rate source configurable; cached daily).
   - Order creation accepts a `currency` and per-currency totals (custom checkout mutation wrapper or order meta) so the order record reflects what the customer actually paid.
3. **Revalidation module**
   - Hooks: product save/delete, stock change, price change, post/page save, category change, menu/settings change.
   - Fires an HMAC-SHA256-signed POST to the configured Next.js `/api/revalidate` URL with the affected cache tags (e.g., `product:slug`, `category:slug`, `global`). Retries with backoff on failure; failures logged to a WP admin notice screen.
4. **Hardening module**
   - GraphQL introspection disabled for unauthenticated requests in production.
   - Optional shared-secret header (`X-Bridge-Secret`) required on the GraphQL endpoint — requests without it are rejected (the Next.js server is the only legitimate caller).
   - XML-RPC disabled; REST API user enumeration disabled; CORS locked to none (no browser ever calls WP).

## 6. Data Layer & State Architecture

- **Typing:** GraphQL Code Generator runs against the live local WP schema → fully typed operations in `src/core/graphql/`. Codegen check is a CI/build gate.
- **Reads (catalog/content):** Server Components only. `fetch` with `next: { tags: [...] }`. Tag scheme:
  - `product:<slug>`, `category:<slug>`, `page:<slug>`, `products` (lists), `global` (menus, settings).
  - Locale is part of the cache key naturally via the request URL/variables; tags stay locale-agnostic and revalidate all locales of an entity together (translation-group webhooks include all linked slugs).
- **Cart/session:** WooGraphQL session token lives ONLY in a sealed (encrypted, HTTP-only, Secure, SameSite=Lax) cookie. All cart mutations are Server Actions that unseal the cookie, attach the session header, call WP, and re-seal any rotated token. UI uses `useOptimistic` + a thin CartProvider context hydrated from the server. No client-side global state library.
- **Auth:** JWT login/register mutations (WPGraphQL-JWT). Refresh token sealed in an HTTP-only cookie; short-lived auth token is requested server-side per request and never sent to the browser. Logout = cookie destruction + token revocation mutation.
- **Writes flow:** Browser → Server Action / `api/commerce` proxy → WP GraphQL (with shared secret + session/JWT headers). The browser never holds a WP URL, token, or session string.

## 7. i18n & Multi-Currency

- **Routing:** `next-intl` with `[locale]` path segment. Supported locales, default locale, and currency map come from the active client config.
- **Middleware negotiation (in order):** explicit user cookie → `Accept-Language` + geo country header (Vercel `x-vercel-ip-country`) → client default. Sets `locale` + `currency` cookies; redirects `/` to `/<locale>`.
- **UI strings:** core ships base message catalogs; client `messages/*.json` deep-merge over them.
- **Content:** all content queries pass the language filter; `translations` connections power hreflang alternates and the language switcher (switching navigates to the linked translation's slug, not a 1:1 path swap).
- **Currency:** resolution context (cookie/geo) flows through a request-scoped helper; prices rendered server-side via `Intl.NumberFormat`. Checkout charges in the resolved currency. Currency switcher writes the cookie and refreshes.

## 8. Checkout & Payment Adapters

```ts
interface PaymentGatewayAdapter {
  id: string;                                                   // "stripe", "mollie", ...
  supports(ctx: { currency: string; country: string }): boolean;
  createIntent(order: OrderDraft): Promise<IntentResult>;       // server-side
  webhookHandler(req: Request): Promise<WebhookResult>;         // signature-verified
  PaymentUI: React.ComponentType<PaymentUIProps>;               // client component
}
```

- Core ships `StripeAdapter` (Payment Element, multi-currency charges).
- Client config lists enabled gateway ids + their env-var-referenced credentials; the registry filters by `supports()` for the active currency/country at checkout.
- **Order flow:** cart review → address + shipping rate selection (WooGraphQL) → create Woo order (`pending`) → `createIntent` → customer completes payment in `PaymentUI` → gateway webhook (`/api/webhooks/[gateway]`) verifies signature and marks the Woo order paid via an authenticated server-to-server GraphQL mutation (application credentials) → confirmation page (order status polled/refetched server-side).
- **Failure handling:** abandoned intents expire via gateway-side TTL; orders stuck `pending` past TTL are cancelled by a WP cron in the plugin. Webhook handlers are idempotent (event-id dedupe).

## 9. Security

| Layer | Mechanism |
|---|---|
| Edge middleware | Sliding-window rate limiting (Upstash Redis in prod, in-memory in dev) on auth + mutation routes; strict CSP with per-request nonces; HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy headers |
| Cookies | HTTP-only, Secure, SameSite=Lax, encrypted payload (iron-session-style sealing) for cart session + refresh token |
| CSRF | Server Actions rely on Next.js built-in Origin checking; custom route handlers verify Origin/Host match; webhook routes exempt but signature-verified |
| WP exposure | GraphQL endpoint never called from the browser; shared-secret header required; introspection off in prod |
| Webhooks | WP→Next: HMAC-SHA256 over body + timestamp (replay window). Gateway→Next: native signatures (e.g., `stripe-signature`) |
| Secrets | Env vars only; `.env.example` documents every variable; zod validation fails the build on missing/invalid env |

## 10. Performance & SEO

- **Rendering:** ISR for home/PLP/PDP/CMS pages with tag-based on-demand revalidation; cart/checkout/account dynamic. `generateStaticParams` pre-builds top-N products per locale (N configurable); long tail renders on demand and persists.
- **PPR:** available behind `experimental.ppr` flag in the boilerplate config but OFF by default.
- **Images:** `next/image` with WP media `remotePatterns`; enforced aspect ratios (zero CLS).
- **SEO automation:**
  - Metadata factory in core reads Yoast or RankMath fields via GraphQL (which plugin is a client-config setting; both mapped to one internal SEO shape) with sensible fallbacks from product data.
  - JSON-LD builders: `Product` (with offers in active currency), `BreadcrumbList`, `Organization`, `WebSite`.
  - `hreflang` alternates generated from translation groups.
  - Per-locale sitemaps via a sitemap index (`app/sitemap.ts`), paginated for large catalogs; `robots.ts` per environment (noindex on previews).

## 11. White-Label Theming & Client Config

- **Tokens:** every UI component consumes CSS variables (`--primary`, `--radius`, fonts, spacing). Reskin = edit `clients/<name>/theme.css`.
- **`client.config.ts`** (zod-validated at build):
  - identity (name, logo, social), WP endpoint + secrets refs, locales + default, currencies + country→currency map, enabled payment gateways, feature flags (reviews, wishlist, search), SEO defaults (titleTemplate, twitter/og), analytics ids.
- **Override registry:** typed map in client module, e.g. `overrides: { Header: CustomHeader }`; core renders `resolveComponent('Header')` which falls back to the core implementation. Only explicitly registered override points (Header, Footer, ProductCard, Hero, CheckoutSteps) — not arbitrary patching.
- **New-client runbook (docs/):** copy `_default` → set `CLIENT` env → fill config + theme → provision WP via `wp-env` recipe → deploy. Target: 1 hour.

## 12. Testing Strategy

- **Unit (Vitest):** pricing/currency resolution, locale negotiation, cache-tag derivation, adapter contract, config schema validation.
- **Integration:** Server Actions + route handlers against MSW-mocked GraphQL responses (recorded from real schema); optional CI job runs against the Dockerized WP with seed data.
- **E2E (Playwright):** browse → PDP → add to cart → checkout with Stripe test mode → order confirmation; run in 2 locales/currencies. Auth flow (register, login, order history).
- **Static gates:** TypeScript strict, ESLint boundary rules, codegen freshness check, zod env/config validation.

## 13. Error Handling Principles

- All WP fetches go through one core client with: timeout, typed error envelope, and stale-while-error behavior for reads (serve last ISR snapshot, log to observability hook).
- Mutations surface typed, localized user-facing errors (out-of-stock, payment declined, session expired → silent session re-creation for carts).
- Webhook endpoints always return 2xx after persisting/queueing to avoid storms; signature failures return 401 and are logged.
- Sentry-ready instrumentation hooks in core (DSN via client config; off by default).

## 14. Phased Roadmap

Each phase gets its own implementation plan (and spec addendum where needed) before coding.

| Phase | Deliverable | Depends on |
|---|---|---|
| 0 | Repo scaffold: Next.js 15 + TS strict + Tailwind + shadcn/ui, ESLint boundary rules, CI skeleton, Docker WP env up | — |
| 1 | `headless-bridge` plugin (i18n, pricing, revalidation, hardening) + seeded bilingual/bicurrency catalog | 0 |
| 2 | Data layer (codegen, WP client, cache tags, revalidate route) + catalog pages (home/PLP/PDP/search), single locale | 1 |
| 3 | i18n + multi-currency end-to-end (middleware, next-intl, hreflang, language/currency switchers) | 2 |
| 4 | Cart + sealed-cookie session + optimistic UI | 2 |
| 5 | Checkout + Stripe adapter + payment webhooks + order confirmation | 3, 4 |
| 6 | Customer accounts (JWT auth, order history, addresses) | 4 |
| 7 | Security audit pass (rate limiting, CSP, CSRF review) + SEO automation (metadata factory, JSON-LD, sitemaps) | 5 |
| 8 | White-label finalization: override registry, theming docs, second example client, "new client in 1 hour" runbook | 7 |

## 15. Out of Scope (v1)

- True multi-tenant single deployment (architecture keeps the door open; not built now).
- WPML/Polylang integrations (custom plugin replaces them; adapter layer can be added later if a client demands WPML).
- Product reviews, wishlist, loyalty (feature-flag stubs only).
- Search infrastructure beyond WP-native search (Algolia/Typesense adapter is a future extension point).
- Mobile apps, email templating beyond Woo defaults, ERP/PIM integrations.
