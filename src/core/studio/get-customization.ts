import "server-only";
import { unstable_cache } from "next/cache";
import { draftMode } from "next/headers";
import { getDefaultDoc, type CustomizationDoc } from "@core/studio/schema";

/** Read a doc via the repo, tolerating any failure (DB down / missing). */
async function readSafe(status: "published" | "draft"): Promise<CustomizationDoc> {
  try {
    const { readDoc } = await import("@core/studio/repo");
    return readDoc(status) ?? getDefaultDoc();
  } catch (err) {
    console.error(`getCustomization(${status}) fell back to defaults:`, err);
    return getDefaultDoc();
  }
}

/** Cached published read — busted by revalidateTag('customization') on publish. */
const getPublishedCached = unstable_cache(
  () => readSafe("published"),
  ["studio-customization-published", process.env.CLIENT ?? "_default"],
  { tags: ["customization"] },
);

/** Read the active store document for a mode (draft is always uncached). */
export async function getCustomization(
  mode: "published" | "draft",
): Promise<CustomizationDoc> {
  return mode === "published" ? getPublishedCached() : readSafe("draft");
}

/**
 * The document the storefront should render:
 * - Draft Mode enabled (admin preview) -> the draft (uncached, fresh).
 * - Otherwise -> the cached published document (public, fast).
 */
export async function getActiveCustomization(): Promise<CustomizationDoc> {
  const { isEnabled } = await draftMode();
  return isEnabled ? getCustomization("draft") : getCustomization("published");
}
