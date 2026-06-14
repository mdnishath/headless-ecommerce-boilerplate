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
