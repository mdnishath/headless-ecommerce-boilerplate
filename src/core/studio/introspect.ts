import type { ZodType } from "zod";

export type FieldControl = "switch" | "text" | "number";

export type FieldDescriptor = {
  name: string;
  control: FieldControl;
  default: unknown;
};

/**
 * Derive form-field descriptors from a variant's options schema by parsing its
 * defaults and inferring the control from each default's runtime type. This
 * avoids fragile zod-internal introspection. (Enum→select is added later when a
 * variant first needs it; today's header variants are boolean/string/number.)
 */
export function introspectOptions(optionsSchema: ZodType): FieldDescriptor[] {
  const defaults = optionsSchema.parse(undefined) as Record<string, unknown>;
  return Object.entries(defaults).map(([name, value]) => ({
    name,
    control:
      typeof value === "boolean"
        ? "switch"
        : typeof value === "number"
          ? "number"
          : "text",
    default: value,
  }));
}
