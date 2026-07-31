import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = path.join(root, "src");

// Every top-level entry under src/ is classified. An unclassified entry fails this test, so a
// new folder cannot silently escape the layer model.
const layerOfDirectory = new Map([
  ["domain", "domain"],
  ["ports", "ports"],
  ["application", "application"],
  ["adapters", "adapters"],
  ["bootstrap", "composition"],
  // TRANSITIONAL: src/game and src/ui hold the Vue 2 game-model and DOM bridges. They are
  // adapter-owned today and move under src/adapters as each capability gains a narrow port.
  ["game", "adapters"],
  ["ui", "adapters"],
  // TRANSITIONAL: pure decision code that has not moved under src/domain yet. The policy layer
  // exists only so these folders cannot gain adapter, application, or composition dependencies
  // while they are migrated; remove it once each folder lands in domain or application.
  ["observability", "policy"],
  ["planning", "policy"],
  ["settings", "policy"],
  // Dependency-free shared foundation. Must not import feature or platform code.
  ["formatting", "shared"],
  ["utils", "shared"],
  ["validation", "shared"],
]);

const layerOfRootFile = new Map([
  ["config.ts", "shared"],
  ["main.ts", "composition"],
]);

// The Vue 2 compatibility runtime assembles features the same way the bootstrap seams do.
// TRANSITIONAL: it loses this classification once its remaining feature logic moves behind
// ports and it imports adapters only.
const compositionFiles = new Set(["adapters/evolve/evolve-runtime.js"]);

// Not production source: userscript release metadata consumed by the build.
const excludedFiles = new Set(["userscript.meta.js"]);

const allowedImports = new Map([
  ["shared", new Set(["shared"])],
  ["domain", new Set(["domain", "shared"])],
  ["ports", new Set(["domain", "ports", "shared"])],
  ["policy", new Set(["domain", "ports", "policy", "shared"])],
  ["application", new Set(["application", "domain", "ports", "shared"])],
  ["adapters", new Set(["adapters", "domain", "ports", "shared"])],
  [
    "composition",
    new Set([
      "adapters",
      "application",
      "composition",
      "domain",
      "policy",
      "ports",
      "shared",
    ]),
  ],
]);

// Only adapters and composition may reach outside the repository.
const layersAllowedToImportPackages = new Set(["adapters", "composition"]);

function toRelative(file) {
  return path.relative(sourceRoot, file).replaceAll(path.sep, "/");
}

function layerOf(relativePath) {
  if (compositionFiles.has(relativePath)) return "composition";
  const separator = relativePath.indexOf("/");
  if (separator === -1) {
    return excludedFiles.has(relativePath)
      ? null
      : (layerOfRootFile.get(relativePath) ?? null);
  }
  return layerOfDirectory.get(relativePath.slice(0, separator)) ?? null;
}

function importViolation(fromRelative, toRelative) {
  const fromLayer = layerOf(fromRelative);
  const toLayer = layerOf(toRelative);
  if (fromLayer === null) return `${fromRelative}: unclassified source file`;
  if (toLayer === null)
    return `${fromRelative}: unclassified import ${toRelative}`;
  return allowedImports.get(fromLayer).has(toLayer)
    ? null
    : `${fromRelative}: ${fromLayer} cannot import ${toLayer} (${toRelative})`;
}

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? collectSourceFiles(entryPath)
      : /\.(?:js|ts)$/.test(entry.name)
        ? [entryPath]
        : [];
  });
}

function resolveLocalImport(importer, specifier) {
  const candidate = path.resolve(path.dirname(importer), specifier);
  for (const file of [
    candidate,
    `${candidate}.ts`,
    `${candidate}.js`,
    path.join(candidate, "index.ts"),
  ]) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return candidate;
}

const allSourceFiles = collectSourceFiles(sourceRoot);
const productionFiles = allSourceFiles.filter(
  (file) => !excludedFiles.has(toRelative(file)),
);
const productionFileSet = new Set(productionFiles);
const graph = new Map(productionFiles.map((file) => [file, []]));
const failures = [];

