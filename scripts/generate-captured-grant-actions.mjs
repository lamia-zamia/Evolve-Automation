import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import prettier from "prettier";

const upstreamArgument = process.argv.find((argument) =>
  argument.startsWith("--upstream="),
);
if (!upstreamArgument?.slice("--upstream=".length)) {
  throw new Error(
    "Pass --upstream=<path> to an explicit Evolve source checkout",
  );
}
const upstream = resolve(upstreamArgument.slice("--upstream=".length));
const commit = "db38e2af831907d49aeb5348d678d8d8745d6c3f";
const initialGrantCommit = "6cc9ba8ce714e9ef474b468be93b4c7edfb98830";
const legacyManagerCommit = "a4777a2b39325baa700fc1facf5635e526dac4d4";
const sources = [
  "src/actions.js",
  "src/arpa.js",
  "src/edenic.js",
  "src/portal.js",
  "src/space.js",
  "src/tech.js",
  "src/truepath.js",
];
const output = resolve(
  "src/adapters/evolve/progression/build/captured-grant-actions.generated.ts",
);

function property(object, name) {
  return object.properties.find(
    (entry) =>
      ts.isPropertyAssignment(entry) &&
      (ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name)) &&
      entry.name.text === name,
  );
}

const buildRegions = new Set([
  "city",
  "space",
  "interstellar",
  "galaxy",
  "portal",
  "eden",
  "surface",
  "tauceti",
  "underground",
]);
function sourceAt(repository, ref, path) {
  return execFileSync("git", ["show", `${ref}:${path}`], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function extractGrants(ref) {
  const grants = new Map();
  for (const source of sources) {
    const file = ts.createSourceFile(
      source,
      sourceAt(upstream, ref, source),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node) {
      if (ts.isObjectLiteralExpression(node)) {
        const id = property(node, "id")?.initializer;
        const grant = property(node, "grant")?.initializer;
        if (
          id &&
          ts.isStringLiteral(id) &&
          grant &&
          ts.isArrayLiteralExpression(grant) &&
          buildRegions.has(id.text.split("-", 1)[0])
        ) {
          const [technology, level] = grant.elements;
          if (
            ts.isStringLiteral(technology) &&
            ts.isNumericLiteral(level) &&
            grant.elements.length === 2
          ) {
            const value = {
              technology: technology.text,
              completedAtLevel: Number(level.text),
            };
            const previous = grants.get(id.text);
            if (
              previous &&
              JSON.stringify(previous) !== JSON.stringify(value)
            ) {
              throw new Error(`Conflicting grant for ${id.text}`);
            }
            grants.set(id.text, value);
          } else {
            throw new Error(`Unsupported grant for ${id.text} in ${source}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  return grants;
}

function legacyManagedBindings() {
  const catalogPath = "src/game/entity-catalogs.ts";
  const statePath = "src/game/building-state.ts";
  const catalog = ts.createSourceFile(
    catalogPath,
    sourceAt(process.cwd(), legacyManagerCommit, catalogPath),
    ts.ScriptTarget.Latest,
    true,
  );
  const state = ts.createSourceFile(
    statePath,
    sourceAt(process.cwd(), legacyManagerCommit, statePath),
    ts.ScriptTarget.Latest,
    true,
  );
  const bindings = new Map();
  const managedNames = new Set();
  function visitCatalog(node) {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const action = node.initializer;
      if (
        ts.isNewExpression(action) &&
        ts.isIdentifier(action.expression) &&
        action.expression.text === "Action" &&
        action.arguments?.length >= 3 &&
        ts.isStringLiteral(action.arguments[1]) &&
        ts.isStringLiteral(action.arguments[2])
      ) {
        bindings.set(
          node.name.text,
          `${action.arguments[1].text}-${action.arguments[2].text}`,
        );
      }
    }
    ts.forEachChild(node, visitCatalog);
  }
  function visitState(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "priorityList" &&
      node.expression.name.text === "push"
    ) {
      for (const argument of node.arguments) {
        if (
          ts.isPropertyAccessExpression(argument) &&
          ts.isIdentifier(argument.expression) &&
          argument.expression.text === "buildings"
        ) {
          managedNames.add(argument.name.text);
        }
      }
    }
    ts.forEachChild(node, visitState);
  }
  visitCatalog(catalog);
  visitState(state);
  return new Set(
    [...managedNames].map((name) => bindings.get(name)).filter(Boolean),
  );
}

const grants = extractGrants(commit);
const initialGrants = extractGrants(initialGrantCommit);
const legacyManaged = legacyManagedBindings();
const entries = [...grants].sort(([a], [b]) => a.localeCompare(b, "en"));
const body = entries
  .map(
    ([id, grant]) =>
      `  ${JSON.stringify(id)}: { technology: ${JSON.stringify(grant.technology)}, completedAtLevel: ${grant.completedAtLevel}${initialGrants.has(id) && !legacyManaged.has(id) ? ", legacyUnmanaged: true" : ""} },`,
  )
  .join("\n");
const generated = await prettier.format(
  `// Generated by scripts/generate-captured-grant-actions.mjs from DeadSpace ${commit}.
// Captured panel discovery decides availability. Legacy ownership excludes actions the old BuildingManager did not manage.
export const CAPTURED_GRANT_ACTIONS: Readonly<Record<string, Readonly<{ technology: string; completedAtLevel: number; legacyUnmanaged?: boolean }>>> = Object.freeze({
${body}
});
`,
  { parser: "typescript" },
);
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== generated) {
    throw new Error("Captured grant manifest is stale; regenerate it");
  }
} else {
  writeFileSync(output, generated);
  console.log(`Generated ${entries.length} grant actions from ${commit}`);
}
