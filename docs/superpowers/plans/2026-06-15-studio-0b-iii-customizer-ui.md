# Studio-0b-iii: The Customizer UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The visible payoff — a two-pane `/admin` customizer where the admin picks a header design from a gallery, edits global colors + the variant's options, sees a **live preview**, and **Publishes** to the live storefront. Completes the Studio-0 vision.

**Architecture:** A serializable `registryMeta()` (server) crosses the registry's variant descriptors + zod-introspected option fields to the client (the registry's React components + zod schemas stay server-side). The customizer client component holds the draft document in state, debounce-autosaves via the `saveDraft` server action, and shows a live-preview `<iframe>` of the storefront in Next Draft Mode (so it renders the draft). Publish calls `publishDraft` (→ `revalidateTag('customization')`).

**Tech Stack:** Next 15 server components + server actions + Draft Mode, React 19 client component (useState/useTransition/debounce), shadcn/ui primitives, zod v4 introspection (via parsed defaults — robust, no internals).

**This is the final sub-plan of Studio-0b** (prior: 0b-i auth, 0b-ii persistence). After 0b-iii: log in → pick header design + colors → preview → Publish → live storefront updates. Studio-0 done.

**Preconditions:** Studio-0a + 0b-i + 0b-ii done. Available: `@core/studio/registry` (registry, types), `@core/studio/schema` (CustomizationDoc, getDefaultDoc), `@core/studio/actions` (getDraft/saveDraft/publishDraft/enablePreview/disablePreview), `@core/auth/current-admin`. Middleware guards `/admin`. Customization table empty. Gates: lint/typecheck/test/build/verify:client-alias. NO dev server during build steps; kill node after any dev verification.

---

### Task 1: registry-meta + zod introspection (serializable descriptors)

**Files:**
- Create: `src/core/studio/introspect.ts`, `src/core/studio/registry-meta.ts`
- Test: `src/core/studio/introspect.test.ts`, `src/core/studio/registry-meta.test.ts`

- [ ] **Step 1: Write failing test** — `src/core/studio/introspect.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { introspectOptions } from "@core/studio/introspect";

describe("introspectOptions", () => {
  it("maps option defaults to form-field descriptors by value type", () => {
    const schema = z
      .object({
        sticky: z.boolean().default(true),
        ctaText: z.string().default("Shop"),
        cols: z.number().default(3),
      })
      .prefault({});
    const fields = introspectOptions(schema);
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.sticky).toEqual({ name: "sticky", control: "switch", default: true });
    expect(byName.ctaText).toEqual({ name: "ctaText", control: "text", default: "Shop" });
    expect(byName.cols).toEqual({ name: "cols", control: "number", default: 3 });
  });

  it("returns [] for a schema with no fields", () => {
    expect(introspectOptions(z.object({}).prefault({}))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**, then implement `src/core/studio/introspect.ts`

```ts
import type { ZodType } from "zod";

export type FieldControl = "switch" | "text" | "number";

export type FieldDescriptor = {
  name: string;
  control: FieldControl;
  default: unknown;
};

/**
 * Derive form-field descriptors from a variant's options schema by parsing its
 * defaults and inferring the control from each default's runtime type. This
 * avoids fragile zod-internal introspection. (Enum→select is added later when a
 * variant first needs it; today's header variants are boolean/string/number.)
 */
export function introspectOptions(optionsSchema: ZodType): FieldDescriptor[] {
  const defaults = optionsSchema.parse(undefined) as Record<string, unknown>;
  return Object.entries(defaults).map(([name, value]) => ({
    name,
    control:
      typeof value === "boolean"
        ? "switch"
        : typeof value === "number"
          ? "number"
          : "text",
    default: value,
  }));
}
```

- [ ] **Step 3: Run — expect PASS** (`npm test`)

- [ ] **Step 4: Write failing test** — `src/core/studio/registry-meta.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { registryMeta } from "@core/studio/registry-meta";

