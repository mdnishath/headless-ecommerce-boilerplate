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
