import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "./schema";

// tsx does not auto-load .env.local (that's a Next-only behavior); load it
// explicitly so ADMIN_EMAIL/ADMIN_PASSWORD/DATABASE_URL are available here.
// process.loadEnvFile is available in Node 20.12+/22.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set (see .env.local)");
  }

  const url = process.env.DATABASE_URL ?? "file:.data/studio.db";
  const file = url.replace(/^file:/, "");
  mkdirSync(dirname(file), { recursive: true });
  const db = drizzle(new Database(file), { schema });

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = db
    .select()
    .from(schema.adminUsers)
    .where(eq(schema.adminUsers.email, email))
    .limit(1)
    .all()[0];

  if (existing) {
    db.update(schema.adminUsers)
      .set({ passwordHash })
      .where(eq(schema.adminUsers.id, existing.id))
      .run();
    console.log(`Updated admin: ${email}`);
  } else {
    db.insert(schema.adminUsers)
      .values({
        id: randomUUID(),
        email,
        passwordHash,
        role: "admin",
        createdAt: new Date(),
      })
      .run();
    console.log(`Created admin: ${email}`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
