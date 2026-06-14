import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The app tsconfig sets `jsx: "preserve"` for Next.js; the React plugin
  // compiles JSX for tests that import the variant component graph (e.g. the
  // registry pulls in the header `.tsx` components) instead of inheriting
  // `preserve` and failing import analysis.
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
