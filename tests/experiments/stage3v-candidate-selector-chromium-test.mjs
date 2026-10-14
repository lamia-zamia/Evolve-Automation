import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { createChromiumRunner } from "../../tools/chromium-evolve-runner.mjs";
import { readFreshGoalResourceStock } from "../../experiments/stage3s-smelter-intent.mjs";
import { selectGoalResourceCandidate } from "../../experiments/stage3v-candidate-selector.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const metadata = (
  await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
).trimEnd();
const built = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata}\n\nwindow.__EA_TEST_HOOKS__ = { ...(window.__EA_TEST_HOOKS__ ?? {}) };\nwindow.__EA_TEST_HOOKS__.selectGoalResourceCandidate = (${selectGoalResourceCandidate.toString()});\nwindow.__EA_TEST_HOOKS__.readFreshGoalResourceStock = (${readFreshGoalResourceStock.toString()});`,
  },
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
  },
  minifySyntax: true,
  treeShaking: true,
});
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/stage3v-selector-contract.user.js",
);
await mkdir(path.dirname(bundlePath), { recursive: true });
await writeFile(bundlePath, built.outputFiles[0].contents);

const runner = await createChromiumRunner({ game: gamePath });
try {
  const session = await runner.openSession({
    bundle: bundlePath,
    save: null,
    settings: { masterScriptToggle: true, autoSmelter: true },
    seed: 42,
  });
  try {
    const result = await session.evaluate(() => {
      const hooks = globalThis.__EA_TEST_HOOKS__;
      const offer = {
        elementId: "tech-steel_containers",
        generation: 17,
        grantTechnology: "steel_container",
        grantLevel: 1,
        cost: { Steel: 250, Knowledge: 9000 },
        nativeAffordable: false,
      };
      const catalog = {
        current: true,
        source: "shared-current-cycle",
        rootGeneration: 23,
        progressionEpoch: "native-cycle-4",
        offers: [offer],
        definitions: [
          {
            actionId: "tech-industrialization",
            prerequisites: {
              kind: "declared",
              requirements: [
                { technologyId: "steel_container", requiredLevel: 1 },
              ],
            },
            eligibility: { hasNativeCondition: false },
          },
        ],
        grantLevels: [["steel_container", 0]],
        applicability: [["tech-industrialization", { status: "eligible" }]],
      };
      const hooksWithCurrentNativeOffer = {
        readCurrentResearchCatalog: (actionId) =>
          actionId === "tech-industrialization" ? catalog : undefined,
      };
      const currentGame = { resource: { Steel: { amount: 10 } } };
      return hooks.selectGoalResourceCandidate({
        hooks: hooksWithCurrentNativeOffer,
        input: {
          initialised: true,
          steelDemanded: false,
          ironDemanded: false,
        },
        demand: { requestedQuantity: () => 0 },
        settings: { autoSmelter: true, productionSmelting: "required" },
        goalActionId: "tech-industrialization",
        currentGame,
        currentRootGeneration: 23,
        readFreshStock: hooks.readFreshGoalResourceStock,
      });
    });
    assert.equal(result.status, "intent-applied");
    assert.equal(result.actionId, "tech-steel_containers");
    assert.equal(result.resourceId, "Steel");
    assert.equal(result.currentQuantity, 10);
    assert.equal(result.shortfall, 240);
    assert.equal(result.freshness.offerGeneration, 17);
  } finally {
    await session.close();
  }
} finally {
  await runner.close();
}
