# Phase 0: Foundation Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the boilerplate skeleton: Next.js 15 app with enforced core/client boundaries, zod-validated client config resolution, shadcn/ui theming via CSS variables, Vitest, CI, and a reproducible Dockerized WordPress backend with the headless GraphQL plugin stack.

**Architecture:** Single Next.js app with `@core/*` (engine) and `@client/*` (active client, resolved from the `CLIENT` env var via a webpack alias) import boundaries enforced by ESLint. `src/client.ts` is the only bridge: it imports the active client's config and validates it with the zod schema from core. WordPress runs in Docker (`wp-env/`) provisioned by a WP-CLI script; the custom `headless-bridge` plugin folder is bind-mounted so Phase 1 can develop it live.

**Tech Stack:** Next.js 15 (App Router, webpack dev — no Turbopack), React 19, TypeScript strict, Tailwind CSS, shadcn/ui, zod, Vitest + vite-tsconfig-paths, ESLint 9 (flat config), Docker Compose (WordPress 6.8 + MariaDB 11 + wp-cli), GitHub Actions.

**Platform notes:** Windows 11 + PowerShell. All shell commands below are PowerShell unless marked otherwise. Working directory is the repo root `E:\Ecommerce Platform` (path contains a space — keep quotes where shown). Work happens directly on `master` (fresh repo, no other collaborators).

---

### Task 1: Scaffold Next.js 15 app

