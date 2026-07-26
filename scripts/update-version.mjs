import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  replaceUserscriptVersion,
  validatePackageVersion,
} from "./versioning.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(root, "package.json");
const metadataPath = path.join(root, "src", "userscript.meta.js");

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const version = validatePackageVersion(packageJson.version);
const metadata = await readFile(metadataPath, "utf8");
const updatedMetadata = replaceUserscriptVersion(metadata, version);

if (updatedMetadata !== metadata) {
  await writeFile(metadataPath, updatedMetadata, "utf8");
}

await execFileAsync(process.execPath, ["build.mjs"], {
  cwd: root,
  stdio: "inherit",
});

console.log(`Userscript version synchronized to ${version}`);