describe("registryMeta", () => {
  it("derives serializable header variant descriptors", () => {
    const meta = registryMeta();
    expect(meta.header.length).toBe(3);
    const classic = meta.header.find((v) => v.id === "header.classic-centered");
    expect(classic?.name).toBe("Classic — Centered");
    expect(classic?.thumbnail).toBe("/studio/header/classic-centered.svg");
    // option fields are plain serializable descriptors
    const sticky = classic?.optionFields.find((f) => f.name === "sticky");
    expect(sticky?.control).toBe("switch");
    // no functions / zod objects leaked (JSON round-trips cleanly)
    expect(() => JSON.parse(JSON.stringify(meta))).not.toThrow();
  });
});
```

- [ ] **Step 5: Run — expect FAIL**, then implement `src/core/studio/registry-meta.ts`

```ts
import { registry } from "@core/studio/registry";
import { introspectOptions, type FieldDescriptor } from "@core/studio/introspect";
import type { SlotName } from "@core/studio/types";

export type VariantMeta = {
  slot: SlotName;
  id: string;
  name: string;
  thumbnail: string;
  optionFields: FieldDescriptor[];
};

/** Serializable descriptors for every registered variant (safe to send to the client). */
export function registryMeta(): Record<string, VariantMeta[]> {
  const out: Record<string, VariantMeta[]> = {};
  for (const [slot, variants] of Object.entries(registry)) {
    out[slot] = Object.values(variants ?? {}).map((def) => ({
      slot: slot as SlotName,
      id: def.id,
      name: def.name,
      thumbnail: def.thumbnail,
      optionFields: introspectOptions(def.optionsSchema),
    }));
  }
  return out;
}
```

- [ ] **Step 6: Run — expect PASS**, gates, commit

```powershell
npm test
npm run typecheck
npm run lint
git add src/core/studio/introspect.ts src/core/studio/introspect.test.ts src/core/studio/registry-meta.ts src/core/studio/registry-meta.test.ts
git commit -m "feat(studio): serializable registry-meta + zod option introspection"
```
Expected: 29 tests pass (27 + 2).

---

### Task 2: The customizer UI (gallery + colors + options + live preview + publish)

**Files:**
- Create (shadcn): `src/components/ui/input.tsx`, `switch.tsx`, `label.tsx`, `card.tsx`
- Modify: `src/core/studio/actions.ts` (enablePreview without redirect)
- Create: `src/app/admin/page.tsx` (REPLACE the 0b-i stub with the customizer server page), `src/components/studio/customizer.tsx`

- [ ] **Step 1: Add shadcn primitives**

```powershell
npx shadcn@latest add input switch label card
```
Expected: the four files appear under `src/components/ui/`. If a prompt appears despite defaults, accept.

- [ ] **Step 2: Make `enablePreview` set Draft Mode WITHOUT redirecting** (the iframe needs the draft cookie, not a navigation). In `src/core/studio/actions.ts`, change `enablePreview`:

```ts
/** Enable Next Draft Mode so the preview iframe renders the draft. */
export async function enablePreview(): Promise<void> {
  await requireAdmin();
  (await draftMode()).enable();
}
```
(Remove the `redirect("/?studio=preview")` line. Keep `disablePreview` as-is or also drop its redirect — leave `disablePreview` redirecting to `/admin` is fine.)

- [ ] **Step 3: Create the customizer client component** — `src/components/studio/customizer.tsx`

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Card } from "@ui/card";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Switch } from "@ui/switch";
import { Button } from "@ui/button";
import type { CustomizationDoc } from "@core/studio/schema";
import type { VariantMeta } from "@core/studio/registry-meta";
import {
  enablePreview,
  publishDraft,
  saveDraft,
} from "@core/studio/actions";

const COLOR_FIELDS: Array<keyof CustomizationDoc["theme"]> = [
  "primary",
  "secondary",
  "accent",
  "background",
  "foreground",
];

export function Customizer({
  initialDoc,
  headerVariants,
}: {
  initialDoc: CustomizationDoc;
  headerVariants: VariantMeta[];
}) {
  const [doc, setDoc] = useState<CustomizationDoc>(initialDoc);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [previewKey, setPreviewKey] = useState(0);
  const [isPublishing, startPublish] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Enable Draft Mode once so the iframe renders the draft.
  useEffect(() => {
    void enablePreview();
  }, []);

  // Debounced autosave + iframe refresh whenever the doc changes.
  useEffect(() => {
    if (doc === initialDoc) {
      return;
    }
    setStatus("saving");
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(async () => {
      await saveDraft(doc);
      setStatus("saved");
      setPreviewKey((k) => k + 1); // reload the preview iframe
    }, 500);
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [doc, initialDoc]);

  const selectedHeaderId = doc.slots.header.variant;
  const selectedMeta = headerVariants.find((v) => v.id === selectedHeaderId);

  function selectHeader(id: string) {
    setDoc((d) => ({ ...d, slots: { ...d.slots, header: { ...d.slots.header, variant: id, options: {} } } }));
  }
  function setHeaderOption(name: string, value: unknown) {
    setDoc((d) => ({
      ...d,
      slots: { ...d.slots, header: { ...d.slots.header, options: { ...d.slots.header.options, [name]: value } } },
    }));
  }
  function setColor(field: keyof CustomizationDoc["theme"], value: string) {
    setDoc((d) => ({ ...d, theme: { ...d.theme, [field]: value } }));
  }

  return (
    <div className="grid h-screen grid-cols-[380px_1fr]">
      {/* Left: controls */}
      <aside className="flex flex-col overflow-y-auto border-r p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold">Studio</h1>
          <span className="text-xs text-muted-foreground">
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
          </span>
        </div>

        <Button
          onClick={() => startPublish(async () => { await publishDraft(); })}
          disabled={isPublishing}
          className="mb-6"
        >
          {isPublishing ? "Publishing…" : "Publish"}
        </Button>

        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">Header design</h2>
          <div className="grid grid-cols-2 gap-2">
            {headerVariants.map((v) => (
              <Card
                key={v.id}
                onClick={() => selectHeader(v.id)}
                className={`cursor-pointer overflow-hidden p-0 ${v.id === selectedHeaderId ? "ring-2 ring-primary" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.thumbnail} alt={v.name} className="h-16 w-full object-cover" />
                <div className="p-1.5 text-xs">{v.name}</div>
              </Card>
            ))}
          </div>
        </section>

        {selectedMeta ? (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold">Header options</h2>
            <div className="space-y-3">
              {selectedMeta.optionFields.map((f) => {
                const current = doc.slots.header.options[f.name] ?? f.default;
                if (f.control === "switch") {
                  return (
                    <div key={f.name} className="flex items-center justify-between">
                      <Label htmlFor={`opt-${f.name}`}>{f.name}</Label>
                      <Switch
                        id={`opt-${f.name}`}
                        checked={Boolean(current)}
                        onCheckedChange={(c) => setHeaderOption(f.name, c)}
                      />
                    </div>
                  );
                }
                return (
                  <div key={f.name}>
                    <Label htmlFor={`opt-${f.name}`}>{f.name}</Label>
                    <Input
                      id={`opt-${f.name}`}
                      type={f.control === "number" ? "number" : "text"}
                      value={String(current)}
                      onChange={(e) =>
                        setHeaderOption(
                          f.name,
                          f.control === "number" ? Number(e.target.value) : e.target.value,
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section>
          <h2 className="mb-2 text-sm font-semibold">Colors</h2>
          <div className="space-y-3">
            {COLOR_FIELDS.map((field) => (
              <div key={field}>
                <Label htmlFor={`color-${field}`}>{field}</Label>
                <Input
                  id={`color-${field}`}
                  value={String(doc.theme[field])}
                  onChange={(e) => setColor(field, e.target.value)}
                  placeholder="oklch(...) or #hex"
                />
              </div>
            ))}
          </div>
        </section>
      </aside>

      {/* Right: live preview */}
      <main className="bg-muted">
        <iframe
          key={previewKey}
          src="/"
          title="Live preview"
          className="h-full w-full border-0 bg-background"
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Replace `src/app/admin/page.tsx`** with the customizer server page (fetches draft + meta, gates via getCurrentAdmin)

```tsx
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@core/auth/current-admin";
import { getDraft } from "@core/studio/actions";
import { registryMeta } from "@core/studio/registry-meta";
import { Customizer } from "@/components/studio/customizer";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }
  const doc = await getDraft();
  const meta = registryMeta();
  return <Customizer initialDoc={doc} headerVariants={meta.header ?? []} />;
}
```

Note: middleware already guards `/admin`; the explicit `getCurrentAdmin` check is defense-in-depth and gives `getDraft` (which calls `requireAdmin`) a valid session.

- [ ] **Step 5: Gates**

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:client-alias
```
Expected: all exit 0. (The customizer is a client component; `@core/studio/registry-meta` is imported by the server page only and passes plain data to the client — confirm no `"use client"` file imports the registry or zod schemas. `@core/studio/actions` is a `"use server"` module, callable from the client component.) If lint flags the `<img>`, the inline `eslint-disable-next-line` handles it; if it flags something else, fix minimally.

- [ ] **Step 6: Runtime verification (scripted guard + DB write; full UI browser-confirmed)**

```powershell
npm run db:seed   # ensure admin exists
$dev = Start-Job { Set-Location "E:\Ecommerce Platform"; npm run dev }
Start-Sleep -Seconds 16
try {
  # Guard: anonymous /admin redirects to login (customizer is gated)
  try { $r = Invoke-WebRequest "http://localhost:3000/admin" -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 25 } catch { $r = $_.Exception.Response }
  Write-Host "anon /admin status: $($r.StatusCode) (expect 307 to /admin/login)"
  # The storefront still renders (preview iframe target)
  $home = (Invoke-WebRequest "http://localhost:3000/" -UseBasicParsing -TimeoutSec 25).Content
  Write-Host "storefront renders header: $($home -match '<header')"
} finally {
  Stop-Job $dev -ErrorAction SilentlyContinue; Remove-Job $dev -ErrorAction SilentlyContinue
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
```
Expected: anon `/admin` → 307 to `/admin/login`; storefront renders. **Full interactive confirmation is in a browser** (the customizer is a stateful client UI): log in at `/admin/login`, land on the customizer, click a different header design → the preview iframe updates within ~1s → click **Publish** → open `/` in a normal tab (or incognito) → the published header reflects the change. Document that this browser flow is the acceptance test; the script confirms the gate + storefront render.

- [ ] **Step 7: Commit**

```powershell
git add src/components/ui src/components/studio/customizer.tsx src/app/admin/page.tsx src/core/studio/actions.ts
git commit -m "feat(studio): admin customizer UI — header gallery, colors, options, live preview, publish"
```

---

## Studio-0b-iii Definition of Done

- `registryMeta()` produces JSON-serializable variant descriptors (incl. introspected option fields); unit-tested.
- `/admin` renders the two-pane customizer (header gallery + color inputs + options form + live-preview iframe + Publish), gated to admins.
- Changing a control debounce-saves the draft and reloads the preview; Publish promotes draft→published + revalidates.
- All gates green; build succeeds; `verify:client-alias` OK.
- Browser-confirmed acceptance: login → change header + color → preview updates → Publish → live storefront reflects it.

## Studio-0 COMPLETE after this

After 0b-iii, the full Studio-0 vision is delivered: a store owner customizes the header design + colors from `/admin` with live preview and publishes to the live storefront — no code, no leaving the app. The library scales next (Studio-1: 20 headers; Studio-2: footers; Studio-3+: hero/cards/grids/sliders/cart/checkout) by dropping variants into the registry — the customizer + schema + persistence are done.

## Known follow-ups (not blocking Studio-0)

- Color inputs are text (accept oklch/hex) — a visual color picker with oklch↔hex is a polish item.
- Font/spacing theme controls omitted (themeToCssVars doesn't emit them yet — wire in a later slice).
- Draft Mode is enabled on customizer mount and stays on for the admin's origin until `disablePreview`; add an explicit "Exit preview" affordance when convenient.
- Auth backlog from 0b-i (rate limiting, timing-oracle) still applies before public exposure.
