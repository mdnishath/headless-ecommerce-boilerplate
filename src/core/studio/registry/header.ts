import type { ComponentType } from "react";
import { z } from "zod";
import type { VariantDef, VariantProps } from "@core/studio/types";
import { ClassicCentered } from "@/components/studio/header/classic-centered";
import { MinimalLeft } from "@/components/studio/header/minimal-left";
import { BoldCta } from "@/components/studio/header/bold-cta";

// Variant components type their own option props (e.g. ClassicCenteredOptions),
// but the registry stores them under the erased VariantProps the resolver hands
// in (a runtime-validated Record). The component reads only its known keys from
// that record, so widening the prop type here is sound. zod erases the options
// type at `optionsSchema: ZodType`, so this matches the registry's contract.
type VariantComponent = ComponentType<VariantProps>;

// Each schema carries a top-level `.prefault({})` so `safeParse(undefined)`
// succeeds AND runs `{}` through the object (applying every field default).
// zod v4 treats a bare `z.object` as required (parsing `undefined` errors), and
// `.default({})` would short-circuit to `{}` without filling field defaults and
// is not type-accepted (its arg is the output type); `.prefault({})` is the
// correct v4 form for "default to empty input, then apply field defaults".
const classicCenteredOptions = z
  .object({
    sticky: z.boolean().default(true),
    showSearch: z.boolean().default(true),
  })
  .prefault({});

const minimalLeftOptions = z
  .object({
    sticky: z.boolean().default(false),
    showSearch: z.boolean().default(true),
  })
  .prefault({});

const boldCtaOptions = z
  .object({
    sticky: z.boolean().default(true),
    ctaText: z.string().default("Shop now"),
  })
  .prefault({});

export const headerVariants: Record<string, VariantDef> = {
  "classic-centered": {
    id: "header.classic-centered",
    name: "Classic — Centered",
    thumbnail: "/studio/header/classic-centered.svg",
    optionsSchema: classicCenteredOptions,
    Component: ClassicCentered as VariantComponent,
  },
  "minimal-left": {
    id: "header.minimal-left",
    name: "Minimal — Left",
    thumbnail: "/studio/header/minimal-left.svg",
    optionsSchema: minimalLeftOptions,
    Component: MinimalLeft as VariantComponent,
  },
  "bold-cta": {
    id: "header.bold-cta",
    name: "Bold — CTA",
    thumbnail: "/studio/header/bold-cta.svg",
    optionsSchema: boldCtaOptions,
    Component: BoldCta as VariantComponent,
  },
};
