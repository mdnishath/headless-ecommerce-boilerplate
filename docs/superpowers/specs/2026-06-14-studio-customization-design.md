# Studio — Store Customization System Design Spec

**Date:** 2026-06-14
**Status:** Approved by user (brainstorming session)
**Scope:** Architecture for "Studio" — an in-app, database-backed, live admin customizer plus a modular design-variant library that lets a non-technical store owner fully theme and lay out their storefront without leaving the app.

---

## 1. Purpose & Goals

The storefront is a reusable white-label product. **Studio** is the subsystem that makes each deployed store visually self-serve: the owner logs into `/admin`, picks from a large gallery of header/footer/hero/card/grid/slider/cart/checkout designs, tweaks per-design options, edits global colors/typography, previews live, and publishes — all in one place.

**Success criteria:**
- A store owner with no coding skills can change the header design, footer design, hero, colors, and fonts and publish — entirely from `/admin`, with a live preview.
- The design library is modular: adding a new variant is dropping one component + its options schema into a registry — no changes to the customizer, storefront, or schema.
- Customization is fully decoupled from product data: WordPress/WooCommerce remains the source of truth for **products only**; Studio owns **design/layout config only**.
- A client fork can register additional client-specific variants through the same registry interface (white-label extensibility).

**Non-goals (v1):** arbitrary free-form drag-drop page building (atomic block arrangement is deferred to Studio-7); A/B testing; multi-admin RBAC beyond a single role; visual CSS editing beyond the exposed tokens/options.

## 2. Locked Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | When customization applies | **Live admin customizer** — gallery + per-option editing + live preview, DB-backed, publish to go live |
| 2 | Where the custom backend lives | **In-app** — `/admin` routes + a database in the same Next.js app/deploy (separate from WordPress) |
| 3 | Design-library model | **Curated variants + per-variant options + global tokens** — N distinct hand-crafted components per slot, each tweakable, all theme-token-aware |
| 4 | Database | **Drizzle ORM** — SQLite (dev, file-based, no Docker) → Postgres (prod, serverless e.g. Neon/Supabase) |
| 5 | Admin auth | **Simple admin auth** — email+password (hashed), signed HTTP-only session cookie, seeded admin per client, separate from customer accounts |
| 6 | Storefront read strategy | **ISR + `revalidateTag('customization')` on publish** for live; **dynamic draft read** for preview mode |

## 3. Core Concepts

### 3.1 Slots
Named regions of the storefront that can be customized. v1 slot set:
`announcementBar`, `header`, `footer`, `hero`, `productCard`, `productGrid`, `productSlider`, `cartDrawer`, `checkoutLayout`.

### 3.2 Variants
Each slot has many registered variant components. A variant is a self-contained unit declaring:
- `id` — namespaced, e.g. `header.classic-centered`
- `name` — display label for the gallery
- `thumbnail` — preview image path (static asset)
- `optionsSchema` — a **zod** schema of the variant's own tweakable options, each with a default (e.g. `sticky: boolean = true`, `showSearch: boolean = true`, `ctaText: string = "Shop"`, `containerWidth: enum`)
- `Component` — the React (Server) component, props = `{ options, doc }` (its validated options + the full customization doc for cross-slot data like cart count)

A variant reads colors/typography/radius only from **global tokens** (CSS variables), never hardcoded — so the global theme editor restyles every variant uniformly.

### 3.3 Registry
`src/core/studio/registry/` exposes a typed registry: `Record<SlotName, Record<VariantId, VariantDef>>`. Each slot file (`header.ts`, `footer.ts`, …) registers its variants. A client fork can extend the registry with additional variants via `src/clients/<name>/studio/` merged at resolution time. The registry is the single source of truth for "what designs exist" — the customizer galleries and the storefront resolver both read it.

### 3.4 Global Design Tokens
A `theme` object in the customization document: `colorScheme` (named preset), `primary`/`secondary`/`accent`/`background`/`foreground` (overridable), `fontHeading`, `fontBody`, `radius`, `spacingScale`. Injected as inline CSS variables on `<html>` in the layout, overriding the static `theme.css` defaults. This is what "color choose" edits.

## 4. The Customization Document

One typed JSON document per store, validated by `customizationSchema` (zod) in `src/core/studio/schema.ts`:

```ts
type CustomizationDoc = {
  theme: {
    colorScheme: string;            // named preset id, or "custom"
    primary: string; secondary: string; accent: string;
    background: string; foreground: string;
    fontHeading: string; fontBody: string;
    radius: string; spacingScale: number;
  };
  slots: {
    // each slot: chosen variant id + that variant's options (validated against the variant's optionsSchema at parse time)
    announcementBar?: { variant: string; enabled: boolean; options: Record<string, unknown> };
    header:          { variant: string; options: Record<string, unknown> };
    footer:          { variant: string; options: Record<string, unknown> };
    hero?:           { variant: string; options: Record<string, unknown> };
    productCard:     { variant: string; options: Record<string, unknown> };
    productGrid:     { variant: string; options: Record<string, unknown> };
    productSlider?:  { variant: string; options: Record<string, unknown> };
    cartDrawer:      { variant: string; options: Record<string, unknown> };
    checkoutLayout?: { variant: string; options: Record<string, unknown> };
  };
  pages?: {
    home: Array<{ block: string; collection?: string; options?: Record<string, unknown> }>;
  };
};
```

