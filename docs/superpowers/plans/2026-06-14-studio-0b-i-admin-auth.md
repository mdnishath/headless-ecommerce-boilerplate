# Studio-0b-i: Admin Authentication

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Gate the Studio admin behind a real login — seed one admin from env, verify credentials (bcryptjs), issue a signed JWT session cookie (jose), guard `/admin/**` with middleware, and prove it end-to-end with a stub authenticated `/admin` page and logout.

**Architecture:** Pure-JS crypto (bcryptjs for password hashing, jose for the HS256 session JWT) so nothing needs native builds and the middleware stays edge-compatible (it only verifies the JWT — no DB, no bcrypt). The seed script opens its own SQLite connection (avoids the `server-only` import in `db/client.ts`). Auth helpers live in `src/core/auth/`; the login page + server actions live in `src/app/admin/`.

**Tech Stack:** jose (JWT), bcryptjs (hash), Drizzle + better-sqlite3 (existing), Next 15 middleware + server actions, tsx (seed runner).

**This is sub-plan 0b-i of Studio-0b** (next: 0b-ii persistence/caching/preview, 0b-iii customizer UI). After 0b-i: an admin can log in, reach a stub `/admin`, and log out; anonymous `/admin` redirects to login.

**Preconditions:** Studio-0a done (DB at `.data/studio.db` with `admin_users` + `customization` tables; `@core/db/*`). `.env.local` has `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET` (Studio-0a Task 1 added them). Gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run verify:client-alias`. NO dev server running during build steps.

---

### Task 1: Session helper (jose JWT) + credential verify (bcryptjs) + seed

**Files:**
- Create: `src/core/auth/session.ts`, `src/core/auth/admin.ts`, `src/core/db/seed.ts`
- Modify: `package.json` (deps + `db:seed` script)
- Test: `src/core/auth/session.test.ts`

- [ ] **Step 1: Install deps**

```powershell
npm install jose bcryptjs
npm install -D @types/bcryptjs tsx
```

- [ ] **Step 2: Write failing test** — `src/core/auth/session.test.ts`

```ts
import { describe, expect, it, beforeAll } from "vitest";
import { createSessionToken, verifySessionToken } from "@core/auth/session";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-at-least-32-characters-long-xx";
});

