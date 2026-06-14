import { registry } from "@core/studio/registry";
import { introspectOptions, type FieldDescriptor } from "@core/studio/introspect";
import type { SlotName } from "@core/studio/types";

export type VariantMeta = {
  slot: SlotName;
  id: string;
  name: string;
  thumbnail: string;
  optionFields: FieldDescriptor[];
};

/** Serializable descriptors for every registered variant (safe to send to the client). */
export function registryMeta(): Record<string, VariantMeta[]> {
  const out: Record<string, VariantMeta[]> = {};
  for (const [slot, variants] of Object.entries(registry)) {
    out[slot] = Object.values(variants ?? {}).map((def) => ({
      slot: slot as SlotName,
      id: def.id,
      name: def.name,
      thumbnail: def.thumbnail,
      optionFields: introspectOptions(def.optionsSchema),
    }));
  }
  return out;
}