Validation is two-stage: the doc shape is validated by `customizationSchema`; each slot's `options` is then validated against the **selected variant's** `optionsSchema` (looked up in the registry). A document with an unknown variant id or invalid options is rejected at save/publish and falls back to defaults at render. A `getDefaultDoc()` builds a valid document from registry defaults (first variant of each required slot + default tokens) — used to seed a new store.

## 5. Persistence (Drizzle)

`src/core/db/`:
- `schema.ts` — Drizzle tables:
  - `adminUsers` (id, email unique, passwordHash, role, createdAt)
  - `customization` (id, storeKey, status `'draft' | 'published'`, document JSON text, version int, updatedAt) — unique on (storeKey, status)
  - *(Studio-7)* `customizationHistory` (id, storeKey, version, document, publishedAt) for rollback
- `client.ts` — Drizzle client: SQLite (`better-sqlite3`/libSQL) when `DATABASE_URL` is a file/sqlite, Postgres when it's a `postgres://` URL. A single `db` export; dialect chosen by env.
- `migrations/` — Drizzle Kit migrations; `npm run db:migrate`, `npm run db:seed` (seeds the admin user + a default published doc from `getDefaultDoc()`).

**Draft vs published:** `customization` holds at most one `draft` and one `published` row per `storeKey`. Editing writes the `draft`. **Publish** copies `draft.document` → `published`, bumps `published.version`, and triggers `revalidateTag('customization')`.

`storeKey` defaults to the active `CLIENT` (single-store-per-deploy in the template model); the column keeps the door open for multi-store later.

## 6. Admin Customizer (`/admin`)

Auth-gated (Section 8). Route group `src/app/[locale]/(admin)/admin/` (or a top-level `/admin` outside locale — see Open Questions). Two-pane layout:

- **Left — controls:**
  - **Theme panel:** color-scheme presets + individual color pickers, font-pair selector, radius/spacing sliders.
  - **Slot panels** (Header, Footer, Announcement, Hero, Product Card, Grid, Slider, Cart, Checkout): a **variant gallery** (thumbnail cards from the registry; selecting sets `slots.<slot>.variant`) + an **options form auto-generated from the selected variant's `optionsSchema`** (zod → form fields: boolean→switch, enum→select, string→input, number→slider). For optional slots, an enable/disable toggle.
- **Right — live preview:** an `<iframe>` of the storefront in **preview mode** (`/?preview=1` or a `preview` cookie) which reads the **draft** document. On any control change, the draft is patched (debounced autosave to the `draft` row) and the iframe refreshes/receives a `postMessage` to re-render.
- **Top bar:** Save (persist draft — automatic/debounced) · **Publish** (promote draft→published + revalidate) · "View live" · unsaved/last-published indicators.

The options form is **generated**, not hand-written per variant — adding a variant with a new option automatically yields the right control. A small zod-introspection helper maps each variant's `optionsSchema` to form-field descriptors.

## 7. Storefront Consumption

- `getCustomization(mode: 'published' | 'draft')` in `src/core/studio/get-customization.ts`:
  - `published`: `fetch`/db read tagged `['customization']`, ISR `revalidate` — fast, cached, busted on publish.
  - `draft`: dynamic (no cache) — used only when preview mode is active (admin-authenticated or preview cookie).
