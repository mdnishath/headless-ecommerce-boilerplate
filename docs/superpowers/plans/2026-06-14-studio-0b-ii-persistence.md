# Studio-0b-ii: Persistence, Caching & Preview Mode

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the customization document editable + publishable: a testable DB repository (`repo.ts`), admin-gated server actions (`getDraft`/`saveDraft`/`publishDraft` + enable/disable preview), cached published reads (`unstable_cache` + `revalidateTag('customization')` on publish), and `getActiveCustomization()` that renders the **draft** under Next Draft Mode (admin preview) or the **published** doc otherwise (public, cacheable).

**Architecture:** DB read/write logic lives in `src/core/studio/repo.ts` (server-only, pure, unit-tested with a mocked db). `src/core/studio/actions.ts` ("use server") wraps the repo with `requireAdmin()` + `revalidateTag`. `get-customization.ts` is refactored to call the repo, wrap the published read in `unstable_cache(..., { tags: ['customization'] })`, and expose `getActiveCustomization()` keyed off Next Draft Mode. The layout/home render `getActiveCustomization()`.

**Tech Stack:** Drizzle better-sqlite3 (`.get()` to execute), Next 15 `unstable_cache`/`revalidateTag`/`draftMode`/server actions, zod v4.

**This is sub-plan 0b-ii of Studio-0b** (prior: 0b-i auth; next: 0b-iii customizer UI). After 0b-ii: the publish pipeline works (save a draft → publish → the cached published storefront updates via revalidateTag), and admins in Draft Mode see the draft — all verifiable by script before any UI exists.

**Preconditions:** Studio-0a + 0b-i done. `@core/db/client` (db+schema), `@core/studio/schema` (customizationSchema, getDefaultDoc, CustomizationDoc), `@core/studio/get-customization` (getCustomization, uses `.get()`), `@core/auth/current-admin` (getCurrentAdmin). Gates: lint/typecheck/test/build/verify:client-alias. NO dev server during build steps.

---

### Task 1: Customization repository (DB ops, unit-tested)

**Files:**
- Create: `src/core/studio/repo.ts`
- Test: `src/core/studio/repo.test.ts`

- [ ] **Step 1: Write the failing test** — `src/core/studio/repo.test.ts`

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { getDefaultDoc } from "@core/studio/schema";

// In-memory fake of the drizzle better-sqlite3 surface repo.ts uses.
const store: Record<string, { document: string; version: number } | undefined> = {};
const holder = vi.hoisted(() => ({ store: {} as Record<string, { document: string; version: number } | undefined> }));

vi.mock("@core/db/client", () => {
  const rowKey = (status: string) => `_default:${status}`;
  return {
    schema: { customization: { storeKey: "store_key", status: "status", id: "id", document: "document", version: "version", updatedAt: "updated_at" } },
    db: {
      _holder: holder,
      select: () => ({
        from: () => ({
          where: (cond: { status: string }) => ({
            limit: () => ({ get: () => holder.store[rowKey(cond.status)] }),
          }),
        }),
      }),
      insert: () => ({ values: (v: { status: string; document: string; version: number }) => ({ run: () => { holder.store[rowKey(v.status)] = { document: v.document, version: v.version }; } }) }),
      update: () => ({ set: (s: { document: string; version?: number }) => ({ where: (cond: { status: string }) => ({ run: () => { const k = rowKey(cond.status); holder.store[k] = { document: s.document, version: s.version ?? holder.store[k]?.version ?? 1 }; } }) }) }),
    },
  };
});

// The mock's where()/eq() shape is simplified: repo passes a {status} marker.
// (See repo.ts note — eq()/and() are mocked to return a {status} object.)
vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: string) => ({ status: val }),
  and: (...conds: Array<{ status?: string }>) => Object.assign({}, ...conds),
}));

beforeEach(() => {
  for (const k of Object.keys(holder.store)) delete holder.store[k];
});