describe("session token", () => {
  it("round-trips a valid payload", async () => {
    const token = await createSessionToken({ sub: "admin-1", email: "a@b.c" });
    const payload = await verifySessionToken(token);
    expect(payload?.sub).toBe("admin-1");
    expect(payload?.email).toBe("a@b.c");
  });

  it("rejects a tampered token", async () => {
    const token = await createSessionToken({ sub: "admin-1", email: "a@b.c" });
    expect(await verifySessionToken(token + "x")).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (`@core/auth/session` missing)

```powershell
npm test
```

- [ ] **Step 4: Implement `src/core/auth/session.ts`** (edge-safe: jose only, no DB, no node:crypto)

```ts
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const SESSION_COOKIE = "studio_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days (seconds)

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = JWTPayload & { sub: string; email: string };

/** Sign a session JWT (HS256, 7-day expiry). */
export async function createSessionToken(payload: {
  sub: string;
  email: string;
}): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

/** Verify a session JWT, or null if invalid/expired. */
export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run — expect PASS**

```powershell
npm test
```
Expected: the 3 session tests pass.

- [ ] **Step 6: Implement `src/core/auth/admin.ts`** (credential verify; server-only, Node runtime)

```ts
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
```

- [ ] **Step 7: Implement `src/core/db/seed.ts`** (standalone — own DB connection, no `server-only`)

```ts
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
    .limit(1)[0];

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
```

- [ ] **Step 8: Add the `db:seed` script to `package.json`**

```json
"db:seed": "tsx src/core/db/seed.ts"
```

- [ ] **Step 9: Run the seed + verify the admin exists**

```powershell
npm run db:seed
```
Expected: prints `Created admin: <ADMIN_EMAIL>` (or `Updated admin:` on re-run — it's idempotent).

```powershell
node -e "const Database=require('better-sqlite3'); const db=new Database('.data/studio.db'); const r=db.prepare('SELECT email,role FROM admin_users').all(); console.log(JSON.stringify(r));"
```
Expected: one row with your `ADMIN_EMAIL` and role `admin`.

- [ ] **Step 10: Gates + commit**

```powershell
npm run typecheck
npm run lint
npm test
git add src/core/auth src/core/db/seed.ts package.json package-lock.json
git commit -m "feat(studio): admin session JWT, credential verify, db:seed admin"
```
Expected: typecheck/lint exit 0; session tests pass. Confirm the admin password hash is NOT logged or committed (only the seed source is committed; the DB is gitignored).

---

### Task 2: Login page + login/logout server actions

**Files:**
- Create: `src/app/admin/actions.ts`, `src/app/admin/login/page.tsx`, `src/core/auth/current-admin.ts`

- [ ] **Step 1: `src/core/auth/current-admin.ts`** — read the session from the cookie (server-side)

```ts
import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from "@core/auth/session";

/** The signed-in admin from the session cookie, or null. */
export async function getCurrentAdmin(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  return verifySessionToken(token);
}
```

- [ ] **Step 2: `src/app/admin/actions.ts`** — login + logout server actions

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyCredentials } from "@core/auth/admin";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
} from "@core/auth/session";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const admin = await verifyCredentials(email, password);
  if (!admin) {
    return { error: "Invalid email or password." };
  }

  const token = await createSessionToken({ sub: admin.id, email: admin.email });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/admin/login");
}
```

- [ ] **Step 3: `src/app/admin/login/page.tsx`** — login form (client component using useActionState)

```tsx
"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/admin/actions";

const initial: LoginState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-6 text-2xl font-bold">Studio admin</h1>
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-md border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full rounded-md border px-3 py-2"
          />
        </div>
        {state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
```

Note: `src/app/admin/login/page.tsx` imports `@/app/admin/actions`. ESLint's client-boundary rule forbids `src/clients/**` from importing app routes, not `src/app/**` importing itself — so this is fine.

- [ ] **Step 4: Verify typecheck + lint**

```powershell
npm run typecheck
npm run lint
```
Expected: exit 0. (Runtime login is verified in Task 3 once the middleware + stub page exist.)

- [ ] **Step 5: Commit**

```powershell
git add src/app/admin src/core/auth/current-admin.ts
git commit -m "feat(studio): admin login page + login/logout server actions"
```

---

### Task 3: Middleware guard + stub authenticated /admin page

**Files:**
- Create: `src/middleware.ts` (or `middleware.ts` at repo root — see Step 1), `src/app/admin/page.tsx`

- [ ] **Step 1: Determine middleware location**

Next.js reads `middleware.ts` from the project root OR `src/middleware.ts` (since this app uses `src/`). Check for an existing one:
```powershell
Test-Path middleware.ts; Test-Path src\middleware.ts
```
If neither exists, create `src/middleware.ts`. If one exists, MODIFY it (preserve existing logic, add the admin guard).

- [ ] **Step 2: Create `src/middleware.ts`** (edge-safe — jose verify only, no DB/bcrypt)

```ts
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@core/auth/session";

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Only guard /admin, but never the login page itself.
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await verifySessionToken(token) : null;
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

Note: the middleware imports `@core/auth/session`, which imports `jose` only (no `server-only`, no DB, no bcrypt) — so it runs on the edge runtime cleanly. Confirm `src/core/auth/session.ts` has NO `import "server-only"` and no DB import (it shouldn't, per Task 1).

- [ ] **Step 3: Create the stub authed page** — `src/app/admin/page.tsx`

```tsx
import { getCurrentAdmin } from "@core/auth/current-admin";
import { logoutAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const admin = await getCurrentAdmin();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Studio</h1>
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-muted-foreground hover:underline">
            Sign out
          </button>
        </form>
      </div>
      <p className="mt-4 text-muted-foreground">
        Signed in as {admin?.email}. The customizer UI lands in Studio-0b-iii.
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Gates (build must stay green)**

```powershell
npm run lint
npm run typecheck
npm run build
npm run verify:client-alias
```
Expected: all exit 0. The middleware compiles for edge; `/admin` is dynamic. The alias probe still passes (it renders `/`, untouched by admin).

- [ ] **Step 5: Verify the auth flow end-to-end in dev**

```powershell
npm run db:seed   # ensure the admin exists
$dev = Start-Job { Set-Location "E:\Ecommerce Platform"; npm run dev }
Start-Sleep -Seconds 15
try {
  # 1) Unauthenticated /admin redirects to /admin/login
  $r = Invoke-WebRequest "http://localhost:3000/admin" -UseBasicParsing -MaximumRedirection 0 -SkipHttpErrorCheck -TimeoutSec 25
  Write-Host "unauth /admin status: $($r.StatusCode) (expect 307/308 redirect)"
  Write-Host "redirect location: $($r.Headers.Location)"

  # 2) Login page renders
  $login = (Invoke-WebRequest "http://localhost:3000/admin/login" -UseBasicParsing -TimeoutSec 25).Content
  Write-Host "login form present: $($login -match 'Sign in')"

  # 3) Login via the server action, capture the session cookie, hit /admin
  $body = "email=$([uri]::EscapeDataString($env:ADMIN_EMAIL))&password=$([uri]::EscapeDataString($env:ADMIN_PASSWORD))"
  # Server actions are POSTed to the page with a Next-Action header — easier to verify the cookie path manually in a browser.
  Write-Host "NOTE: full server-action login is simplest to confirm in a browser: open http://localhost:3000/admin/login, sign in, land on /admin showing your email."
} finally {
  Stop-Job $dev -ErrorAction SilentlyContinue; Remove-Job $dev -ErrorAction SilentlyContinue
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
```
Expected: unauthenticated `/admin` returns a 307/308 redirect to `/admin/login`; the login page renders the form. (Server-action login sets the cookie; confirm the full login→/admin→logout loop in a browser — the automated check covers the guard + form render, which is the security-critical part.)

After this step, ensure NO leftover `node` processes (the `finally` kills them — concurrent dev+build corrupts `.next`).

- [ ] **Step 6: Commit**

```powershell
git add src/middleware.ts src/app/admin/page.tsx
git commit -m "feat(studio): middleware guard for /admin + stub authenticated admin page"
```

---

## Studio-0b-i Definition of Done

- `npm run db:seed` creates/updates the admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (idempotent).
- Session JWT round-trips + rejects tampered/garbage tokens (tested).
- Anonymous `GET /admin` → 307 redirect to `/admin/login`; `/admin/login` is public and renders the form.
- After login (browser-confirmed), `/admin` shows the signed-in email; Sign out clears the session and returns to login.
- `npm run lint && npm run typecheck && npm test && npm run build && npm run verify:client-alias` all green.
- Middleware is edge-safe (jose only — no DB/bcrypt/server-only import).

## Security review findings (0b-i passed — no critical vulnerabilities)

- **Fixed (I-1):** `verifySessionToken` now pins `algorithms: ["HS256"]` in `jwtVerify` (jose otherwise accepts any HMAC variant the key supports — defense-in-depth).
- **Verified clear:** cookie flags (httpOnly/secure-in-prod/sameSite=lax/path/maxAge), Server-Action CSRF protection, lazy `secretKey()` (build-safe with no SESSION_SECRET — CI), generic login error (no user enumeration via message), `server-only` boundaries, JWT tamper/expiry/alg=none rejection, no middleware path-bypass, no password/hash in logs.
- **Backlog (acceptable for v1 single-admin; track before public/multi-tenant):**
  - **Rate limiting / lockout** on login — none today; bcrypt(10) is the only brute-force barrier. Add before any public exposure (couples with the Phase-7 edge rate-limit work).
  - **Timing oracle:** `verifyCredentials` skips bcrypt on unknown-user (faster response = enumeration signal). Close later with a dummy `bcrypt.compare` on the no-user path.
  - **Prod-secret guard:** no runtime assertion that `SESSION_SECRET`/`ADMIN_PASSWORD` aren't the `.env.example` placeholder values — add a prod startup check.
  - **jose Edge build warnings** (JWE/DecompressionStream path we never execute) — cosmetic; optionally import jose subpaths to silence.

## Carried to Studio-0b-ii / 0b-iii

- **0b-ii (persistence + caching + preview):** `getDraft`/`saveDraft`/`publishDraft` server actions (admin-session-gated via `getCurrentAdmin`); wrap `getCustomization('published')` in `unstable_cache(..., { tags: ['customization'] })`; `getActiveCustomization()` = draft when an admin session/preview cookie is present, else published; wire the storefront layout/home to `getActiveCustomization`. Honor: keep the draft path uncached; anonymous `?preview=1` ignored (requires a valid admin session).
- **0b-iii (customizer UI):** `registry-meta.ts` (serializable `{slot,id,name,thumbnail,optionFields}` derived from the registry — components/zod schemas stay server-side) + `introspect.ts` (zod v4 optionsSchema → form-field descriptors, handling `.prefault`/`.default`/`z.enum`) + unit tests; the two-pane `/admin` customizer (header variant gallery + color pickers + auto-generated options form) + live-preview iframe (`/?preview=1`, debounced reload) + Save/Publish wiring. Per 0a carry-forward: expose ONLY colors + header variant + header options now; omit font/spacing controls (themeToCssVars doesn't emit them yet).
