const packageVersionPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function validatePackageVersion(version) {
  if (typeof version !== "string" || !packageVersionPattern.test(version)) {
    throw new TypeError(
      `package.json version must be npm-compatible SemVer, received ${JSON.stringify(version)}`,
    );
  }
  return version;
}

export function replaceUserscriptVersion(metadata, version) {
  let matches = 0;
  const updated = metadata
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s*\/\/\s*@version\s+)(\S+)(\s*)$/);
      if (!match) {
        return line;
      }
      matches += 1;
      return `${match[1]}${version}${match[3]}`;
    })
    .join("\n");

  if (matches !== 1) {
    throw new Error(
      `userscript metadata must contain exactly one @version line; found ${matches}`,
    );
  }
  return updated;
}
