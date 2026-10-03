/** Native Space region authority and its first-use protected draw on the unmodified real page. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as esbuild from "esbuild";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";
import {
  CIVIC_MAIN_TAB,
  CITY_SPACE_SUB_TAB,
  INNER_SYSTEM_SUB_TAB,
  truepathSave,
} from "./captured-syndicate-live-save.mjs";
import { nativeSpaceRegionIds } from "./space-region-native-fixture.mjs";

const regionLiveBundleDirectory = await mkdtemp(
  join(tmpdir(), "captured-space-region-"),
);
const regionLiveBundle = join(
  regionLiveBundleDirectory,
  "space-region.test.js",
);
await esbuild.build({
  absWorkingDir: process.cwd(),
  entryPoints: ["scripts/captured-syndicate-live-entry.ts"],
  outfile: regionLiveBundle,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["esnext"],
  banner: { js: await readFile(resolve("src/userscript.meta.js"), "utf8") },
  define: { __EA_TEST_SURFACE_ENABLED__: "true" },
  logLevel: "silent",
});

const regionLiveRunner = await createChromiumRunner();
const regionLiveFailures = [];
console.log(
  JSON.stringify({ gameSnapshot: regionLiveRunner.inputs.gameSnapshot }),
);
try {
  for (const tabs of [
    {
      label: "Civics / City",
      civTabs: CIVIC_MAIN_TAB,
      spaceTabs: CITY_SPACE_SUB_TAB,
      panel: "mTabCivic",
    },
    {
      label: "Civilization / Inner System",
      civTabs: 1,
      spaceTabs: INNER_SYSTEM_SUB_TAB,
      panel: "mTabCivil",
    },
  ]) {
    const save = truepathSave(
      parseSave(
        await readFile(
          resolve("test-artifacts/benchmark/saves/ds-steel-gate.json"),
          "utf8",
        ),
      ),
      tabs,
    );
    const session = await regionLiveRunner.openSession({
      bundle: regionLiveBundle,
      save,
      settings: {},
      seed: 42,
    });
    try {
      await session.advance(4);
      const facts = await session.evaluate(
        ([playerPanelId, regions]) => {
          const capture =
            globalThis[Symbol.for("evolve-automation.page-capture")];
          const hooks = globalThis.__EA_TEST_HOOKS__;
          const document = globalThis.document;
          if (!capture || typeof hooks?.readOuterFleetRegion !== "function")
            return { error: "native region hook unavailable" };
          const root = capture.rootState.readRoot();
          const playerPanel = document.getElementById(playerPanelId);
          const targetPanel = document.getElementById("mTabCivil");
          if (!playerPanel || !targetPanel || root?.race?.truepath !== 1)
            return { error: "disposable Truepath page not established" };
          // Force animated=true only after startup, so the test proves the protected draw disables and
          // restores it without leaving a delayed visual transition behind.
          root.settings.animated = true;
          const pageKeysDescriptor = Object.getOwnPropertyDescriptor(
            Object,
            "keys",
          );
          const playerMarkup = playerPanel.innerHTML;
          const scratchCount = () =>
            document.querySelectorAll(
              "[id^='ea-aside-'], [style*='left: -100000px'], .tabFading",
            ).length;
          const snapshot = () => {
            const current = Object.getOwnPropertyDescriptor(Object, "keys");
            return {
              civTabs: root.settings.civTabs,
              spaceTabs: root.settings.spaceTabs,
              animated: root.settings.animated,
              swaps: Object.fromEntries(
                capture.controlUsage
                  .readUsage()
                  .filter((usage) => usage.method === "swapTab")
                  .map((usage) => [usage.elementId, usage.returned]),
              ),
              playerNodeRestored:
                document.getElementById(playerPanelId) === playerPanel,
              targetNodeRestored:
                document.getElementById("mTabCivil") === targetPanel,
              playerMarkupRestored: playerPanel.innerHTML === playerMarkup,
              scratch: scratchCount(),
              keysDescriptorRestored:
                current !== undefined &&
                [
                  "value",
                  "get",
                  "set",
                  "configurable",
                  "enumerable",
                  "writable",
                ].every(
                  (field) => current[field] === pageKeysDescriptor[field],
                ),
            };
          };
          const start = snapshot();
          const steps = regions.map((region) => ({
            region,
            answer: hooks.readOuterFleetRegion(region),
            after: snapshot(),
          }));
          const repeated = regions.map((region) => ({
            region,
            answer: hooks.readOuterFleetRegion(region),
            after: snapshot(),
          }));

          // Change state on the captured live root and ask the retained upstream closures again.
          // No formula or module copy is supplied by this characterization.
          const mutateReadRestore = (record, key, value, region) => {
            const descriptor = Object.getOwnPropertyDescriptor(record, key);
            try {
              record[key] = value;
              return hooks.readOuterFleetRegion(region);
            } finally {
              if (descriptor === undefined) delete record[key];
              else Object.defineProperty(record, key, descriptor);
            }
          };
          const stateCases = {
            moonTidalDecay: mutateReadRestore(
              root.race,
              "tidal_decay",
              1,
              "spc_moon",
            ),
            moonOrbitDecay: mutateReadRestore(
              root.race,
              "orbit_decayed",
              1,
              "spc_moon",
            ),
            toggles: ["titan", "triton", "makemake", "eris"].map((setting) => ({
              region: `spc_${setting}`,
              disabled: mutateReadRestore(
                root.settings.space,
                setting,
                false,
                `spc_${setting}`,
              ),
              enabled: mutateReadRestore(
                root.settings.space,
                setting,
                true,
                `spc_${setting}`,
              ),
            })),
            titanNoParticipation: mutateReadRestore(
              root.tech,
              "enceladus",
              1,
              "spc_titan",
            ),
            enceladusNoParticipation: mutateReadRestore(
              root.tech,
              "titan",
              2,
              "spc_enceladus",
            ),
            after: snapshot(),
          };
          return { start, steps, repeated, stateCases };
        },
        [tabs.panel, nativeSpaceRegionIds],
      );
      console.log(JSON.stringify({ regionMetadata: tabs.label, facts }));
      assert.equal(facts.error, undefined, facts.error);
      assert.equal(facts.start.civTabs, tabs.civTabs);
      assert.equal(facts.start.spaceTabs, tabs.spaceTabs);
      const countDraws = (snapshot) =>
        Object.values(snapshot.swaps).reduce((sum, count) => sum + count, 0);
      const firstDrawCount =
        countDraws(facts.steps[0].after) - countDraws(facts.start);
      assert.equal(
        firstDrawCount,
        2,
        "one protected metadata capture draws the main tab and Inner System once",
      );
      for (const [index, step] of facts.steps.entries()) {
        assert.equal(
          step.answer.kind,
          "value",
          `${step.region} native metadata unavailable`,
        );
        assert.equal(
          countDraws(step.after),
          countDraws(facts.steps[0].after),
          `${step.region} spent another draw`,
        );
        assert.deepEqual(facts.repeated[index].answer, step.answer);
      }
      for (const after of [
        ...facts.steps.map((step) => step.after),
        ...facts.repeated.map((step) => step.after),
        facts.stateCases.after,
      ]) {
        assert.equal(after.civTabs, facts.start.civTabs);
        assert.equal(after.spaceTabs, facts.start.spaceTabs);
        assert.equal(after.animated, true);
        assert.equal(after.playerNodeRestored, true);
        assert.equal(after.targetNodeRestored, true);
        assert.equal(after.playerMarkupRestored, true);
        assert.equal(after.scratch, facts.start.scratch);
        assert.equal(after.keysDescriptorRestored, true);
        assert.equal(
          countDraws(after),
          countDraws(facts.steps[0].after),
          "cached metadata calls never redraw",
        );
      }
      for (const answer of [
        facts.stateCases.moonTidalDecay,
        facts.stateCases.moonOrbitDecay,
      ]) {
        assert.equal(answer.kind, "value");
        assert.equal(answer.value.reachable, false);
      }
      for (const toggle of facts.stateCases.toggles) {
        assert.equal(toggle.disabled.kind, "value");
        assert.equal(
          toggle.disabled.value.reachable,
          false,
          `${toggle.region} native settings gate`,
        );
        assert.equal(toggle.enabled.kind, "value");
        assert.equal(
          toggle.enabled.value.reachable,
          true,
          `${toggle.region} live closure follows enabled setting`,
        );
      }
      for (const answer of [
        facts.stateCases.titanNoParticipation,
        facts.stateCases.enceladusNoParticipation,
      ]) {
        assert.equal(answer.kind, "value");
        assert.equal(answer.value.reachable, true);
        assert.equal(answer.value.syndicateEnabled, false);
      }
    } catch (error) {
      regionLiveFailures.push({
        condition: tabs.label,
        failure: error.message,
      });
    } finally {
      await session.close();
    }
  }
} finally {
  await regionLiveRunner.close();
  await rm(regionLiveBundleDirectory, { recursive: true, force: true });
}
console.log(
  JSON.stringify({
    gameSnapshot: regionLiveRunner.inputs.gameSnapshot,
    failures: regionLiveFailures,
  }),
);
assert.deepEqual(regionLiveFailures, []);
console.log("Captured Space region live characterization passed");
