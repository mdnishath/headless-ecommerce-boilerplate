import "server-only";
import { and, eq } from "drizzle-orm";
import { customizationSchema, getDefaultDoc, type CustomizationDoc } from "@core/studio/schema";

const STORE_KEY = process.env.CLIENT ?? "_default";

/**
 * Read the active store's customization document.
 * - 'published' is the live document; 'draft' is the in-progress edit.
 * - Falls back to registry defaults if the DB is unreachable or the row is
 *   missing/invalid, so the storefront (and CI build with no DB) never breaks.
 */
export async function getCustomization(
  mode: "published" | "draft",
): Promise<CustomizationDoc> {
  try {
    const { db, schema } = await import("@core/db/client");
    const row = db
      .select()
      .from(schema.customization)
      .where(
        and(
          eq(schema.customization.storeKey, STORE_KEY),
          eq(schema.customization.status, mode),
        ),
      )
      .limit(1)
      .get();
    if (!row) {
      return getDefaultDoc();
    }
    const parsed = customizationSchema.safeParse(JSON.parse(row.document));
    return parsed.success ? parsed.data : getDefaultDoc();
  } catch (err) {
    console.error("getCustomization fell back to defaults:", err);
    return getDefaultDoc();
  }
}
