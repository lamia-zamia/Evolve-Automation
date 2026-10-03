/**
 * One named function declaration out of the unminified bundle, braces included.
 *
 * The bundle is an IIFE of concatenated modules, so a function's source is delimited by its own
 * braces. A brace count that also steps over string literals, template literals and comments is what
 * keeps a `}` inside one of those from ending the search early. These pinned helpers contain no
 * regular expression literals.
 */
export function extractSnapshotFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`${name} is not in the snapshot`);
  let depth = 0;
  let opened = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === "/" && next === "/") {
      index = source.indexOf("\n", index);
      if (index < 0) throw new Error(`${name} has an unterminated comment`);
      continue;
    }
    if (character === "/" && next === "*") {
      index = source.indexOf("*/", index);
      if (index < 0) throw new Error(`${name} has an unterminated comment`);
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      index = skipLiteral(source, index);
      continue;
    }
    if (character === "{") {
      depth += 1;
      opened = true;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      if (opened && depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} has no closing brace`);
}

function skipLiteral(source, start) {
  const quote = source[start];
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === quote) return index;
  }
  throw new Error("an unterminated literal");
}