**Files:**
- Create (generated): `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `src/app/*`, `.gitignore`, `README.md`
- Modify: `package.json` (add `typecheck` script)

- [ ] **Step 1: Run create-next-app in the repo root**

The existing `docs/` folder and `.git` are on create-next-app's allowlist, so in-place scaffolding works.

```powershell
npx create-next-app@15 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

Expected: scaffold completes, `package.json` exists with `next` `15.x`, `react` `19.x`. If it errors with "directory not empty", list the offending file in the error message and move it temporarily — only `docs/`, `.git`, `.gitignore`, `README.md`, `LICENSE` are allowed to pre-exist.

- [ ] **Step 2: Add a typecheck script**

In `package.json` `"scripts"`, add:

```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 3: Verify the scaffold**

```powershell
npm run lint
npm run typecheck
```

Expected: both exit 0 (no errors).

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "feat: scaffold Next.js 15 app (TS strict, Tailwind, ESLint)"
```

---

### Task 2: Folder skeleton + `@core` / `@client` path aliases

**Files:**
- Create: `src/core/.gitkeep`, `src/clients/_default/.gitkeep`, `wp-plugin/headless-bridge/.gitkeep`, `wp-env/.gitkeep`
- Modify: `tsconfig.json` (paths), `next.config.ts` (webpack alias)
- Create: `.env.example`

- [ ] **Step 1: Create the folder skeleton**

```powershell
New-Item -ItemType Directory -Force src\core, src\clients\_default, wp-plugin\headless-bridge, wp-env | Out-Null
New-Item -ItemType File src\core\.gitkeep, src\clients\_default\.gitkeep, wp-plugin\headless-bridge\.gitkeep, wp-env\.gitkeep | Out-Null
```

- [ ] **Step 2: Add path aliases to `tsconfig.json`**

In `compilerOptions.paths`, replace the existing block with:

```json
"paths": {
  "@/*": ["./src/*"],
  "@core/*": ["./src/core/*"],
  "@ui/*": ["./src/components/ui/*"],
  "@client/*": ["./src/clients/_default/*"]
}
```

Note: TypeScript always type-checks `@client/*` against `_default` (the reference client). All clients must keep the same exported shape — runtime correctness is guaranteed by the zod parse in Task 5.

- [ ] **Step 3: Wire the `CLIENT` env var into webpack in `next.config.ts`**

> **Review amendment:** Next.js feeds tsconfig `paths` into webpack at enhanced-resolve's `described-resolve` stage, which outranks `resolve.alias` (`raw-resolve`). With only `resolve.alias`, the tsconfig `@client/*` mapping silently wins and every build resolves to `_default` regardless of `CLIENT` — empirically verified on Next 15.5.19. The snippet below strips the `@client/*` pattern from Next's JsConfigPathsPlugin at runtime (tsc still type-checks against `_default`), validates `CLIENT`, and fails fast on unknown clients.

Replace the file contents with:

```ts
import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const activeClient = process.env.CLIENT ?? "_default";

if (!/^[A-Za-z0-9_-]+$/.test(activeClient)) {
  throw new Error(
    `Invalid CLIENT "${activeClient}" — must match [A-Za-z0-9_-]+`,
  );
}
const clientDir = path.resolve(process.cwd(), "src/clients", activeClient);
if (!fs.existsSync(clientDir)) {
  const valid = fs.readdirSync(path.resolve(process.cwd(), "src/clients"));
  throw new Error(
    `Unknown CLIENT "${activeClient}" — expected one of: ${valid.join(", ")}`,
  );
}

// NOTE: the webpack() hook below is the entire white-label mechanism. It only
// runs under webpack — do NOT switch dev/build to --turbopack without wiring
// turbopack.resolveAlias equivalently.
const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias["@client"] = clientDir;
    // Next feeds tsconfig "paths" into webpack at the described-resolve stage,
    // which outranks resolve.alias (raw-resolve). Remove the @client pattern
    // from the runtime resolver so the CLIENT-selected alias wins; tsc still
    // type-checks @client/* against _default via tsconfig.
    for (const plugin of config.resolve.plugins ?? []) {
      if ((plugin as { jsConfigPlugin?: boolean })?.jsConfigPlugin) {
        delete (plugin as unknown as { paths: Record<string, unknown> })
          .paths["@client/*"];
      }
    }
    return config;
  },
};

export default nextConfig;
```

This relies on a Next internal (`jsConfigPlugin` marker, verified present in 15.5.19); the `verify:client-alias` probe added in Task 5 is the canary that catches breakage on Next upgrades.

- [ ] **Step 4: Create `.env.example`**

```
# Active client — must match a folder name under src/clients/
CLIENT=_default
```

Then add an exception to `.gitignore` directly below the `.env*` line (otherwise `git add -A` silently skips the file):

```
.env*
!.env.example
```

- [ ] **Step 5: Verify**

```powershell
npm run typecheck
npm run build
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "feat: add core/client folder skeleton and CLIENT-resolved path aliases"
```

---

### Task 3: Vitest setup

**Files:**
- Create: `vitest.config.ts`, `src/core/smoke.test.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Install dev dependencies**

```powershell
npm install -D vitest vite-tsconfig-paths
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

Note: `vite-tsconfig-paths` resolves `@client/*` to `_default` in tests (same as the tsconfig mapping). Per-client test runs are out of scope for Phase 0.

- [ ] **Step 3: Add scripts to `package.json`**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test** — `src/core/smoke.test.ts`

```ts
import { describe, expect, it } from "vitest";

describe("vitest setup", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run tests**

```powershell
npm test
```

Expected: `1 passed`.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "chore: add vitest with tsconfig path resolution"
```

---

### Task 4: Client config zod schema (TDD)

**Files:**
- Create: `src/core/config/schema.ts`
- Test: `src/core/config/schema.test.ts`

- [ ] **Step 1: Install zod**

```powershell
npm install zod
```

- [ ] **Step 2: Write the failing test** — `src/core/config/schema.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { clientConfigSchema } from "./schema";

const valid = {
  identity: { name: "Test Store" },
  locales: ["en", "fr"],
  defaultLocale: "en",
  currencies: ["USD", "EUR"],
  defaultCurrency: "USD",
  wordpress: { endpoint: "http://localhost:8080/graphql" },
};

describe("clientConfigSchema", () => {
  it("accepts a minimal valid config and applies defaults", () => {
    const parsed = clientConfigSchema.parse(valid);
    expect(parsed.gateways).toEqual([]);
    expect(parsed.features.reviews).toBe(false);
    expect(parsed.features.wishlist).toBe(false);
    expect(parsed.countryCurrency).toEqual({});
    expect(parsed.identity.logo).toBe("/logo.svg");
  });

  it("rejects a defaultLocale that is not in locales", () => {
    expect(() =>
      clientConfigSchema.parse({ ...valid, defaultLocale: "de" }),
    ).toThrow(/defaultLocale/);
  });

  it("rejects a defaultCurrency that is not in currencies", () => {
    expect(() =>
      clientConfigSchema.parse({ ...valid, defaultCurrency: "BDT" }),
    ).toThrow(/defaultCurrency/);
  });

  it("rejects a non-URL wordpress endpoint", () => {
    expect(() =>
      clientConfigSchema.parse({
        ...valid,
        wordpress: { endpoint: "not-a-url" },
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```powershell
npm test
```

Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 4: Implement the schema** — `src/core/config/schema.ts`

```ts
import { z } from "zod";

export const clientConfigSchema = z
  .object({
    identity: z.object({
      name: z.string().min(1),
      logo: z.string().default("/logo.svg"),
    }),
    locales: z.array(z.string().min(2)).min(1),
    defaultLocale: z.string().min(2),
    currencies: z.array(z.string().length(3)).min(1),
    defaultCurrency: z.string().length(3),
    countryCurrency: z
      .record(z.string().length(2), z.string().length(3))
      .default({}),
    wordpress: z.object({
      endpoint: z.url(),
    }),
    gateways: z.array(z.string()).default([]),
    features: z
      .object({
        reviews: z.boolean().default(false),
        wishlist: z.boolean().default(false),
      })
      .default({ reviews: false, wishlist: false }),
  })
  .refine((c) => c.locales.includes(c.defaultLocale), {
    message: "defaultLocale must be included in locales",
  })
  .refine((c) => c.currencies.includes(c.defaultCurrency), {
    message: "defaultCurrency must be included in currencies",
  });

export type ClientConfig = z.infer<typeof clientConfigSchema>;
export type ClientConfigInput = z.input<typeof clientConfigSchema>;
```

Note: `z.url()` is zod v4 syntax. If `npm ls zod` shows v3.x, use `z.string().url()` instead.

- [ ] **Step 5: Run the test to verify it passes**

```powershell
npm test
```

Expected: all schema tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "feat: add zod client-config schema with cross-field validation"
```

---

### Task 5: Default client config + `src/client.ts` resolver (TDD)

**Files:**
- Create: `src/clients/_default/client.config.ts`, `src/client.ts`
- Test: `src/client.test.ts`
- Delete: `src/clients/_default/.gitkeep`, `src/core/.gitkeep`, `src/core/smoke.test.ts`

- [ ] **Step 1: Write the failing test** — `src/client.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { activeClient } from "./client";

describe("active client resolution", () => {
  it("resolves and validates the default client config", () => {
    expect(activeClient.identity.name).toBe("Default Storefront");
    expect(activeClient.locales).toContain("en");
    expect(activeClient.defaultCurrency).toBe("USD");
    // defaults applied by the schema:
    expect(activeClient.features.reviews).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
npm test
```

Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 3: Create the reference client config** — `src/clients/_default/client.config.ts`

```ts
import type { ClientConfigInput } from "@core/config/schema";

export const clientConfig: ClientConfigInput = {
  identity: { name: "Default Storefront" },
  locales: ["en", "fr"],
  defaultLocale: "en",
  currencies: ["USD", "EUR"],
  defaultCurrency: "USD",
  countryCurrency: { US: "USD", FR: "EUR", DE: "EUR" },
  wordpress: { endpoint: "http://localhost:8080/graphql" },
  gateways: ["stripe"],
};
```

- [ ] **Step 4: Create the resolver** — `src/client.ts`

```ts
import { clientConfigSchema, type ClientConfig } from "@core/config/schema";
import { clientConfig as rawConfig } from "@client/client.config";

/**
 * The single bridge between core and the active client.
 * `@client` resolves to src/clients/<CLIENT> at build time (next.config.ts);
 * the zod parse fails the build on an invalid config.
 */
