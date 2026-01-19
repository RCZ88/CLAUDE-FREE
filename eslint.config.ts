import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import json from "@eslint/json";
import css from "@eslint/css";

// REMOVED: import { defineConfig } from "eslint/config";

export default tseslint.config(
  // 1. JS/TS Config
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    extends: [js.configs.recommended], // Simplified usage
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    }
  },

  // 2. TS Recommended Rules
  ...tseslint.configs.recommended,

  // 3. JSON Configs
  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json"
  },
  {
    files: ["**/*.jsonc"],
    plugins: { json },
    language: "json/jsonc"
  },

  // 4. CSS Configs
  {
    files: ["**/*.css"],
    plugins: { css },
    language: "css/css"
  },
);