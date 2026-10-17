import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "coverage/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  { files: ["scripts/**", "tests/**"], rules: { "no-console": "off" } },
]);
