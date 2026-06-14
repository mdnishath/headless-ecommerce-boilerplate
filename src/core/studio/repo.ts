import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@core/db/client";
import {
  customizationSchema,
  type CustomizationDoc,
} from "@core/studio/schema";

const STORE_KEY = process.env.CLIENT ?? "_default";

type Status = "draft" | "published";

/** Read + validate a stored document for this store, or null. */
export function readDoc(status: Status): CustomizationDoc | null {
  const row = db
    .select()
    .from(schema.customization)
    .where(
      and(
        eq(schema.customization.storeKey, STORE_KEY),
        eq(schema.customization.status, status),
      ),
    )
    .limit(1)
    .get();
  if (!row) {
    return null;
  }
  const parsed = customizationSchema.safeParse(JSON.parse(row.document));
  return parsed.success ? parsed.data : null;
}

/** The raw stored version for a status (0 if none). */
function versionOf(status: Status): number {
  const row = db
    .select()
    .from(schema.customization)
    .where(
      and(
        eq(schema.customization.storeKey, STORE_KEY),
        eq(schema.customization.status, status),
      ),
    )
    .limit(1)
    .get();
  return row?.version ?? 0;
}

/** Upsert the draft row with a validated document. */
export function writeDraft(doc: CustomizationDoc): void {
  const parsed = customizationSchema.parse(doc); // throws on invalid
  const document = JSON.stringify(parsed);
  const exists = readDoc("draft") !== null || versionOf("draft") > 0;
  if (exists) {
    db.update(schema.customization)
      .set({ document, updatedAt: new Date() })
      .where(
        and(
          eq(schema.customization.storeKey, STORE_KEY),
          eq(schema.customization.status, "draft"),
        ),
      )
      .run();
  } else {
    db.insert(schema.customization)
      .values({
        id: randomUUID(),
        storeKey: STORE_KEY,
        status: "draft",
        document,
        version: 1,
        updatedAt: new Date(),
      })
      .run();
  }
}

/** Copy the draft into the published row, bumping the published version. */
export function promoteDraftToPublished():
  | { ok: true }
  | { ok: false; error: string } {
  const draft = readDoc("draft");
  if (!draft) {
    return { ok: false, error: "No draft to publish." };
  }
  const document = JSON.stringify(draft);
  const nextVersion = versionOf("published") + 1;
  const exists = versionOf("published") > 0;
  if (exists) {
    db.update(schema.customization)
      .set({ document, version: nextVersion, updatedAt: new Date() })
      .where(
        and(
          eq(schema.customization.storeKey, STORE_KEY),
          eq(schema.customization.status, "published"),
        ),
      )
      .run();
  } else {
    db.insert(schema.customization)
      .values({
        id: randomUUID(),
        storeKey: STORE_KEY,
        status: "published",
        document,
        version: nextVersion,
        updatedAt: new Date(),
      })
      .run();
  }
  return { ok: true };
}
