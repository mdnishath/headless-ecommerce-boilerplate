import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Admin users for the Studio customizer (auth logic in Studio-0b). */
export const adminUsers = sqliteTable("admin_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/** Per-store customization documents: at most one draft + one published per storeKey. */
export const customization = sqliteTable(
  "customization",
  {
    id: text("id").primaryKey(),
    storeKey: text("store_key").notNull(),
    status: text("status", { enum: ["draft", "published"] }).notNull(),
    document: text("document").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    uniqStoreStatus: uniqueIndex("uniq_store_status").on(t.storeKey, t.status),
  }),
);
