import { z } from "zod";
import type { SlotName } from "@core/studio/types";
import { defaultVariantId, getVariant } from "@core/studio/registry";

export const themeSchema = z.object({
  colorScheme: z.string().default("default"),
  primary: z.string().default("oklch(0.55 0.2 260)"),
  secondary: z.string().default("oklch(0.7 0.05 260)"),
  accent: z.string().default("oklch(0.65 0.15 30)"),
  background: z.string().default("oklch(1 0 0)"),
  foreground: z.string().default("oklch(0.2 0 0)"),
  fontHeading: z.string().default("Geist"),
  fontBody: z.string().default("Geist"),
  radius: z.string().default("0.5rem"),
  spacingScale: z.number().default(1),
});

const slotSelection = z.object({
  variant: z.string(),
  enabled: z.boolean().default(true),
  options: z.record(z.string(), z.unknown()).default({}),
});

export const customizationSchema = z.object({
  // `.prefault({})` defaults a missing `theme` to `{}` and then runs it through
  // themeSchema so every token default is applied. zod v4's `.default({})` would
  // require the full theme output type as its argument (a type error here).
  theme: themeSchema.prefault({}),
  slots: z.object({
    header: slotSelection,
  }),
});

export type CustomizationDoc = z.infer<typeof customizationSchema>;

/** Validate a slot's options against the SELECTED variant's own schema.
 *  Unknown variant -> {} (resolver will fall back to the default variant). */
export function validateSlot(
  slot: SlotName,
  variantId: string,
  options: unknown,
): Record<string, unknown> {
  const variant = getVariant(slot, variantId.replace(`${slot}.`, ""));
  if (!variant) {
    return {};
  }
  const parsed = variant.optionsSchema.safeParse(options ?? {});
  return parsed.success
    ? (parsed.data as Record<string, unknown>)
    : (variant.optionsSchema.parse(undefined) as Record<string, unknown>);
}

/** Build a valid default document from registry defaults. */
export function getDefaultDoc(): CustomizationDoc {
  const headerId = defaultVariantId("header") ?? "classic-centered";
  const headerVariant = `header.${headerId}`;
  return {
    theme: themeSchema.parse({}),
    slots: {
      header: {
        variant: headerVariant,
        enabled: true,
        options: validateSlot("header", headerVariant, {}),
      },
    },
  };
}
