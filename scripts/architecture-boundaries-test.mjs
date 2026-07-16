import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = path.join(root, "src");

// src/ui is intentionally excluded until its legacy contents migrate in Milestone 4. New
// architecture work must live in one of these roots and is enforced from its first commit.
const layerDirectories = new Map([
  ["domain", "domain"],
  ["ports", "ports"],
  ["application", "application"],
  ["adapters", "adapters"],
  ["bootstrap", "bootstrap"],
]);

const allowedImports = new Map([
  ["domain", new Set(["domain"])],
  ["ports", new Set(["domain", "ports"])],
  ["application", new Set(["domain", "ports", "application"])],
  ["adapters", new Set(["domain", "ports", "adapters"])],
  [
    "bootstrap",
    new Set(["domain", "ports", "application", "adapters", "bootstrap"]),
  ],
]);

function collectTypeScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? collectTypeScriptFiles(entryPath)
      : entry.name.endsWith(".ts")
        ? [entryPath]
        : [];
  });
}

function getLayer(file) {
  const [directory] = path.relative(sourceRoot, file).split(path.sep);
  return layerDirectories.get(directory) ?? null;
}

function resolveLocalImport(importer, specifier) {
  if (!specifier.startsWith(".")) return null;
  const candidate = path.resolve(path.dirname(importer), specifier);
  for (const file of [
    candidate,
    `${candidate}.ts`,
    path.join(candidate, "index.ts"),
  ]) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return candidate;
}

const architectureFiles = [...layerDirectories.keys()].flatMap((directory) =>
  collectTypeScriptFiles(path.join(sourceRoot, directory)),
);
const architectureFileSet = new Set(architectureFiles);
const graph = new Map(architectureFiles.map((file) => [file, []]));
const failures = [];

for (const file of architectureFiles) {
  const sourceLayer = getLayer(file);
  assert.notEqual(sourceLayer, null);
  const source = fs.readFileSync(file, "utf8");
  const imports = ts.preProcessFile(source, true, true).importedFiles;

  for (const imported of imports) {
    const specifier = imported.fileName;
    if (!specifier.startsWith(".")) {
      if (sourceLayer !== "adapters" && sourceLayer !== "bootstrap") {
        failures.push(
          `${path.relative(root, file)}: ${sourceLayer} cannot import package ${specifier}`,
        );
      }
      continue;
    }

    const target = resolveLocalImport(file, specifier);
    const targetLayer = getLayer(target);
    if (target.startsWith(sourceRoot) && targetLayer === null) {
      if (sourceLayer !== "bootstrap") {
        failures.push(
          `${path.relative(root, file)}: ${sourceLayer} cannot import legacy source ${path.relative(sourceRoot, target)}`,
        );
      }
      continue;
    }
    if (
      targetLayer !== null &&
      !allowedImports.get(sourceLayer).has(targetLayer)
    ) {
      failures.push(
        `${path.relative(root, file)}: ${sourceLayer} cannot import ${targetLayer} (${specifier})`,
      );
    }
    if (architectureFileSet.has(target)) {
      graph.get(file).push(target);
    }
  }
}

const visiting = new Set();
const visited = new Set();
function visit(file, ancestry) {
  if (visiting.has(file)) {
    const cycleStart = ancestry.indexOf(file);
    const cycle = [...ancestry.slice(cycleStart), file]
      .map((entry) => path.relative(root, entry))
      .join(" -> ");
    failures.push(`architecture import cycle: ${cycle}`);
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const dependency of graph.get(file))
    visit(dependency, [...ancestry, file]);
  visiting.delete(file);
  visited.add(file);
}
for (const file of architectureFiles) visit(file, []);

const userscriptAdapter = path.join(
  sourceRoot,
  "adapters",
  "userscript",
  "environment.ts",
);
const optionalUserscriptGlobals = new Set([
  "unsafeWindow",
  "cloneInto",
  "exportFunction",
  "GM_info",
  "GM",
]);
const allSourceFiles = (function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? collectSourceFiles(entryPath)
      : /\.(?:js|ts)$/.test(entry.name)
        ? [entryPath]
        : [];
  });
})(sourceRoot);
for (const file of allSourceFiles) {
  if (file === userscriptAdapter) continue;
  const sourceFile = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
    file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );
  function inspect(node) {
    if (ts.isIdentifier(node) && optionalUserscriptGlobals.has(node.text)) {
      const position = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(),
      );
      failures.push(
        `${path.relative(root, file)}:${position.line + 1}: optional userscript global ${node.text} must stay in the userscript adapter`,
      );
    }
    ts.forEachChild(node, inspect);
  }
  inspect(sourceFile);
}

assert.equal(
  failures.length,
  0,
  `Architecture boundary violations:\n${failures.join("\n")}`,
);
console.log(
  `Architecture boundaries, userscript globals, and cycle check passed (${architectureFiles.length} architecture files)`,
);
