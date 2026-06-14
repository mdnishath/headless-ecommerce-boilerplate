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