for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
  const classified = entry.isDirectory()
    ? layerOfDirectory.has(entry.name)
    : layerOfRootFile.has(entry.name) || excludedFiles.has(entry.name);
  if (!classified) {
    failures.push(
      `src/${entry.name}: top-level source entry has no layer classification`,
    );
  }
}

for (const file of productionFiles) {
  const fromRelative = toRelative(file);
  const fromLayer = layerOf(fromRelative);
  if (fromLayer === null) {
    failures.push(`${fromRelative}: unclassified source file`);
    continue;
  }
  const source = fs.readFileSync(file, "utf8");

  for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
    const specifier = imported.fileName;
    if (!specifier.startsWith(".")) {
      if (!layersAllowedToImportPackages.has(fromLayer)) {
        failures.push(
          `${fromRelative}: ${fromLayer} cannot import package ${specifier}`,
        );
      }
      continue;
    }

    const target = resolveLocalImport(file, specifier);
    if (!productionFileSet.has(target)) {
      failures.push(`${fromRelative}: unresolved import ${specifier}`);
      continue;
    }
    const violation = importViolation(fromRelative, toRelative(target));
    if (violation !== null) failures.push(violation);
    graph.get(file).push(target);
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
    failures.push(`import cycle: ${cycle}`);
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const dependency of graph.get(file))
    visit(dependency, [...ancestry, file]);
  visiting.delete(file);
  visited.add(file);
}
for (const file of productionFiles) visit(file, []);

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

// A forbidden import in each classified layer must be rejected. These fixtures fail if the
// layer map is ever widened into an unrestricted legacy allowlist.
for (const [from, to] of [
  ["utils/math.ts", "domain/planner-analysis.ts"],
  ["domain/planner-analysis.ts", "ports/build.ts"],
  ["ports/build.ts", "application/build.ts"],
  ["domain/progression/build/building-weighting-rules.ts", "ports/build.ts"],
  [
    "domain/progression/build/building-weighting-rules.ts",
    "adapters/browser/vue.ts",
  ],
  ["domain/override-resolution.ts", "adapters/evolve/override-evaluation.ts"],
  [
    "application/override-settings.ts",
    "adapters/evolve/override-failure-log.ts",
  ],
  ["domain/override-editing.ts", "ports/override-editing.ts"],
  ["ui/settings-controls.ts", "application/override-editing.ts"],
  ["planning/build-planner.ts", "application/build.ts"],
  ["settings/state.ts", "ui/settings-shell.ts"],
  ["observability/state-log.ts", "adapters/browser/vue.ts"],
  ["application/build.ts", "adapters/browser/vue.ts"],
  ["adapters/browser/vue.ts", "application/build.ts"],
  ["adapters/browser/vue.ts", "bootstrap/tick-runner.ts"],
  ["game/rates.ts", "settings/state.ts"],
  ["ui/settings-shell.ts", "settings/state.ts"],
]) {
  assert.notEqual(
    importViolation(from, to),
    null,
    `${from} must not be allowed to import ${to}`,
  );
}
for (const [from, to] of [
  ["domain/planner-analysis.ts", "utils/math.ts"],
  ["settings/state.ts", "ports/build.ts"],
  ["application/override-settings.ts", "ports/override-settings.ts"],
  ["ui/settings-controls.ts", "ports/override-editing.ts"],
  ["adapters/evolve/override-failure-log.ts", "domain/override-resolution.ts"],
  ["game/core-managers.ts", "domain/progression/build/building-weighting.ts"],
  ["game/rates.ts", "domain/planner-analysis.ts"],
  ["bootstrap/tick-runner.ts", "adapters/browser/vue.ts"],
  ["adapters/evolve/evolve-runtime.js", "settings/state.ts"],
  ["main.ts", "adapters/browser/vue.ts"],
]) {
  assert.equal(
    importViolation(from, to),
    null,
    `${from} must be allowed to import ${to}`,
  );
}
assert.equal(
  layerOf("nonexistent-folder/file.ts"),
  null,
  "an unknown folder must not resolve to a layer",
);

console.log(
  `Architecture boundaries, userscript globals, and cycle check passed (${productionFiles.length} production files)`,
);
