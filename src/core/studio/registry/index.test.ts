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