export const activeClient: ClientConfig = clientConfigSchema.parse(rawConfig);
```

- [ ] **Step 5: Remove placeholder files**

```powershell
Remove-Item src\clients\_default\.gitkeep, src\core\.gitkeep, src\core\smoke.test.ts
```

- [ ] **Step 6: Run tests and build to verify**

```powershell
npm test
npm run build
```

Expected: tests PASS; build exits 0. (Note: a green build does NOT prove the `@client` alias resolves per `CLIENT` — tsconfig fallback would also build green. The probe in Step 7 is the real proof.)

- [ ] **Step 7: Add the alias probe script** — `scripts/verify-client-alias.mjs`

This is the only check that proves the CLIENT-resolved alias actually wins over tsconfig paths (and the canary for Next-internals drift / accidental Turbopack adoption):

```js
// Builds the app with a throwaway probe client and asserts the probe's
// marker (not _default's) reaches the rendered output. Guards the entire
// white-label mechanism — see next.config.ts.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const probeName = "_alias_probe";
const probeDir = path.join(root, "src", "clients", probeName);
const defaultDir = path.join(root, "src", "clients", "_default");
const marker = "ALIAS_PROBE_STORE_8f3a";

try {
  fs.rmSync(probeDir, { recursive: true, force: true });
  fs.cpSync(defaultDir, probeDir, { recursive: true });
  const configPath = path.join(probeDir, "client.config.ts");
  const config = fs
    .readFileSync(configPath, "utf8")
    .replace(/name: ".*?"/, `name: "${marker}"`);
  fs.writeFileSync(configPath, config);

  execSync("npx next build", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, CLIENT: probeName },
  });

  const html = fs.readFileSync(
    path.join(root, ".next", "server", "app", "index.html"),
    "utf8",
  );
  if (!html.includes(marker)) {
    console.error(
      "FAIL: @client alias did not resolve to the CLIENT env var (got _default fallback)",
    );
    process.exit(1);
  }
  console.log("OK: @client alias resolves per CLIENT env var");
} finally {
  fs.rmSync(probeDir, { recursive: true, force: true });
}
```

Add the npm script to `package.json`:

```json
"verify:client-alias": "node scripts/verify-client-alias.mjs"
```

- [ ] **Step 8: Run the probe**

```powershell
npm run verify:client-alias
```

Expected: ends with `OK: @client alias resolves per CLIENT env var`, exit 0.

- [ ] **Step 9: Commit**

```powershell
git add -A
git commit -m "feat: add default client config and validated client resolver"
```

---

### Task 6: shadcn/ui + per-client theme.css

**Files:**
- Create (generated): `components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx`
- Create: `src/clients/_default/theme.css`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Initialize shadcn/ui**

```powershell
npx shadcn@latest init --yes --base-color neutral
```

Expected: `components.json` created; `src/app/globals.css` rewritten with `:root` CSS-variable tokens (`--primary`, `--radius`, ...). If the CLI prompts despite `--yes`, accept defaults (CSS variables: yes).

- [ ] **Step 2: Add the Button component to verify the pipeline**

```powershell
npx shadcn@latest add button
```

Expected: `src/components/ui/button.tsx` created.

- [ ] **Step 3: Create the client theme override** — `src/clients/_default/theme.css`

```css
/*
 * Client theme tokens. Loaded AFTER globals.css, so any token defined in
 * globals.css :root can be overridden here. Reskinning a client = editing
 * this file (plus logo/config). Do not add component CSS here — tokens only.
 */
