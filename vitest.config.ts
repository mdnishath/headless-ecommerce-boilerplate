import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The app tsconfig sets `jsx: "preserve"` for Next.js; the React plugin
  // compiles JSX for tests that import the variant component graph (e.g. the
  // registry pulls in the header `.tsx` components) instead of inheriting
  // `preserve` and failing import analysis.
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws when imported outside React Server Components; under
    // Vitest the `react-server` export condition is inactive, so it resolves to
    // the throwing entry. Alias it to the package's own empty stub so server
    // modules (e.g. get-customization) can be unit-tested. The subpath isn't in
    // the package `exports`, so point at the file directly.
    alias: {
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    // Expose afterEach globally so @testing-library/react auto-registers its
    // per-test DOM cleanup; without it, .tsx renders accumulate in the shared
    // jsdom document and queries match across tests.
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
