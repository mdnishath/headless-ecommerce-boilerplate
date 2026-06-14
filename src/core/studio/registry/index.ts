import type { Registry, SlotName, VariantDef } from "@core/studio/types";
import { headerVariants } from "@core/studio/registry/header";

/** The core variant registry. Client forks merge additional variants later. */
export const registry: Registry = {
  header: headerVariants,
};

/** All variants for a slot, or {} if none. */
export function slotVariants(slot: SlotName): Record<string, VariantDef> {
  return registry[slot] ?? {};
}

/** First registered variant id for a slot (the default), or null. */
export function defaultVariantId(slot: SlotName): string | null {
  const ids = Object.keys(slotVariants(slot));
  return ids[0] ?? null;
}

/** Look up a variant def, or null. */
export function getVariant(slot: SlotName, id: string): VariantDef | null {
  return slotVariants(slot)[id] ?? null;
}
