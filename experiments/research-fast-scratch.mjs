import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CALLBACK_SOURCE = `      old_techs[category].forEach(function(tech_name) {\n        addAction("tech", tech_name, true, false);\n      });`;
const SCRATCH_DRAW_SOURCE = `          let captureNativeDraw = () => mechanics.captureTechDefinitionsDuring(`;

export function patchResearchSnapshot(
  source,
  { suppressCompleted = true, instrument = true } = {},
) {
  if (source.split(CALLBACK_SOURCE).length !== 2)
    throw new Error(
      "Pinned drawTech completed-tech callback block was not unique",
    );
  if (!instrument)
    return source.replace(
      CALLBACK_SOURCE,
      suppressCompleted
        ? `      if (window.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__ !== true) {\n${CALLBACK_SOURCE}\n      }`
        : CALLBACK_SOURCE,
    );
  const trace = `        const researchTrace = window.__EA_RESEARCH_DRAW_TRACE__;\n        const completedTechCount = old_techs[category].length;\n        if (researchTrace) researchTrace.completed += completedTechCount;\n        const completedTechStarted = researchTrace ? window.__EA_RUNNER__.nativeNow() : 0;\n`;
  const countCallbacks = suppressCompleted
    ? "window.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__ !== true"
    : "true";
  const replacement = `${trace}${suppressCompleted ? "      if (window.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__ !== true) {\n" : ""}      old_techs[category].forEach(function(tech_name) {\n        addAction("tech", tech_name, true, false);\n      });${suppressCompleted ? "\n      }" : ""}\n      if (researchTrace) {\n        researchTrace.completedCallbackMs += window.__EA_RUNNER__.nativeNow() - completedTechStarted;\n        if (${countCallbacks}) researchTrace.callbackCount += completedTechCount;\n      }`;
  const patched = source.replace(CALLBACK_SOURCE, replacement);
  const traceHeader = "  function drawTech() {";
  if (patched.split(traceHeader).length !== 2)
    throw new Error("Pinned drawTech function was not unique");
  const tracedDraw = patched.replace(
    traceHeader,
    `${traceHeader}\n    const researchTrace = window.__EA_RESEARCH_DRAW_TRACE__;\n    if (researchTrace) researchTrace.draws += 1;`,
  );
  const oldCategoriesLoop = "    old_categories.forEach(function(category) {";
  if (tracedDraw.split(oldCategoriesLoop).length !== 2)
    throw new Error("Pinned drawTech old-category loop was not unique");
  return tracedDraw.replace(
    oldCategoriesLoop,
    `    if (researchTrace) {\n      researchTrace.offers += Object.values(new_techs).reduce((count, rows) => count + rows.length, 0);\n      researchTrace.latestOffers = Array.from(document.querySelectorAll("#tech .action"), (row) => {\n        const price = row.querySelector(".button");\n        return {\n          id: row.id,\n          classes: row.className,\n          priceAttributes: Object.fromEntries(Array.from(price?.attributes ?? []).filter((attribute) => attribute.name.startsWith("data-")).map((attribute) => [attribute.name, attribute.value])),\n        };\n      });\n    }\n${oldCategoriesLoop}`,
  );
}

export function patchOffersOnlyBundle(source) {
  if (source.split(SCRATCH_DRAW_SOURCE).length !== 2)
    throw new Error(
      "Offers-only scratch draw boundary was not unique in the bundle",
    );
  const wrapped = `          let captureNativeDraw = () => {\n            const previousScratchFlag = globalThis.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__;\n            if (!includeGranted) globalThis.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__ = true;\n            try {\n              return mechanics.captureTechDefinitionsDuring(`;
  const marker = `            computedRequirementsContext\n          );`;
  const close = `\n              computedRequirementsContext\n              );\n            } finally {\n              if (!includeGranted) {\n                if (previousScratchFlag === undefined) delete globalThis.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__;\n                else globalThis.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__ = previousScratchFlag;\n              }\n            }\n          };`;
  const start = source.indexOf(SCRATCH_DRAW_SOURCE);
  const end = source.indexOf(marker, start);
  if (end < 0 || source.indexOf(marker, end + marker.length) !== -1)
    throw new Error("Scratch draw closure was not uniquely bounded");
  return (
    source.slice(0, start) +
    wrapped +
    source.slice(start + SCRATCH_DRAW_SOURCE.length, end) +
    close +
    source.slice(end + marker.length)
  );
}

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function main() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 2)
    args.set(process.argv[index], process.argv[index + 1]);
  if (
    ["--baseline", "--experimental", "--bundle", "--experimental-bundle"].some(
      (key) => !args.has(key),
    )
  )
    throw new Error(
      "Pass --baseline, --experimental, --bundle and --experimental-bundle",
    );
  const baseline = resolve(args.get("--baseline"));
  const experimental = resolve(args.get("--experimental"));
  const bundle = resolve(args.get("--bundle"));
  const experimentalBundle = resolve(args.get("--experimental-bundle"));
  await mkdir(dirname(experimental), { recursive: true });
  await copyFile(baseline, experimental);
  const sidecar = JSON.parse(await readFile(`${baseline}.json`, "utf8"));
  await writeFile(
    `${experimental}.json`,
    `${JSON.stringify({ ...sidecar, experiment: "skip-completed-tech-callbacks" }, null, 2)}\n`,
  );
  const game = await readFile(experimental, "utf8");
  const patchedGame = patchResearchSnapshot(game);
  await writeFile(experimental, patchedGame);
  const minimalExperimental = args.get("--minimal-experimental");
  if (minimalExperimental) {
    const minimalPath = resolve(minimalExperimental);
    await mkdir(dirname(minimalPath), { recursive: true });
    await writeFile(
      minimalPath,
      patchResearchSnapshot(await readFile(baseline, "utf8"), {
        instrument: false,
      }),
    );
    await writeFile(
      `${minimalPath}.json`,
      `${JSON.stringify({ ...sidecar, experiment: "skip-completed-tech-callbacks-minimal" }, null, 2)}\n`,
    );
  }
  const traceBaseline = args.get("--trace-baseline");
  if (traceBaseline) {
    const traceGame = resolve(traceBaseline);
    await mkdir(dirname(traceGame), { recursive: true });
    await writeFile(
      traceGame,
      patchResearchSnapshot(await readFile(baseline, "utf8"), {
        suppressCompleted: false,
      }),
    );
    await writeFile(
      `${traceGame}.json`,
      `${JSON.stringify({ ...sidecar, experiment: "callback-tracing-only" }, null, 2)}\n`,
    );
  }
  const baselineBundle = await readFile(bundle, "utf8");
  const patchedBundle = patchOffersOnlyBundle(baselineBundle);
  await mkdir(dirname(experimentalBundle), { recursive: true });
  await writeFile(experimentalBundle, patchedBundle);
  console.log(
    JSON.stringify(
      {
        baseline: { path: baseline, sha256: hash(await readFile(baseline)) },
        experimental: { path: experimental, sha256: hash(patchedGame) },
        bundle: { path: bundle, sha256: hash(baselineBundle) },
        experimentalBundle: {
          path: experimentalBundle,
          sha256: hash(patchedBundle),
        },
      },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();