:root {
  --primary: oklch(0.55 0.2 260);
  --radius: 0.5rem;
}
```

Note: if `globals.css` from shadcn init uses hsl-format tokens instead of oklch, match that format (e.g. `--primary: 240 60% 50%;`).

- [ ] **Step 4: Import the theme in `src/app/layout.tsx`**

Add immediately after the `./globals.css` import:

```ts
import "./globals.css";
import "@client/theme.css";
```

- [ ] **Step 5: Render a themed Button on the home page**

Replace `src/app/page.tsx` contents with:

```tsx
import { Button } from "@ui/button";
import { activeClient } from "@/client";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">{activeClient.identity.name}</h1>
      <Button>Themed button</Button>
    </main>
  );
}
```

- [ ] **Step 6: Verify visually and via build**

```powershell
npm run build
```

Expected: exit 0. Then `npm run dev`, open http://localhost:3000 — heading reads "Default Storefront", button background is the violet `--primary` from theme.css (not the neutral default). Stop the dev server.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "feat: add shadcn/ui with per-client CSS-variable theming"
```

---

### Task 7: ESLint boundary rules

**Files:**
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Add the boundary override**

In `eslint.config.mjs`, append to the exported config array (after the existing entries):

```js
{
  files: ["src/core/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@client", "@client/*", "**/clients/**"],
            message:
              "core must not import client code — depend on types/interfaces, or go through src/client.ts",
          },
        ],
      },
    ],
  },
},
{
  files: ["src/clients/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@/app/*", "**/app/**"],
            message: "client modules must not import app routes",
          },
        ],
      },
    ],
  },
},
```