describe("studio repo", () => {
  it("writeDraft then readDoc('draft') round-trips", async () => {
    const { writeDraft, readDoc } = await import("@core/studio/repo");
    const doc = getDefaultDoc();
    doc.slots.header.variant = "header.minimal-left";
    writeDraft(doc);
    const read = readDoc("draft");
    expect(read?.slots.header.variant).toBe("header.minimal-left");
  });

  it("readDoc returns null when no row", async () => {
    const { readDoc } = await import("@core/studio/repo");
    expect(readDoc("published")).toBeNull();
  });

  it("promoteDraftToPublished copies draft to published and bumps version", async () => {
    const { writeDraft, promoteDraftToPublished, readDoc } = await import("@core/studio/repo");
    const doc = getDefaultDoc();
    doc.slots.header.variant = "header.bold-cta";
    writeDraft(doc);
    const result = promoteDraftToPublished();
    expect(result.ok).toBe(true);
    const pub = readDoc("published");
    expect(pub?.slots.header.variant).toBe("header.bold-cta");
  });
});
```

Note: the mock models `eq`/`and` as returning a `{status}` marker so `where()` can route by status — this keeps repo.ts testable without a real DB. repo.ts must therefore read the status from its `and(eq(storeKey), eq(status))` in a way the mock supports (it passes the column+value to `eq`; the mock ignores the column and keys on the value). Real Drizzle ignores the marker shape — it builds SQL — so this only affects the test double.

- [ ] **Step 2: Run — expect FAIL** (`@core/studio/repo` missing)

```powershell
npm test
```

- [ ] **Step 3: Implement `src/core/studio/repo.ts`**

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@core/db/client";
import {
  customizationSchema,
  type CustomizationDoc,
} from "@core/studio/schema";

const STORE_KEY = process.env.CLIENT ?? "_default";

type Status = "draft" | "published";

/** Read + validate a stored document for this store, or null. */
export function readDoc(status: Status): CustomizationDoc | null {
  const row = db
    .select()
    .from(schema.customization)
    .where(
      and(
        eq(schema.customization.storeKey, STORE_KEY),
        eq(schema.customization.status, status),
      ),
    )
    .limit(1)
    .get();
  if (!row) {
    return null;
  }
  const parsed = customizationSchema.safeParse(JSON.parse(row.document));
  return parsed.success ? parsed.data : null;
}

/** The raw stored version for a status (0 if none). */
function versionOf(status: Status): number {
  const row = db
    .select()
    .from(schema.customization)
    .where(
      and(
        eq(schema.customization.storeKey, STORE_KEY),
        eq(schema.customization.status, status),
      ),
    )
    .limit(1)
    .get();
  return row?.version ?? 0;
}

/** Upsert the draft row with a validated document. */
export function writeDraft(doc: CustomizationDoc): void {
  const parsed = customizationSchema.parse(doc); // throws on invalid
  const document = JSON.stringify(parsed);
  const exists = readDoc("draft") !== null || versionOf("draft") > 0;
  if (exists) {
    db.update(schema.customization)
      .set({ document, updatedAt: new Date() })
      .where(
        and(
          eq(schema.customization.storeKey, STORE_KEY),
          eq(schema.customization.status, "draft"),
        ),
      )
      .run();
  } else {
    db.insert(schema.customization)
      .values({
        id: randomUUID(),
        storeKey: STORE_KEY,
        status: "draft",
        document,
        version: 1,
        updatedAt: new Date(),
      })
      .run();
  }
}

/** Copy the draft into the published row, bumping the published version. */
export function promoteDraftToPublished():
  | { ok: true }
  | { ok: false; error: string } {
  const draft = readDoc("draft");
  if (!draft) {
    return { ok: false, error: "No draft to publish." };
  }
  const document = JSON.stringify(draft);
  const nextVersion = versionOf("published") + 1;
  const exists = versionOf("published") > 0;
  if (exists) {
    db.update(schema.customization)
      .set({ document, version: nextVersion, updatedAt: new Date() })
      .where(
        and(
          eq(schema.customization.storeKey, STORE_KEY),
          eq(schema.customization.status, "published"),
        ),
      )
      .run();
  } else {
    db.insert(schema.customization)
      .values({
        id: randomUUID(),
        storeKey: STORE_KEY,
        status: "published",
        document,
        version: nextVersion,
        updatedAt: new Date(),
      })
      .run();
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run — expect PASS** (3 repo tests)

```powershell
npm test
```
If the mock's `where`/`eq`/`and` shape doesn't line up with how Drizzle is invoked, adjust the TEST DOUBLE only (not repo.ts) until the round-trip works. The goal: prove writeDraft→readDoc and promoteDraftToPublished logic. (A real-DB integration check happens in Task 3.)

- [ ] **Step 5: Commit**

```powershell
git add src/core/studio/repo.ts src/core/studio/repo.test.ts
git commit -m "feat(studio): customization repository (read/writeDraft/promote) with unit tests"
```

---

### Task 2: Cached published read + getActiveCustomization (Draft Mode) + wire layout

**Files:**
- Modify: `src/core/studio/get-customization.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Refactor `src/core/studio/get-customization.ts`** to use the repo, cache the published read, and add `getActiveCustomization`. Replace the file with:

