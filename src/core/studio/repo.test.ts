import { describe, expect, it, vi, beforeEach } from "vitest";
import { getDefaultDoc } from "@core/studio/schema";

// In-memory fake of the drizzle better-sqlite3 surface repo.ts uses.
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
