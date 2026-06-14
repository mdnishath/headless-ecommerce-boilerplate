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