```ts
import "server-only";
import { unstable_cache } from "next/cache";
import { draftMode } from "next/headers";
import { getDefaultDoc, type CustomizationDoc } from "@core/studio/schema";

/** Read a doc via the repo, tolerating any failure (DB down / missing). */
async function readSafe(status: "published" | "draft"): Promise<CustomizationDoc> {
  try {
    const { readDoc } = await import("@core/studio/repo");
    return readDoc(status) ?? getDefaultDoc();
  } catch (err) {
    console.error(`getCustomization(${status}) fell back to defaults:`, err);
    return getDefaultDoc();
  }
}

/** Cached published read — busted by revalidateTag('customization') on publish. */
const getPublishedCached = unstable_cache(
  () => readSafe("published"),
  ["studio-customization-published", process.env.CLIENT ?? "_default"],
  { tags: ["customization"] },
);

/** Read the active store document for a mode (draft is always uncached). */
export async function getCustomization(
  mode: "published" | "draft",
): Promise<CustomizationDoc> {
  return mode === "published" ? getPublishedCached() : readSafe("draft");
}

/**
 * The document the storefront should render:
 * - Draft Mode enabled (admin preview) -> the draft (uncached, fresh).
 * - Otherwise -> the cached published document (public, fast).
 */
export async function getActiveCustomization(): Promise<CustomizationDoc> {
  const { isEnabled } = await draftMode();
  return isEnabled ? getCustomization("draft") : getCustomization("published");
}
```

Note: the existing `get-customization.test.ts` mocks `@core/db/client` directly; it now also needs `@core/studio/repo` behavior. Since `getCustomization` now imports the repo dynamically inside `readSafe`, and the test mocks `@core/db/client` (which repo imports), the existing fallback test should still pass (repo.readDoc throws/returns null → fallback). Run the tests; if the published-path test needs `unstable_cache` to not interfere, note that `unstable_cache` runs the fn directly in the test environment. If a test breaks, update the mock to also satisfy repo's `.get()` chain (return `{ get: () => undefined }`), keeping the assertions.

- [ ] **Step 2: Point the layout at `getActiveCustomization`** — in `src/app/layout.tsx`, change the import + call:

Change `import { getCustomization } from "@core/studio/get-customization";` to:
```ts
import { getActiveCustomization } from "@core/studio/get-customization";
```
And change `const doc = await getCustomization("published");` to:
```ts
const doc = await getActiveCustomization();
```
Leave everything else (themeToCssVars, Slot, fonts, metadata) unchanged.

- [ ] **Step 3: Gates (build must stay green)**

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:client-alias
```
Expected: all exit 0. Note in the build output whether `/` is `○ (Static)` or `ƒ (Dynamic)` — calling `draftMode()` in the layout may opt the route into dynamic rendering. EITHER outcome is acceptable for 0b (a Phase-7 perf item if dynamic); the gate is that the build SUCCEEDS and `verify:client-alias` still prints OK. If the build FAILS (not just dynamic), report the error.

- [ ] **Step 4: Commit**

```powershell
git add src/core/studio/get-customization.ts src/app/layout.tsx
git commit -m "feat(studio): cache published reads, getActiveCustomization via Draft Mode"
```

---

### Task 3: Admin-gated server actions (save/publish/preview) + publish→revalidate verification

**Files:**
- Create: `src/core/studio/actions.ts`

- [ ] **Step 1: Implement `src/core/studio/actions.ts`** (server actions; all admin-gated)

```ts
"use server";

import { draftMode } from "next/headers";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@core/auth/current-admin";
import { getCustomization } from "@core/studio/get-customization";
import { customizationSchema, type CustomizationDoc } from "@core/studio/schema";

async function requireAdmin(): Promise<void> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    throw new Error("Unauthorized");
  }
}

/** The current draft, initialized from published/default if absent. */
export async function getDraft(): Promise<CustomizationDoc> {
  await requireAdmin();
  const { readDoc } = await import("@core/studio/repo");
  return readDoc("draft") ?? (await getCustomization("published"));
}

/** Validate + persist the draft. */
export async function saveDraft(
  doc: CustomizationDoc,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = customizationSchema.safeParse(doc);
  if (!parsed.success) {
    return { ok: false, error: "Invalid customization document." };
  }
  const { writeDraft } = await import("@core/studio/repo");
  writeDraft(parsed.data);
  return { ok: true };
}

/** Promote the draft to published and revalidate the live storefront. */
export async function publishDraft(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  await requireAdmin();
  const { promoteDraftToPublished } = await import("@core/studio/repo");
  const result = promoteDraftToPublished();
  if (result.ok) {
    revalidateTag("customization");
  }
  return result;
}

/** Enable Next Draft Mode so the admin sees the draft on the storefront. */
export async function enablePreview(): Promise<void> {
  await requireAdmin();
  (await draftMode()).enable();
  redirect("/?studio=preview");
}