- [ ] **Step 2: Verify the rule fires (red)**

Create a scratch violation `src/core/_boundary-check.ts`:

```ts
import { clientConfig } from "@client/client.config";

export const x = clientConfig;
```

```powershell
npm run lint
```

Expected: FAIL with `no-restricted-imports` error on `src/core/_boundary-check.ts`.

- [ ] **Step 3: Remove the scratch file and verify green**

```powershell
Remove-Item src\core\_boundary-check.ts
npm run lint
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "feat: enforce core/client import boundaries via ESLint"
```

---

### Task 8: Docker WordPress environment

**Files:**
- Create: `wp-env/docker-compose.yml`, `wp-env/setup.ps1`, `wp-plugin/headless-bridge/headless-bridge.php`
- Delete: `wp-env/.gitkeep`, `wp-plugin/headless-bridge/.gitkeep`

- [ ] **Step 1: Create `wp-env/docker-compose.yml`**

```yaml
name: ecommerce-wp

services:
  db:
    image: mariadb:11
    environment:
      MARIADB_ROOT_PASSWORD: root
      MARIADB_DATABASE: wordpress
      MARIADB_USER: wordpress
      MARIADB_PASSWORD: wordpress
    volumes:
      - db_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 5s
      timeout: 5s
      retries: 24

  wordpress:
    image: wordpress:6.8
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "8080:80"
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpress
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - wp_data:/var/www/html
      - ../wp-plugin/headless-bridge:/var/www/html/wp-content/plugins/headless-bridge

  wpcli:
    image: wordpress:cli
    profiles: ["cli"]
    depends_on:
      db:
        condition: service_healthy
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpress
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - wp_data:/var/www/html
      - ../wp-plugin/headless-bridge:/var/www/html/wp-content/plugins/headless-bridge

volumes:
  db_data:
  wp_data:
```

Dev credentials are intentionally trivial — this stack is local-only and must never be exposed publicly.

- [ ] **Step 2: Create the plugin skeleton** — `wp-plugin/headless-bridge/headless-bridge.php`

```php
<?php
/**
 * Plugin Name: Headless Bridge
 * Description: Companion plugin for the headless storefront — i18n translation groups, multi-currency pricing, cache revalidation webhooks, GraphQL hardening.
 * Version: 0.1.0
 * Requires at least: 6.5
 * Requires PHP: 8.1
 */

if (!defined('ABSPATH')) {
    exit;
}

// Modules (i18n, pricing, revalidation, hardening) are registered here from Phase 1 onward.
```

- [ ] **Step 3: Create `wp-env/setup.ps1`**

