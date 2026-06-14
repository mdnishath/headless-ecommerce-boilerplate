# Studio-0a: Customization Foundation (DB + Registry + Resolver + Header)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stand up the Studio customization pipeline end-to-end *without the admin UI yet*: a SQLite (Drizzle) database, the zod customization schema + `getDefaultDoc`, the variant registry with 3 Header variants, a `<Slot>` resolver, `getCustomization` with DB-less fallback, and the storefront layout rendering the Header from the customization document with global theme tokens injected as CSS variables.

**Architecture:** `src/core/studio/` owns the registry (typed `Record<slot, Record<variantId, VariantDef>>`), the zod schema, the resolver, and the customization reader. `src/core/db/` owns Drizzle (SQLite dev). Header variant components live in `src/components/studio/header/`. The flat `src/app/layout.tsx` reads the published document, injects `theme` tokens as inline CSS variables, and renders `<Slot name="header">`. Everything is build-resilient: no DB / no WordPress → render registry defaults.

**Tech Stack:** Drizzle ORM + better-sqlite3 + drizzle-kit, zod v4, Next.js 15 RSC, Tailwind v4, lucide-react (icons, already present via shadcn).

**Scope notes:**
- Studio-0a is **SQLite only** (dev). The spec's "→ Postgres prod" is a deployment concern wired when the project first deploys to prod; the DB client is structured (env-driven URL) so a Postgres driver can be added later. Not building dual-dialect now (YAGNI for the foundation).
- Only the **Header** slot is implemented. The `adminUsers` table is created now (one migration) but auth logic is Studio-0b.
- **Client-variant merge** (a client fork registering extra variants) is a Studio-1 concern; 0a's resolver reads the core registry directly (core→core only, no boundary violation). The registry is structured so a merge bridge can wrap it later.

**Preconditions:** Repo root `E:\Ecommerce Platform`, Windows/PowerShell, Next 15 app from Phase 0-2a. Gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run verify:client-alias`.

---

### Task 1: Drizzle + SQLite database (schema, client, migrations, env)

**Files:**
- Create: `src/core/db/schema.ts`, `src/core/db/client.ts`, `drizzle.config.ts`
- Modify: `package.json` (deps + scripts), `next.config.ts` (serverExternalPackages), `.env.example`, `.gitignore`
- Create: `.env.local` (gitignored), `.data/.gitkeep`

- [ ] **Step 1: Install dependencies**

```powershell
npm install drizzle-orm better-sqlite3
npm install -D drizzle-kit @types/better-sqlite3
```

- [ ] **Step 2: Create `src/core/db/schema.ts`**

```ts
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Admin users for the Studio customizer (auth logic in Studio-0b). */
export const adminUsers = sqliteTable("admin_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/** Per-store customization documents: at most one draft + one published per storeKey. */
export const customization = sqliteTable(
  "customization",
  {
    id: text("id").primaryKey(),
    storeKey: text("store_key").notNull(),
    status: text("status", { enum: ["draft", "published"] }).notNull(),
    document: text("document").notNull(), // JSON string of CustomizationDoc
    version: integer("version").notNull().default(1),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    uniqStoreStatus: uniqueIndex("uniq_store_status").on(t.storeKey, t.status),
  }),
);
```

- [ ] **Step 3: Create `src/core/db/client.ts`**

```ts
import "server-only";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@core/db/schema";

const url = process.env.DATABASE_URL ?? "file:.data/studio.db";
const file = url.replace(/^file:/, "");
mkdirSync(dirname(file), { recursive: true });

const sqlite = new Database(file);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
export { schema };
```

- [ ] **Step 4: Create `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/core/db/schema.ts",
  out: "./src/core/db/migrations",
  dbCredentials: {
    url: (process.env.DATABASE_URL ?? "file:.data/studio.db").replace(/^file:/, ""),
  },
});
```

- [ ] **Step 5: Add scripts to `package.json`**

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
```

- [ ] **Step 6: `next.config.ts` — keep better-sqlite3 external on the server**

Add this key to the `nextConfig` object (alongside `webpack` and `images`, do NOT remove them):

```ts
  serverExternalPackages: ["better-sqlite3"],
```

