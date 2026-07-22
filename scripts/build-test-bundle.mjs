import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const outfile = path.join(tmpdir(), "evolve-automation-test-bundle.js");

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["scripts/test-entry.ts"],
  outfile,
  bundle: true,
  charset: "utf8",
  format: "iife",
  legalComments: "inline",
  logLevel: "warning",
  platform: "browser",
  target: ["esnext"],
  treeShaking: false,
});
