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
