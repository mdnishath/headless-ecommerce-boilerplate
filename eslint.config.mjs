import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
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
            {
              group: ["@/app/*", "**/app/**"],
              message:
                "core must not import app routes — core is consumed by app, never the reverse",
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
];

export default eslintConfig;