- [ ] **Step 7: Env + gitignore**

Append to `.env.example`:
```
# Studio database (dev: SQLite file; prod: postgres:// URL — see Studio deploy notes)
DATABASE_URL=file:.data/studio.db
# Studio admin (seeded by db:seed in Studio-0b)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=changeme
SESSION_SECRET=dev-session-secret-change-in-prod-min-32-chars
```
Create `.env.local` (already gitignored by `.env*`) with the same four lines (real-ish dev values; SESSION_SECRET at least 32 chars).
Append to `.gitignore`:
```
.data/
```
Create `.data/.gitkeep` so the dir exists, then (since `.data/` is ignored) force-add only the keep file:
```powershell
New-Item -ItemType Directory -Force .data | Out-Null
New-Item -ItemType File .data\.gitkeep | Out-Null
git add -f .data/.gitkeep
```

- [ ] **Step 8: Generate + apply the migration, verify a round-trip**

```powershell
npm run db:generate
npm run db:migrate
```
Expected: a migration file appears under `src/core/db/migrations/`; migrate reports applied.

Confirm the tables exist:
```powershell
node -e "const Database=require('better-sqlite3'); const db=new Database('.data/studio.db'); const rows=db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all(); console.log(rows.map(r=>r.name).join(','));"
```
Expected: output contains `admin_users` and `customization` (plus `__drizzle_migrations`). If `better-sqlite3` failed to install (native build), ensure VS Build Tools are present and re-run `npm install better-sqlite3` (the user has the x64 Native Tools installed).

- [ ] **Step 9: Verify gates + commit**

```powershell
npm run typecheck
npm run lint
git add -A
git commit -m "feat(studio): Drizzle SQLite database — schema, client, migrations"
```
Expected: typecheck + lint exit 0. Confirm `.env.local` and `.data/studio.db` are NOT in the commit (gitignored); `src/core/db/migrations/*` IS committed.

---

### Task 2: Registry types + slot definitions

**Files:**
- Create: `src/core/studio/types.ts`, `src/core/studio/registry/index.ts`
- Test: `src/core/studio/registry/index.test.ts`

- [ ] **Step 1: Create `src/core/studio/types.ts`**

```ts
import type { ComponentType } from "react";
import type { ZodType } from "zod";
import type { CustomizationDoc } from "@core/studio/schema";

/** Customizable storefront regions. Studio-0a implements only `header`. */
export type SlotName =
  | "announcementBar"
  | "header"
  | "footer"
  | "hero"
  | "productCard"
  | "productGrid"
  | "productSlider"
  | "cartDrawer"
  | "checkoutLayout";

/** Props every variant component receives. */
export type VariantProps<TOptions = Record<string, unknown>> = {
  options: TOptions;
  doc: CustomizationDoc;
};

/** A single registered design variant for a slot. */
export type VariantDef = {
  id: string; // e.g. "header.classic-centered"
  name: string; // gallery display label
  thumbnail: string; // static asset path under /public
  optionsSchema: ZodType; // zod schema for this variant's options (with defaults)
  Component: ComponentType<VariantProps>;
};

/** slot -> variantId -> def */
export type Registry = Partial<Record<SlotName, Record<string, VariantDef>>>;
```

- [ ] **Step 2: Create `src/core/studio/registry/index.ts`** (empty registry that slot files populate)

```ts
import type { Registry, SlotName, VariantDef } from "@core/studio/types";
import { headerVariants } from "@core/studio/registry/header";

/** The core variant registry. Client forks merge additional variants later. */
export const registry: Registry = {
  header: headerVariants,
};

/** All variants for a slot, or {} if none. */
export function slotVariants(slot: SlotName): Record<string, VariantDef> {
  return registry[slot] ?? {};
}

/** First registered variant id for a slot (the default), or null. */
export function defaultVariantId(slot: SlotName): string | null {
  const ids = Object.keys(slotVariants(slot));
  return ids[0] ?? null;
}

/** Look up a variant def, or null. */
export function getVariant(slot: SlotName, id: string): VariantDef | null {
  return slotVariants(slot)[id] ?? null;
}
```

