import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceDirectory = path.join(root, "src");
const mainPath = path.join(
  root,
  "src",
  "adapters",
  "evolve",
  "evolve-runtime.js",
);

function findTypeScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? findTypeScriptFiles(entryPath)
      : entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")
        ? [entryPath]
        : [];
  });
}

// This audit covers only the layers the runtime composes with a destructured dependency object.
// The layered architecture folders are audited by scripts/architecture-boundaries-test.mjs
// instead, and the dependency-free shared folders may not take a wired dependency at all, so a
// `create*` export there is a plain helper factory rather than a composition seam.
const auditedElsewhereDirectories = new Set([
  "adapters",
  "application",
  "bootstrap",
  "domain",
  "ports",
  "formatting",
  "utils",
  "validation",
]);
const sharedRootFiles = new Set(["config.ts"]);
const factoryFiles = findTypeScriptFiles(sourceDirectory).filter((file) => {
  const [topLevelDirectory] = path
    .relative(sourceDirectory, file)
    .split(path.sep);
  return (
    !auditedElsewhereDirectories.has(topLevelDirectory) &&
    !sharedRootFiles.has(path.basename(file)) &&
    path.basename(file) !== "dependencies.ts" &&
    path.basename(file) !== "main.ts"
  );
});

const main = fs.readFileSync(mainPath, "utf8");
// A factory is usually wired by the runtime, but one legacy-layer factory may also compose another.
// Either call site proves the dependency contract is fully supplied, so both are searched.
const compositionSources = [
  main,
  ...factoryFiles.map((file) => fs.readFileSync(file, "utf8")),
];

function splitTopLevel(text) {
  const parts = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;
  let quote = null;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quote) {
      if (escape) {
        escape = false;
      } else if (character === "\\") {
        escape = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if (character === "(") {
      round++;
    } else if (character === ")") {
      round--;
    } else if (character === "[") {
      square++;
    } else if (character === "]") {
      square--;
    } else if (character === "{") {
      curly++;
    } else if (character === "}") {
      curly--;
    } else if (
      character === "," &&
      round === 0 &&
      square === 0 &&
      curly === 0
    ) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function getFactoryArguments(factoryName) {
  const marker = `${factoryName}({`;
  const source = compositionSources.find(
    (candidate) => candidate.indexOf(marker) >= 0,
  );
  if (source === undefined) {
    throw new Error(`${factoryName}: wiring not found`);
  }

  const start = source.indexOf(marker) + marker.length;
  let depth = 1;
  let quote = null;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const character = source[i];
    if (quote) {
      if (escape) {
        escape = false;
      } else if (character === "\\") {
        escape = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if (character === "{") {
      depth++;
    } else if (character === "}" && --depth === 0) {
      return source.slice(start, i);
    }
  }
  throw new Error(`${factoryName}: unterminated wiring`);
}

const contractFailures = [];
for (const file of factoryFiles) {
  const source = fs.readFileSync(file, "utf8");
  // The destructured parameter object is what this audit checks. A factory may
  // annotate its return type, so anything between the closing parenthesis and
  // the body brace is skipped.
  const signature = source.match(
    /export function (create\w+)\(\{([\s\S]*?)\}\s*(?::[^)]*)?\)\s*(?::[^{]*)?\{/,
  );
  if (!signature) {
    // A module that declares no factory at all is a type-only or helper module and has no
    // dependency contract to audit. A declared factory whose signature will not parse is still
    // a failure.
    if (/export function create\w+\(/.test(source)) {
      contractFailures.push(
        `${path.relative(root, file)}: factory signature not parsed`,
      );
    }
    continue;
  }

  const [, factoryName, parameters] = signature;
  const required = splitTopLevel(parameters).map((parameter) =>
    parameter.split("=")[0].trim(),
  );
  const supplied = new Set(
    splitTopLevel(getFactoryArguments(factoryName))
      .map((argument) => argument.match(/^([\w$]+)/)?.[1])
      .filter(Boolean),
  );
  const missing = required.filter((parameter) => !supplied.has(parameter));
  if (missing.length > 0) {
    contractFailures.push(
      `${path.relative(root, file)}: wiring missing ${missing.join(", ")}`,
    );
  }
}

if (contractFailures.length > 0) {
  throw new Error(
    `Factory dependency audit failed:\n${contractFailures.join("\n")}`,
  );
}

console.log(
  `Factory dependency audits passed (${factoryFiles.length} factories)`,
);
