"use server";

import { draftMode } from "next/headers";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@core/auth/current-admin";
import { getCustomization } from "@core/studio/get-customization";
import { customizationSchema, type CustomizationDoc } from "@core/studio/schema";

async function requireAdmin(): Promise<void> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    throw new Error("Unauthorized");
  }
}

/** The current draft, initialized from published/default if absent. */
export async function getDraft(): Promise<CustomizationDoc> {
  await requireAdmin();
  const { readDoc } = await import("@core/studio/repo");
  return readDoc("draft") ?? (await getCustomization("published"));
}

/** Validate + persist the draft. */
export async function saveDraft(
  doc: CustomizationDoc,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = customizationSchema.safeParse(doc);
  if (!parsed.success) {
    return { ok: false, error: "Invalid customization document." };
  }
  const { writeDraft } = await import("@core/studio/repo");
  writeDraft(parsed.data);
  return { ok: true };
}

/** Promote the draft to published and revalidate the live storefront. */
export async function publishDraft(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  await requireAdmin();
  const { promoteDraftToPublished } = await import("@core/studio/repo");
  const result = promoteDraftToPublished();
  if (result.ok) {
    revalidateTag("customization");
  }
  return result;
}

/** Enable Next Draft Mode so the admin sees the draft on the storefront. */
export async function enablePreview(): Promise<void> {
  await requireAdmin();
  (await draftMode()).enable();
  redirect("/?studio=preview");
}

/** Disable Draft Mode and return to the admin. */
export async function disablePreview(): Promise<void> {
  await requireAdmin();
  (await draftMode()).disable();
  redirect("/admin");
}
