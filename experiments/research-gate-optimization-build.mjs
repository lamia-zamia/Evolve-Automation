import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2)
  args.set(process.argv[index], process.argv[index + 1]);
const required = (name) => {
  const value = args.get(`--${name}`);
  if (!value) throw new Error(`missing --${name}`);
  return resolve(value);
};
const toolsDir =
  process.env.EA_TOOLS_DIR ??
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../Evolve-Automation/tools",
  );
const { patchResearchSnapshot } = await import(
  pathToFileURL(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "research-fast-scratch.mjs",
    ),
  ).href
);
const sourceGame = required("game");
const sourceBundle = required("bundle");
const outputDirectory = required("out-dir");
await mkdir(outputDirectory, { recursive: true });
const source = await readFile(sourceGame, "utf8");
const sidecar = JSON.parse(await readFile(`${sourceGame}.json`, "utf8"));
const patchedGame = patchResearchSnapshot(source, { instrument: false });
const patchedGamePath = resolve(outputDirectory, "c-patched-game.js");
await writeFile(patchedGamePath, patchedGame);
await writeFile(
  `${patchedGamePath}.json`,
  `${JSON.stringify({ ...sidecar, experiment: "research-offers-only-callback-bypass" }, null, 2)}\n`,
);

const bundle = await readFile(sourceBundle, "utf8");
const nativeDraw =
  "captureNativeDraw = () => mechanics.captureTechDefinitionsDuring(() => captureNativeDiscoveryDraw(), computedRequirementsContext);";
if (bundle.split(nativeDraw).length !== 2)
  throw new Error(
    "expected one native Research draw boundary in baseline bundle",
  );
const wrappedDraw =
  "captureNativeDraw = () => { const previousScratch = globalThis.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__; if (!includeGranted) globalThis.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__ = true; try { return mechanics.captureTechDefinitionsDuring(() => captureNativeDiscoveryDraw(), computedRequirementsContext); } finally { if (!includeGranted) { if (previousScratch === void 0) delete globalThis.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__; else globalThis.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__ = previousScratch; } } };";
const patchedBundle = bundle.replace(nativeDraw, wrappedDraw);
const patchedBundlePath = resolve(
  outputDirectory,
  "c-patched-userscript.user.js",
);
await writeFile(patchedBundlePath, patchedBundle);
const hash = (value) => createHash("sha256").update(value).digest("hex");
console.log(
  JSON.stringify(
    {
      sourceGame: { path: sourceGame, sha256: hash(source) },
      cGame: { path: patchedGamePath, sha256: hash(patchedGame) },
      sourceBundle: { path: sourceBundle, sha256: hash(bundle) },
      cBundle: { path: patchedBundlePath, sha256: hash(patchedBundle) },
    },
    null,
    2,
  ),
);
