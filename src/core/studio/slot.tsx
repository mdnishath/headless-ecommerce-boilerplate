import type { CustomizationDoc } from "@core/studio/schema";
import { validateSlot } from "@core/studio/schema";
import { defaultVariantId, getVariant } from "@core/studio/registry";
import type { SlotName } from "@core/studio/types";

/** Resolve a slot's selected variant from the document and render it.
 *  Unknown/missing variant -> the slot's default variant (logged). */
export function Slot({ name, doc }: { name: SlotName; doc: CustomizationDoc }) {
  const selection = name === "header" ? doc.slots.header : undefined;
  const requestedId = selection?.variant ?? "";
  const shortId = requestedId.replace(`${name}.`, "");

  let variant = getVariant(name, shortId);
  if (!variant) {
    const fallbackId = defaultVariantId(name);
    if (requestedId) {
      console.warn(`Slot "${name}": unknown variant "${requestedId}", using "${fallbackId}".`);
    }
    variant = fallbackId ? getVariant(name, fallbackId) : null;
  }
  if (!variant) {
    return null; // no variants registered for this slot
  }

  const variantShortId = variant.id.replace(`${name}.`, "");
  const options = validateSlot(name, `${name}.${variantShortId}`, selection?.options ?? {});
  const Component = variant.Component;
  return <Component options={options} doc={doc} />;
}