(`header.ts` is created in Task 3; this import will fail to resolve until then — Task 3 is paired with this.)

- [ ] **Step 3: Write the registry self-consistency test** — `src/core/studio/registry/index.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { registry } from "@core/studio/registry";

describe("variant registry", () => {
  it("registers at least one header variant", () => {
    expect(Object.keys(registry.header ?? {}).length).toBeGreaterThan(0);
  });

  it("every variant's id equals `<slot>.<key>` and parses its own option defaults", () => {
    for (const [slot, variants] of Object.entries(registry)) {
      for (const [key, def] of Object.entries(variants ?? {})) {
        // id convention: the registry key is the variant's short id.
        expect(def.id).toBe(`${slot}.${key}`);
        // defaults must satisfy the variant's own schema (parse with no input).
        const parsed = def.optionsSchema.safeParse(undefined);
        expect(parsed.success, `${def.id} defaults must parse`).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 4: Run — expect FAIL (header.ts missing)**

```powershell
npm test
```
Expected: FAIL resolving `@core/studio/registry/header`. This is paired with Task 3; proceed.

- [ ] **Step 5: Commit (after Task 3 makes it pass — see Task 3 Step 6).** Skip commit here; Tasks 2+3 commit together.

---

### Task 3: Three Header variants

**Files:**
- Create: `src/components/studio/header/classic-centered.tsx`, `minimal-left.tsx`, `bold-cta.tsx`, `header-primitives.tsx`
- Create: `src/core/studio/registry/header.ts`
- Create (placeholder assets): `public/studio/header/classic-centered.svg`, `minimal-left.svg`, `bold-cta.svg`

- [ ] **Step 1: Shared header primitives** — `src/components/studio/header/header-primitives.tsx`

```tsx
import Link from "next/link";
import { Search, ShoppingBag } from "lucide-react";
import { activeClient } from "@/client";

export function StoreName({ className }: { className?: string }) {
  return (
    <Link href="/" className={className}>
      {activeClient.identity.name}
    </Link>
  );
}

const NAV = [
  { label: "Shop", href: "/" },
  { label: "T-Shirts", href: "/?category=t-shirts" },
  { label: "Hoodies", href: "/?category=hoodies" },
];

