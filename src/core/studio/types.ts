import type { ComponentType } from "react";
import type { ZodType } from "zod";
import type { CustomizationDoc } from "@core/studio/schema";

/** Customizable storefront regions. Studio-0a implements only `header`. */
export type SlotName =
  | "announcementBar"
  | "header"
  | "footer"
  | "hero"
  | "productCard"
  | "productGrid"
  | "productSlider"
  | "cartDrawer"
  | "checkoutLayout";

/** Props every variant component receives. */
export type VariantProps<TOptions = Record<string, unknown>> = {
  options: TOptions;
  doc: CustomizationDoc;
};

/** A single registered design variant for a slot. */
export type VariantDef = {
  id: string; // e.g. "header.classic-centered"
  name: string; // gallery display label
  thumbnail: string; // static asset path under /public
  optionsSchema: ZodType; // zod schema for this variant's options (with defaults)
  Component: ComponentType<VariantProps>;
};

/** slot -> variantId -> def */
export type Registry = Partial<Record<SlotName, Record<string, VariantDef>>>;
