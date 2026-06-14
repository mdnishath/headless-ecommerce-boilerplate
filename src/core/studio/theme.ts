import type { CustomizationDoc } from "@core/studio/schema";

type Theme = CustomizationDoc["theme"];

/** Map theme tokens to a React inline-style object of CSS custom properties. */
export function themeToCssVars(theme: Theme): Record<string, string> {
  return {
    "--primary": theme.primary,
    "--secondary": theme.secondary,
    "--accent": theme.accent,
    "--background": theme.background,
    "--foreground": theme.foreground,
    "--radius": theme.radius,
  };
}
