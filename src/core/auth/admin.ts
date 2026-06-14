import "server-only";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

export type AdminIdentity = { id: string; email: string };

/** Verify an admin email+password against the DB. Returns identity or null. */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AdminIdentity | null> {
  try {
    const { db, schema } = await import("@core/db/client");
    const rows = db
      .select()
      .from(schema.adminUsers)
      .where(eq(schema.adminUsers.email, email.toLowerCase()))
      .limit(1);
    const user = Array.isArray(rows) ? rows[0] : undefined;
    if (!user) {
      return null;
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? { id: user.id, email: user.email } : null;
  } catch (err) {
    console.error("verifyCredentials error:", err);
    return null;
  }
}