- A `<Slot name="header" doc={doc} />` resolver (`src/core/studio/slot.tsx`): looks up `registry[slot][doc.slots[slot].variant]`, validates options against the variant schema (falling back to defaults on mismatch), renders `<Variant.Component options={options} doc={doc} />`. Unknown variant → render the slot's default variant + log.
- **Layout** (`src/app/[locale]/layout.tsx`): reads `getCustomization`, injects `doc.theme` as inline CSS variables on `<html>`, renders `<Slot name="announcementBar">`, `<Slot name="header">`, `{children}`, `<Slot name="footer">`, `<Slot name="cartDrawer">`.
- **Home page** renders `doc.pages.home` blocks (hero, slider, grid) in order; product data for sliders/grids comes from WP/WooGraphQL (a slider's `collection` option maps to a WP product category).
- **Preview mode** is gated: only an authenticated admin session (or a signed preview token) may render the draft; anonymous `?preview=1` is ignored to prevent leaking unpublished design.

## 8. Auth

- `adminUsers` with bcrypt/argon2 password hashes.
- `POST /admin/login` (server action) verifies credentials, sets a signed, HTTP-only, SameSite=Lax session cookie (reuse the Phase-0 sealed-cookie helper pattern).
- `middleware.ts` guards `/admin/**` (except `/admin/login`): no valid session → redirect to login.
- One admin seeded per client via `npm run db:seed` (email+password from env). Multi-admin/roles is a later extension; the `role` column is present but unused in v1.
- Fully separate from customer accounts (Phase 6, WP JWT). Admins are not WooCommerce customers.

## 9. Relationship to Existing Architecture

- Extends the original design spec's §11 "override registry" (Header/Footer/ProductCard/Hero/CheckoutSteps override points) into a full, options-bearing **variant registry**.
- `@core` owns the registry interface, schema, resolver, DB, admin, and the **core variant library**; `@client/studio/` may register additional variants — resolved by merging client variants over core at registry-build time. Respects the existing `@core`/`@client` ESLint boundaries (the registry merge happens through `src/client.ts`-style indirection, not a core→client import).
- The existing static `theme.css` provides the *fallback* tokens; the Studio `theme` document overrides them at runtime. Per-client `theme.css` still sets a client's baseline.
- Product rendering (PLP/PDP from Phase 2a) is unchanged; Studio variants for `productCard`/`productGrid`/`productSlider` wrap the existing product data fetchers.

## 10. Error Handling

- Invalid/old document (unknown variant, bad options): the resolver renders the slot's default variant and logs; the document is never allowed to crash the storefront.
- DB unreachable at render: `getCustomization('published')` falls back to `getDefaultDoc()` (registry defaults) so the storefront still renders (consistent with the Phase 2a build-resilience pattern); error logged.
- Save/publish validation failure: surfaced in the admin UI with the zod error; nothing is persisted.
- Preview without auth: ignored (renders published).

## 11. Testing Strategy

- **Unit (Vitest):** `customizationSchema` validation (valid/invalid docs, per-variant options validation, `getDefaultDoc`), registry integrity (every registered variant's defaults parse against its own schema), the zod→form-field descriptor mapping, token→CSS-variable serialization.
- **Integration:** `getCustomization` draft/published/db-down fallback; the `<Slot>` resolver with valid/unknown variants; publish → revalidate path.
- **E2E (Playwright):** admin login → change header variant + a color → see preview update → publish → assert the live storefront reflects it. Auth guard on `/admin`.
- **Static gates:** TypeScript strict, ESLint boundaries (no core→client), zod env/config validation, registry-default self-consistency check in CI.

## 12. Decomposition Roadmap

The full vision is specified here; implementation proceeds in independently-shippable slices. **Studio-0 is a thin vertical slice that proves the entire pipeline** before any mass-production of variants.

| Sub-project | Deliverable |
|---|---|
| **Studio-0 (Foundation)** | Drizzle + SQLite dev DB + migrations + seed; `customizationSchema` + `getDefaultDoc`; admin auth (login, session, middleware guard); `getCustomization` (draft/published/fallback); `<Slot>` resolver + global token injection in layout; **Header slot with 2–3 variants**; a minimal `/admin` customizer (header variant gallery + color editor) with live preview; publish → `revalidateTag`. End-to-end proof. |
| Studio-1 | Header library → 20 curated variants + their options |
| Studio-2 | Footer → 20 variants |
| Studio-3 | Hero variants + the home page-composition block list |
| Studio-4 | Product Card + Product Grid + Product Slider variants (wrapping Phase-2a fetchers) |
| Studio-5 | Announcement bar + Cart drawer variants |
| Studio-6 | Checkout layout variants (coordinated with Phase 5 checkout) |
| Studio-7 | Page composition (atomic block arrange), theme presets gallery, import/export doc, version history/rollback, multi-admin roles |

Each slice gets its own spec addendum (where needed) + implementation plan + build/review cycle. **Studio-0 is planned and built first.**

## 13. Open Questions (resolve at Studio-0 planning)

- `/admin` placement: under `[locale]` or a top-level locale-independent route (likely top-level — the admin UI is English-only for v1).
- Live-preview refresh mechanism: full iframe reload on debounce (simplest, robust) vs. `postMessage` partial updates (snappier, more work) — start with debounced reload in Studio-0.
- Thumbnail generation for the variant gallery: hand-made static images vs. auto-screenshots — hand-made placeholders in Studio-0.
- Font loading for the font-pair selector: `next/font` with a curated allow-list of pairs (not arbitrary fonts) in v1.

## 14. Out of Scope (v1, deferred to Studio-7+)

- Free-form drag-drop atomic page builder.
- A/B testing / scheduled publishing.
- Multi-admin RBAC, audit log.
- Arbitrary custom CSS/JS injection.
- Marketplace of third-party variants.
