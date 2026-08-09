import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // The frozen design export is a read-only reference, not project source.
    // support.js is a generated third-party runtime bundle; linting it reports
    // real-but-irrelevant findings and invites edits to a file that must stay
    // byte-identical to the artifact.
    "reference/**",

    // The baseline harness is a standalone package with its own toolchain.
    "tools/baseline/node_modules/**",
  ]),
]);

export default eslintConfig;