export function Nav({ className }: { className?: string }) {
  return (
    <nav className={className}>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className="hover:text-primary">
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

export function SearchIcon() {
  return <Search className="h-5 w-5" aria-label="Search" />;
}

export function CartIcon() {
  return <ShoppingBag className="h-5 w-5" aria-label="Cart" />;
}
```

Note: `src/components/**` is outside the `src/core/**` boundary rule, so importing `@/client` here is allowed (the rule only forbids `src/core` and `src/clients` from those imports).

- [ ] **Step 2: `classic-centered.tsx`** (logo centered, nav below)

```tsx
import type { VariantProps } from "@core/studio/types";
import { CartIcon, Nav, SearchIcon, StoreName } from "./header-primitives";

export type ClassicCenteredOptions = { sticky: boolean; showSearch: boolean };

export function ClassicCentered({ options }: VariantProps<ClassicCenteredOptions>) {
  return (
    <header
      className={`border-b bg-background ${options.sticky ? "sticky top-0 z-40" : ""}`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="w-16">{options.showSearch ? <SearchIcon /> : null}</div>
        <StoreName className="text-xl font-bold tracking-tight" />
        <div className="flex w-16 justify-end">
          <CartIcon />
        </div>
      </div>
      <Nav className="mx-auto flex max-w-6xl justify-center gap-6 pb-3 text-sm" />
    </header>
  );
}
```

- [ ] **Step 3: `minimal-left.tsx`** (logo left, nav inline, no search)

```tsx
import type { VariantProps } from "@core/studio/types";
import { CartIcon, Nav, SearchIcon, StoreName } from "./header-primitives";

export type MinimalLeftOptions = { sticky: boolean; showSearch: boolean };

export function MinimalLeft({ options }: VariantProps<MinimalLeftOptions>) {
  return (
    <header
      className={`border-b bg-background ${options.sticky ? "sticky top-0 z-40" : ""}`}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-4 py-4">
        <StoreName className="text-lg font-semibold" />
        <Nav className="flex gap-6 text-sm" />
        <div className="ml-auto flex items-center gap-4">
          {options.showSearch ? <SearchIcon /> : null}
          <CartIcon />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: `bold-cta.tsx`** (logo left, prominent CTA button)

```tsx
import type { VariantProps } from "@core/studio/types";
import { CartIcon, Nav, StoreName } from "./header-primitives";

export type BoldCtaOptions = { sticky: boolean; ctaText: string };

export function BoldCta({ options }: VariantProps<BoldCtaOptions>) {
  return (
    <header
      className={`border-b bg-primary text-primary-foreground ${options.sticky ? "sticky top-0 z-40" : ""}`}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-4 py-4">
        <StoreName className="text-lg font-bold" />
        <Nav className="hidden gap-6 text-sm md:flex" />
        <div className="ml-auto flex items-center gap-4">
          <span className="rounded-md bg-background px-3 py-1 text-sm font-medium text-foreground">
            {options.ctaText}
          </span>
          <CartIcon />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: `src/core/studio/registry/header.ts`** (options schemas + registration)

```ts
import { z } from "zod";
import type { VariantDef } from "@core/studio/types";
import { ClassicCentered } from "@/components/studio/header/classic-centered";
import { MinimalLeft } from "@/components/studio/header/minimal-left";
import { BoldCta } from "@/components/studio/header/bold-cta";

const classicCenteredOptions = z.object({
  sticky: z.boolean().default(true),
  showSearch: z.boolean().default(true),
});

const minimalLeftOptions = z.object({
  sticky: z.boolean().default(false),
  showSearch: z.boolean().default(true),
});

const boldCtaOptions = z.object({
  sticky: z.boolean().default(true),
  ctaText: z.string().default("Shop now"),
});

export const headerVariants: Record<string, VariantDef> = {
  "classic-centered": {
    id: "header.classic-centered",
    name: "Classic — Centered",
    thumbnail: "/studio/header/classic-centered.svg",
    optionsSchema: classicCenteredOptions,
    Component: ClassicCentered,
  },
  "minimal-left": {
    id: "header.minimal-left",
    name: "Minimal — Left",
    thumbnail: "/studio/header/minimal-left.svg",
    optionsSchema: minimalLeftOptions,
    Component: MinimalLeft,
  },
  "bold-cta": {
    id: "header.bold-cta",
    name: "Bold — CTA",
    thumbnail: "/studio/header/bold-cta.svg",
    optionsSchema: boldCtaOptions,
    Component: BoldCta,
  },
};
```

Note: `src/core/studio/registry/header.ts` imports variant components from `@/components/...`. `@/components` is NOT `@client`/clients/app, so the core boundary rule (which forbids `@client`, `**/clients/**`, `@/app/*`, `**/app/**`) does NOT flag it. Confirm with `npm run lint`.

- [ ] **Step 6: Create the placeholder thumbnails** — three simple SVGs. Each file (`public/studio/header/<name>.svg`) e.g. `classic-centered.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 80" width="320" height="80">
  <rect width="320" height="80" fill="#f4f4f5"/>
  <rect x="130" y="22" width="60" height="10" rx="2" fill="#71717a"/>
  <rect x="100" y="48" width="120" height="6" rx="2" fill="#a1a1aa"/>
  <text x="8" y="16" font-family="sans-serif" font-size="9" fill="#a1a1aa">Classic — Centered</text>
</svg>
```
Make `minimal-left.svg` and `bold-cta.svg` analogous (vary the rectangle layout + label) so the three thumbnails look distinct.

- [ ] **Step 7: Run the registry test — expect PASS**

```powershell
npm test
```
Expected: the registry tests from Task 2 PASS (3 header variants; every variant's defaults parse). Also `npm run typecheck` + `npm run lint` exit 0.

- [ ] **Step 8: Commit (Tasks 2+3 together)**

```powershell
git add src/core/studio/types.ts src/core/studio/registry src/components/studio public/studio
git commit -m "feat(studio): variant registry + 3 header variants with option schemas"
```

---

### Task 4: Customization schema + getDefaultDoc + token serialization

**Files:**
- Create: `src/core/studio/schema.ts`, `src/core/studio/theme.ts`
- Test: `src/core/studio/schema.test.ts`, `src/core/studio/theme.test.ts`

- [ ] **Step 1: Write failing tests** — `src/core/studio/schema.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  customizationSchema,
  getDefaultDoc,
  validateSlot,
} from "@core/studio/schema";

describe("customization schema", () => {
  it("getDefaultDoc returns a valid document with a header variant", () => {
    const doc = getDefaultDoc();
    expect(customizationSchema.safeParse(doc).success).toBe(true);
    expect(doc.slots.header.variant).toBe("header.classic-centered");
    expect(doc.theme.primary).toBeTruthy();
  });

  it("validateSlot fills variant option defaults", () => {
    const opts = validateSlot("header", "header.classic-centered", {});
    expect(opts).toEqual({ sticky: true, showSearch: true });
  });

  it("validateSlot falls back to defaults for an unknown variant", () => {
    const opts = validateSlot("header", "header.does-not-exist", { x: 1 });
    expect(opts).toEqual({}); // unknown variant -> empty options, resolver picks default variant
  });

  it("rejects a document with a malformed theme", () => {
    const bad = { ...getDefaultDoc(), theme: { primary: 123 } };
    expect(customizationSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`@core/studio/schema` missing)

```powershell
npm test
```
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement `src/core/studio/schema.ts`**

```ts
import { z } from "zod";
import type { SlotName } from "@core/studio/types";
import { defaultVariantId, getVariant } from "@core/studio/registry";

export const themeSchema = z.object({
  colorScheme: z.string().default("default"),
  primary: z.string().default("oklch(0.55 0.2 260)"),
  secondary: z.string().default("oklch(0.7 0.05 260)"),
  accent: z.string().default("oklch(0.65 0.15 30)"),
  background: z.string().default("oklch(1 0 0)"),
  foreground: z.string().default("oklch(0.2 0 0)"),
  fontHeading: z.string().default("Geist"),
  fontBody: z.string().default("Geist"),
  radius: z.string().default("0.5rem"),
  spacingScale: z.number().default(1),
});

const slotSelection = z.object({
  variant: z.string(),
  enabled: z.boolean().default(true),
  options: z.record(z.string(), z.unknown()).default({}),
});

export const customizationSchema = z.object({
  theme: themeSchema.default({}),
  slots: z.object({
    header: slotSelection,
  }),
});

export type CustomizationDoc = z.infer<typeof customizationSchema>;

/** Validate a slot's options against the SELECTED variant's own schema.
 *  Unknown variant -> {} (resolver will fall back to the default variant). */
export function validateSlot(
  slot: SlotName,
  variantId: string,
  options: unknown,
): Record<string, unknown> {
  const variant = getVariant(slot, variantId.replace(`${slot}.`, ""));
  if (!variant) {
    return {};
  }
  const parsed = variant.optionsSchema.safeParse(options ?? {});
  return parsed.success
    ? (parsed.data as Record<string, unknown>)
    : (variant.optionsSchema.parse(undefined) as Record<string, unknown>);
}

/** Build a valid default document from registry defaults. */
export function getDefaultDoc(): CustomizationDoc {
  const headerId = defaultVariantId("header") ?? "classic-centered";
  const headerVariant = `header.${headerId}`;
  return {
    theme: themeSchema.parse({}),
    slots: {
      header: {
        variant: headerVariant,
        enabled: true,
        options: validateSlot("header", headerVariant, {}),
      },
    },
  };
}
```

- [ ] **Step 4: Run — expect schema tests PASS**

```powershell
npm test
```
Expected: the 4 schema tests pass.

- [ ] **Step 5: Write failing theme test** — `src/core/studio/theme.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { themeToCssVars } from "@core/studio/theme";
import { getDefaultDoc } from "@core/studio/schema";

describe("themeToCssVars", () => {
  it("serializes theme tokens to a CSS-variable style string", () => {
    const css = themeToCssVars(getDefaultDoc().theme);
    expect(css["--primary"]).toBe("oklch(0.55 0.2 260)");
    expect(css["--radius"]).toBe("0.5rem");
    expect(css["--background"]).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run — expect FAIL**, then implement `src/core/studio/theme.ts`

```ts
import type { CustomizationDoc } from "@core/studio/schema";

type Theme = CustomizationDoc["theme"];

/** Map theme tokens to a React inline-style object of CSS custom properties. */
export function themeToCssVars(theme: Theme): Record<string, string> {
  return {
    "--primary": theme.primary,
    "--secondary": theme.secondary,
    "--accent": theme.accent,
    "--background": theme.background,
    "--foreground": theme.foreground,
    "--radius": theme.radius,
  };
}
```

- [ ] **Step 7: Run — expect all tests PASS; typecheck + lint**

```powershell
npm test
npm run typecheck
npm run lint
```
Expected: all green.

- [ ] **Step 8: Commit**

```powershell
git add src/core/studio/schema.ts src/core/studio/schema.test.ts src/core/studio/theme.ts src/core/studio/theme.test.ts
git commit -m "feat(studio): customization zod schema, getDefaultDoc, theme-token serialization"
```

---

### Task 5: getCustomization (DB read + build-resilient fallback)

**Files:**
- Create: `src/core/studio/get-customization.ts`
- Test: `src/core/studio/get-customization.test.ts`

- [ ] **Step 1: Write failing test** — `src/core/studio/get-customization.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";

// The DB module is server-only + native; mock it so the unit test is hermetic.
vi.mock("@core/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => [] }), // no rows
      }),
    }),
  },
  schema: {},
}));

describe("getCustomization", () => {
  it("falls back to the default document when no row exists", async () => {
    const { getCustomization } = await import("@core/studio/get-customization");
    const doc = await getCustomization("published");
    expect(doc.slots.header.variant).toBe("header.classic-centered");
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`@core/studio/get-customization` missing)

```powershell
npm test
```
Expected: FAIL.

- [ ] **Step 3: Implement `src/core/studio/get-customization.ts`**

```ts
import "server-only";
import { and, eq } from "drizzle-orm";
import { customizationSchema, getDefaultDoc, type CustomizationDoc } from "@core/studio/schema";

const STORE_KEY = process.env.CLIENT ?? "_default";

/**
 * Read the active store's customization document.
 * - 'published' is the live document; 'draft' is the in-progress edit.
 * - Falls back to registry defaults if the DB is unreachable or the row is
 *   missing/invalid, so the storefront (and CI build with no DB) never breaks.
 */
export async function getCustomization(
  mode: "published" | "draft",
): Promise<CustomizationDoc> {
  try {
    const { db, schema } = await import("@core/db/client");
    const rows = db
      .select()
      .from(schema.customization)
      .where(
        and(
          eq(schema.customization.storeKey, STORE_KEY),
          eq(schema.customization.status, mode),
        ),
      )
      .limit(1);
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row) {
      return getDefaultDoc();
    }
    const parsed = customizationSchema.safeParse(JSON.parse(row.document));
    return parsed.success ? parsed.data : getDefaultDoc();
  } catch (err) {
    console.error("getCustomization fell back to defaults:", err);
    return getDefaultDoc();
  }
}
```

Note: `db.select()...` with better-sqlite3 is synchronous (returns an array), so no `await` on the query; the `import("@core/db/client")` is awaited. The test mock returns `[]` from `.limit()`.

- [ ] **Step 4: Run — expect PASS**

```powershell
npm test
```
Expected: the fallback test passes.

- [ ] **Step 5: Commit**

```powershell
git add src/core/studio/get-customization.ts src/core/studio/get-customization.test.ts
git commit -m "feat(studio): getCustomization reader with DB-less fallback to defaults"
```

---

### Task 6: `<Slot>` resolver

**Files:**
- Create: `src/core/studio/slot.tsx`
- Test: `src/core/studio/slot.test.tsx`

- [ ] **Step 1: Install the testing libs** (jsdom + RTL for component render; `@testing-library/dom` is RTL's peer)

```powershell
npm install -D @testing-library/react @testing-library/dom jsdom
```

- [ ] **Step 2: Let vitest pick up `.tsx` tests** — update `vitest.config.ts` `include` only (keep `environment: "node"`; the jsdom env is set per-file via a pragma to avoid the deprecated `environmentMatchGlobs`):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 3: Write failing test** — `src/core/studio/slot.test.tsx` (first line is the jsdom pragma)

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Slot } from "@core/studio/slot";
import { getDefaultDoc } from "@core/studio/schema";

describe("Slot resolver", () => {
  it("renders the selected header variant", () => {
    render(<Slot name="header" doc={getDefaultDoc()} />);
    // classic-centered renders the store name link "Default Storefront"
    expect(screen.getByText("Default Storefront")).toBeDefined();
  });

  it("falls back to the default variant when the doc names an unknown variant", () => {
    const doc = getDefaultDoc();
    doc.slots.header.variant = "header.nope";
    render(<Slot name="header" doc={doc} />);
    expect(screen.getByText("Default Storefront")).toBeDefined();
  });
});
```

- [ ] **Step 4: Run — expect FAIL** (`@core/studio/slot` missing)

```powershell
npm test
```
Expected: FAIL.

- [ ] **Step 5: Implement `src/core/studio/slot.tsx`**

```tsx
import type { CustomizationDoc } from "@core/studio/schema";
import { validateSlot } from "@core/studio/schema";
import { defaultVariantId, getVariant } from "@core/studio/registry";
import type { SlotName } from "@core/studio/types";

/** Resolve a slot's selected variant from the document and render it.
 *  Unknown/missing variant -> the slot's default variant (logged). */
export function Slot({ name, doc }: { name: SlotName; doc: CustomizationDoc }) {
  const selection = name === "header" ? doc.slots.header : undefined;
  const requestedId = selection?.variant ?? "";
  const shortId = requestedId.replace(`${name}.`, "");

  let variant = getVariant(name, shortId);
  if (!variant) {
    const fallbackId = defaultVariantId(name);
    if (requestedId) {
      console.warn(`Slot "${name}": unknown variant "${requestedId}", using "${fallbackId}".`);
    }
    variant = fallbackId ? getVariant(name, fallbackId) : null;
  }
  if (!variant) {
    return null; // no variants registered for this slot
  }

  const variantShortId = variant.id.replace(`${name}.`, "");
  const options = validateSlot(name, `${name}.${variantShortId}`, selection?.options ?? {});
  const Component = variant.Component;
  return <Component options={options} doc={doc} />;
}
```

- [ ] **Step 6: Run — expect PASS**

```powershell
npm test
```
Expected: both Slot tests pass (known + unknown variant both render the header).

- [ ] **Step 7: Commit**

```powershell
git add src/core/studio/slot.tsx src/core/studio/slot.test.tsx vitest.config.ts package.json
git commit -m "feat(studio): Slot resolver with unknown-variant fallback"
```

---

### Task 7: Wire Studio into the storefront layout

**Files:**
- Modify: `src/app/layout.tsx`
- Verify: build, dev render, gates

- [ ] **Step 1: Read the current `src/app/layout.tsx`** to preserve fonts + body classes + the `@client/theme.css` import (added in Phase 0). Then modify it to inject theme tokens + render the header Slot.

Replace the `RootLayout` component (keep the existing imports for fonts, `./globals.css`, `@client/theme.css`, and add the new ones) so it becomes:

```tsx
import { getCustomization } from "@core/studio/get-customization";
import { themeToCssVars } from "@core/studio/theme";
import { Slot } from "@core/studio/slot";

// ... keep existing font setup + metadata ...

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const doc = await getCustomization("published");
  const cssVars = themeToCssVars(doc.theme) as React.CSSProperties;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      style={cssVars}
    >
      <body className="antialiased">
        <Slot name="header" doc={doc} />
        {children}
      </body>
    </html>
  );
}
```

Keep the existing `metadata` export and font `const` declarations exactly as they are. Only the component body + the three new imports change.

- [ ] **Step 2: Verify gates (build must be DB-less-safe)**

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```
Expected: all exit 0. The build calls `getCustomization('published')` for the layout — with the dev DB present it reads (or falls back); with no DB it falls back to defaults. Either way the build succeeds.

- [ ] **Step 3: Verify the alias probe still passes** (Studio touches the layout the probe renders)

```powershell
npm run verify:client-alias
```
Expected: `OK: @client alias resolves per CLIENT env var`, exit 0.

- [ ] **Step 4: Verify the header renders in dev**

```powershell
$dev = Start-Job { Set-Location "E:\Ecommerce Platform"; npm run dev }
Start-Sleep -Seconds 14
try {
  $html = (Invoke-WebRequest "http://localhost:3000" -UseBasicParsing -TimeoutSec 25).Content
  Write-Host "header present (store name in a <header>): $($html -match '<header')"
  Write-Host "store name present: $($html -match 'Default Storefront')"
  Write-Host "nav 'Shop' present: $($html -match 'Shop')"
  Write-Host "primary css var injected: $($html -match '--primary')"
} finally {
  Stop-Job $dev -ErrorAction SilentlyContinue; Remove-Job $dev -ErrorAction SilentlyContinue
}
```
Expected: a `<header>` element renders with the store name + nav; the `--primary` CSS variable is present on the `<html>` style. The Phase-2a product grid still renders below.

- [ ] **Step 5: Commit**

```powershell
git add src/app/layout.tsx
git commit -m "feat(studio): render header Slot + inject theme tokens in the storefront layout"
```

---

## Studio-0a Definition of Done

- `npm run lint && npm run typecheck && npm test && npm run build && npm run verify:client-alias` all green.
- The Drizzle SQLite DB has `admin_users` + `customization` tables (migration committed).
- The registry holds 3 header variants; the self-consistency test passes (every variant's defaults parse).
- `getDefaultDoc()` produces a valid document; `getCustomization` falls back to it with no DB.
- The storefront renders the **header from the customization document** with `theme` tokens injected as CSS variables, above the Phase-2a product grid.
- No WordPress/PHP changes; product data unchanged.

## Carried to Studio-0b

- **Admin auth**: `adminUsers` table exists; build login server action + signed session cookie + `/admin` middleware guard; `db:seed` to create the admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- **Customizer UI** at `/admin`: header variant gallery (thumbnails from registry) + color pickers + auto-generated options form (zod→fields); **draft** persistence (writes the `customization` draft row); **Publish** (draft→published + `revalidateTag('customization')`).
- **Live preview**: iframe of the storefront in preview mode reading the **draft** doc (gated to authenticated admin), debounced reload on change. Add a `getCustomization('draft')` path guarded by the admin session.
- **Tests**: schema/registry/resolver units exist; add publish-flow + auth-guard integration and (optional) a Playwright E2E (login → change header → publish → live reflects).

### Review findings carried to Studio-0b (Studio-0a passed review — no Critical/Important issues)

- **Wire the remaining theme tokens** before exposing them in the admin Theme panel: `themeToCssVars` (`src/core/studio/theme.ts`) currently emits only `primary/secondary/accent/background/foreground/radius`. `colorScheme`, `fontHeading`, `fontBody`, `spacingScale` exist in `themeSchema` but are NOT emitted — so a 0b control for them would do nothing. Either wire them (fonts via the planned `next/font` allow-list; spacing via a scale var) or omit those controls in 0b. Don't ship dead controls.
- **Add caching to the published read**: `getCustomization('published')` is currently a direct synchronous DB read. Wrap the *published* path in `unstable_cache(..., { tags: ['customization'] })` (or a tagged fetch) so Publish's `revalidateTag('customization')` works. Keep the *draft* path uncached (it reads the admin session/cookies; `unstable_cache` can't wrap `cookies()`).
- **Optional hardening:** the `variantId.replace(\`${slot}.\`, "")` id-strip is robust for real inputs (verified) but anchor it for provable correctness: `id.startsWith(\`${slot}.\`) ? id.slice(slot.length + 1) : id` in `schema.ts` and `slot.tsx`.
- **Build-safety is verified** under no-DB/uncreatable-path (getCustomization catches the dynamic-import eval throw and falls back) — 0b must preserve this property (don't let the admin/publish path throw at build).
