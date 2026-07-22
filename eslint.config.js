import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "node_modules/**",
      "evolve.js",
      "evolve_automation.user.js",
      "evolve_automation.meta.js",
      "docs/**",
      "progress_log/**",
      "tools/**",
      "evolve_automation.user_original.js",
    ],
  },
  {
    files: ["src/**/*.js"],
    extends: [js.configs.recommended, prettierConfig],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    rules: {
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-fallthrough": "warn",
      "no-prototype-builtins": "warn",
      "no-unreachable": "warn",
      "no-unused-vars": "warn",
      "no-useless-assignment": "warn",
      "prefer-const": "off",
    },
  },
  {
    files: ["*.{js,mjs}", "scripts/**/*.mjs"],
    extends: [js.configs.recommended, prettierConfig],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    files: ["src/**/*.ts"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      prettierConfig,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "no-case-declarations": "warn",
      "no-prototype-builtins": "warn",
      "no-useless-assignment": "warn",
      "no-var": "off",
      "prefer-const": "off",
    },
  },
  {
    files: [
      "src/application/**/*.ts",
      "src/domain/**/*.ts",
      "src/ports/**/*.ts",
      "src/adapters/**/*.ts",
      "src/bootstrap/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: [
      "src/application/**/*.ts",
      "src/domain/**/*.ts",
      "src/ports/**/*.ts",
      "src/bootstrap/**/*.ts",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "window", message: "Access browser globals through a port." },
        {
          name: "document",
          message: "Access the DOM through a browser or UI adapter.",
        },
        {
          name: "unsafeWindow",
          message: "Access userscript globals through the userscript adapter.",
        },
        { name: "$", message: "Access jQuery through a browser adapter." },
      ],
    },
  },
);
