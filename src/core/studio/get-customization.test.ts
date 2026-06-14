import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultDoc } from "@core/studio/schema";

// `unstable_cache` requires a Next request scope (incrementalCache) that doesn't
// exist in vitest. Make it a passthrough so the cached published read runs the
// underlying fn directly; `revalidateTag` is a no-op here.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
}));

// A mutable holder the mock's `.get()` reads from, so each test can control
// what row the (mocked) Drizzle query returns. `vi.hoisted` runs before the
// `vi.mock` factory below, so the holder exists when the factory captures it.
const holder = vi.hoisted(() => ({
  // Drizzle's better-sqlite3 `.get()` returns the row or `undefined`.
  row: undefined as { document: string } | undefined,
}));

// The DB module is server-only + native; mock it so the unit test is hermetic.
// The chain mirrors the real call: select().from().where().limit(1).get().
// `.get()` (NOT an array via Array.isArray on a builder) is what executes the
// query — these tests fail if the code reverts to the builder bug.
vi.mock("@core/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => ({ get: () => holder.row }) }),
      }),
    }),
  },
  // drizzle's `eq`/`and` read the column operands before `where()` is called,
  // so the mocked schema must expose the referenced columns (any object is fine
  // — the mocked `where()` ignores the resulting condition).
  schema: {
    customization: { storeKey: {}, status: {} },
  },
}));

describe("getCustomization", () => {
  beforeEach(() => {
    holder.row = undefined;
  });

  it("falls back to the default document when no row exists", async () => {
    const { getCustomization } = await import("@core/studio/get-customization");
    const doc = await getCustomization("published");
    expect(doc.slots.header.variant).toBe("header.classic-centered");
  });

  it("reads and returns the saved customization row", async () => {
    // A valid doc with a NON-default header variant. If the read path is broken
    // (e.g. Array.isArray on a builder), this falls back to the default and the
    // assertion fails — pinning the bug this fix addresses.
    const saved = getDefaultDoc();
    saved.slots.header.variant = "header.minimal-left";
    holder.row = { document: JSON.stringify(saved) };

    const { getCustomization } = await import("@core/studio/get-customization");
    const doc = await getCustomization("published");
    expect(doc.slots.header.variant).toBe("header.minimal-left");
  });
});