/** Disable Draft Mode and return to the admin. */
export async function disablePreview(): Promise<void> {
  await requireAdmin();
  (await draftMode()).disable();
  redirect("/admin");
}
```

- [ ] **Step 2: Gates**

```powershell
npm run lint
npm run typecheck
npm run build
```
Expected: exit 0. (Server actions compile; the `"use server"` module exports only async functions.)

- [ ] **Step 3: Runtime verification — the publish→revalidate→live-read pipeline (scripted, no UI)**

This proves the core 0b value without the customizer UI. Use a temp tsx script that exercises the repo + cache directly. Create `wp-env/_studio_check.mjs` (NOT under src; .mjs so it's standalone) is awkward because repo is server-only + TS. Instead, verify at the DB + HTTP level:

```powershell
# 1) Write a draft directly into the DB (simulating saveDraft), with a non-default header.
node -e "const Database=require('better-sqlite3');const db=new Database('.data/studio.db');const {randomUUID}=require('node:crypto');const doc=JSON.stringify({theme:{colorScheme:'default',primary:'oklch(0.6 0.2 20)',secondary:'oklch(0.7 0.05 260)',accent:'oklch(0.65 0.15 30)',background:'oklch(1 0 0)',foreground:'oklch(0.2 0 0)',fontHeading:'Geist',fontBody:'Geist',radius:'0.5rem',spacingScale:1},slots:{header:{variant:'header.bold-cta',enabled:true,options:{sticky:true,ctaText:'Publish Test'}}}});db.prepare('DELETE FROM customization').run();db.prepare('INSERT INTO customization (id,store_key,status,document,version,updated_at) VALUES (?,?,?,?,?,?)').run(randomUUID(),'_default','published',doc,1,Date.now());console.log('seeded published with bold-cta');"

# 2) Start dev, confirm the LIVE (published) storefront now renders the bold-cta header (CTA text "Publish Test").
$dev = Start-Job { Set-Location "E:\Ecommerce Platform"; npm run dev }
Start-Sleep -Seconds 16
try {
  $html = (Invoke-WebRequest "http://localhost:3000" -UseBasicParsing -TimeoutSec 30).Content
  Write-Host "published header is bold-cta (CTA 'Publish Test' present): $($html -match 'Publish Test')"
  Write-Host "store name still present: $($html -match 'Default Storefront')"
} finally {
  Stop-Job $dev -ErrorAction SilentlyContinue; Remove-Job $dev -ErrorAction SilentlyContinue
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
```
Expected: the live storefront renders the `bold-cta` header with CTA text "Publish Test" — proving `getActiveCustomization` reads the published row through the repo (the `.get()` fix + cache). This confirms the read side of the pipeline end-to-end. (The write/publish actions are admin-gated and exercised fully by the 0b-iii customizer; the DB-level seed here stands in for `saveDraft`+`publishDraft`.)

After: kill all node (the `finally` does). Then reset the DB to a clean state so 0b-iii starts fresh:
```powershell
node -e "const Database=require('better-sqlite3');const db=new Database('.data/studio.db');db.prepare('DELETE FROM customization').run();console.log('cleared customization rows');"
```

- [ ] **Step 4: Commit**

```powershell
git add src/core/studio/actions.ts
git commit -m "feat(studio): admin-gated save/publish/preview server actions"
```

---

## Studio-0b-ii Definition of Done

- `repo.ts` read/writeDraft/promote unit-tested (round-trip + promote + null).
- `getCustomization('published')` is cached with tag `['customization']`; `publishDraft()` calls `revalidateTag('customization')`.
- `getActiveCustomization()` returns draft under Draft Mode (admin), published otherwise.
- Server actions `getDraft`/`saveDraft`/`publishDraft`/`enablePreview`/`disablePreview` exist and are admin-gated (`requireAdmin` throws for anonymous).
- Verified: seeding a published doc → the live storefront renders it (read pipeline through repo + cache works end-to-end).
- All gates green; build succeeds (whether `/` is static or dynamic).

## Carried to Studio-0b-iii (customizer UI)

- Build `registry-meta.ts` (serializable `{slot,id,name,thumbnail,optionFields}` from the registry — no components/zod cross to client) + `introspect.ts` (zod v4 optionsSchema → field descriptors).
- The two-pane `/admin` customizer: header variant gallery + color pickers + auto-generated options form (left), live-preview `<iframe>` of the storefront with Draft Mode enabled (right), Save (calls `saveDraft`, debounced) + Publish (`publishDraft`) + Preview toggle (`enablePreview`/`disablePreview`).
- The preview iframe relies on Draft Mode: the customizer enables preview, the iframe (same session+draft cookie) renders the draft via `getActiveCustomization`. Confirm the iframe reloads (debounced) after each `saveDraft`.
- Expose ONLY colors + header variant + header options (font/spacing tokens not emitted by `themeToCssVars` yet — omit those controls).
