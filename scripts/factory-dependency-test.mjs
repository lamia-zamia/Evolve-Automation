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

const newArchitectureDirectories = new Set([
  "adapters",
  "application",
  "bootstrap",
  "domain",
  "ports",
]);
const legacyUtilityFiles = new Set(["config.ts", "collections.ts", "math.ts"]);
const factoryFiles = findTypeScriptFiles(sourceDirectory).filter((file) => {
  const [topLevelDirectory] = path
    .relative(sourceDirectory, file)
    .split(path.sep);
  return (
    !newArchitectureDirectories.has(topLevelDirectory) &&
    !legacyUtilityFiles.has(path.basename(file)) &&
    path.basename(file) !== "dependencies.ts" &&
    path.basename(file) !== "main.ts"
  );
});

const main = fs.readFileSync(mainPath, "utf8");

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

function getMainFactoryArguments(factoryName) {
  const marker = `${factoryName}({`;
  const factoryCall = main.indexOf(marker);
  if (factoryCall < 0) {
    throw new Error(`${factoryName}: main wiring not found`);
  }

  const start = factoryCall + marker.length;
  let depth = 1;
  let quote = null;
  let escape = false;
  for (let i = start; i < main.length; i++) {
    const character = main[i];
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
      return main.slice(start, i);
    }
  }
  throw new Error(`${factoryName}: unterminated main wiring`);
}

const contractFailures = [];
for (const file of factoryFiles) {
  const source = fs.readFileSync(file, "utf8");
  const signature = source.match(
    /export function (create\w+)\(\{([\s\S]*?)\}\s*(?::[^)]*)?\) \{/,
  );
  if (!signature) {
    contractFailures.push(
      `${path.relative(root, file)}: factory signature not parsed`,
    );
    continue;
  }

  const [, factoryName, parameters] = signature;
  const required = splitTopLevel(parameters).map((parameter) =>
    parameter.split("=")[0].trim(),
  );
  const supplied = new Set(
    splitTopLevel(getMainFactoryArguments(factoryName))
      .map((argument) => argument.match(/^([\w$]+)/)?.[1])
      .filter(Boolean),
  );
  const missing = required.filter((parameter) => !supplied.has(parameter));
  if (missing.length > 0) {
    contractFailures.push(
      `${path.relative(root, file)}: main wiring missing ${missing.join(", ")}`,
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