```powershell
# Provisions the local WordPress backend. Idempotent — safe to re-run.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

docker compose up -d

# Wait for WordPress to respond over HTTP (any status incl. redirects counts)
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        Invoke-WebRequest -Uri "http://localhost:8080" -UseBasicParsing -TimeoutSec 5 | Out-Null
        $ready = $true; break
    } catch {
        if ($_.Exception.Response) { $ready = $true; break }
    }
    Start-Sleep -Seconds 2
}
if (-not $ready) { throw "WordPress did not become reachable on http://localhost:8080" }

docker compose run --rm wpcli wp core is-installed
if ($LASTEXITCODE -ne 0) {
    docker compose run --rm wpcli wp core install `
        --url=http://localhost:8080 `
        --title="Headless Store Dev" `
        --admin_user=admin `
        --admin_password=admin `
        --admin_email=admin@example.com `
        --skip-email
}

docker compose run --rm wpcli wp plugin install woocommerce wp-graphql --activate

docker compose run --rm wpcli wp plugin install `
    https://github.com/wp-graphql/wp-graphql-woocommerce/releases/latest/download/wp-graphql-woocommerce.zip --activate

# JWT auth — needed from Phase 6; soft-fail so Phase 0 stays green if the asset moves
docker compose run --rm wpcli wp plugin install `
    https://github.com/wp-graphql/wp-graphql-jwt-authentication/releases/latest/download/wp-graphql-jwt-authentication.zip --activate
if ($LASTEXITCODE -ne 0) {
    Write-Warning "wp-graphql-jwt-authentication install failed. Fallback (Phase 6): download the source zip from GitHub, run 'composer install --no-dev' inside the plugin folder, zip it, and install that zip."
} else {
    $secret = -join ((1..48) | ForEach-Object { '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'[(Get-Random -Maximum 62)] })
    docker compose run --rm wpcli wp config set GRAPHQL_JWT_AUTH_SECRET_KEY $secret --type=constant
}

docker compose run --rm wpcli wp plugin activate headless-bridge

docker compose run --rm wpcli wp option update permalink_structure "/%postname%/"
docker compose run --rm wpcli wp rewrite flush --hard

docker compose run --rm wpcli wp plugin list
Write-Host "`nDone. WP admin: http://localhost:8080/wp-admin (admin/admin) | GraphQL: http://localhost:8080/graphql"
```

- [ ] **Step 4: Remove the `.gitkeep` placeholders**

```powershell
Remove-Item wp-env\.gitkeep, wp-plugin\headless-bridge\.gitkeep
```

- [ ] **Step 5: Run the setup (Docker Desktop must be running)**

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\setup.ps1
```

Expected: ends with a `wp plugin list` table showing `woocommerce`, `wp-graphql`, `wp-graphql-woocommerce`, and `headless-bridge` as `active`. A warning about the JWT plugin is acceptable (soft-fail).

- [ ] **Step 6: Verify the GraphQL endpoint**

```powershell
Invoke-RestMethod -Uri "http://localhost:8080/graphql" -Method Post -ContentType "application/json" -Body '{"query":"{ generalSettings { title } products(first: 1) { nodes { id } } }"}'
```

Expected: JSON response with `data.generalSettings.title = "Headless Store Dev"` and an empty `products.nodes` array (proves WooGraphQL schema is live). No `errors` key.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "feat: add Dockerized WordPress backend with headless GraphQL plugin stack"
```

---

### Task 9: CI skeleton

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` (strict lint)

- [ ] **Step 0: Make lint strict for CI**

In `package.json` scripts, change the lint script so warn-level rules fail the gate:

```json
"lint": "eslint --max-warnings 0"
```

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [master, main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    env:
      CLIENT: _default
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npm run verify:client-alias
```

- [ ] **Step 2: Verify the same gate passes locally**

```powershell
npm run lint; npm run typecheck; npm test; npm run build
```

Expected: all four exit 0.

- [ ] **Step 3: Commit**

```powershell
git add -A
git commit -m "ci: add lint/typecheck/test/build workflow"
```

---

## Phase 0 Definition of Done

- `npm run lint && npm run typecheck && npm test && npm run build` all green locally and in CI.
- `npm run dev` renders the themed default storefront page.
- Importing `@client/*` inside `src/core/**` fails lint.
- `wp-env\setup.ps1` provisions a WordPress with WooCommerce + WPGraphQL + WooGraphQL + headless-bridge active, and `POST /graphql` answers WooGraphQL queries.
