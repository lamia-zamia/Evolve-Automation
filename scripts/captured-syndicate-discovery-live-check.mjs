/**
 * The first-use discovery path, characterized against the real page with the player off the tab.
 *
 * `captured-syndicate-live-check.mjs` covers what the Syndicate answer *is*. This covers how the
 * binding it is read through is obtained when nobody has ever been on the panel that draws it — the
 * case a unit test can only stub, because a stubbed `discover` proves the call shape and nothing about
 * the real page. This save starts on Civics with `tabLoad` off, so the game has never bound a `*synd`
 * element and the automation's own features have not drawn the Civilization panel either.
 *
 * The invariants are all about the player rather than about the number:
 *
 * - one protected draw of the panel that owns the readout reaches the binding, and it is a real
 *   `loadTab` rather than a shortcut past it;
 * - `settings.civTabs` and `settings.spaceTabs` are back to exactly what they were;
 * - the player's panel is the *same node*, with the same content and the same ids — the workspace
 *   hides a panel by aliasing ids rather than by detaching it, so a correct pass is invisible;
 * - nothing app-owned survives: the scratch container is gone, the panel it stood in for is the
 *   original node again, no id is still aliased, and the readout element itself is not in the document
 *   even though its captured closure still answers;
 * - `Number.prototype.toFixed` is the page's own property again, field for field;
 * - a second read of the same region costs no second draw and no second mount.
 *
 * One Inner System region and one Outer System region are characterized separately, because those are
 * two different Space sub-tabs and the draw has to reach each of them.
 *
 * Run with `node scripts/captured-syndicate-discovery-live-check.mjs`. Not part of `npm test`: it needs
 * the exact runner and a real page.
 */
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
  CITY_SPACE_SUB_TAB,
  CIVIC_MAIN_TAB,
  truepathSave,
} from "./captured-syndicate-live-save.mjs";

/** The player's panel, and the Civilization panel the discovery draw borrows as its scratch. */
const PLAYER_PANEL = "mTabCivic";
const TARGET_PANEL = "mTabCivil";

/** One region per Space sub-tab that draws readouts, so both topology branches are covered. */
const REGIONS = ["spc_red", "spc_titan"];

const save = truepathSave(
  parseSave(
    await readFile(
      resolve("test-artifacts/benchmark/saves/ds-steel-gate.json"),
      "utf8",
    ),
  ),
  { civTabs: CIVIC_MAIN_TAB, spaceTabs: CITY_SPACE_SUB_TAB },
);

const bundleDirectory = await mkdtemp(
  join(tmpdir(), "captured-syndicate-offtab-"),
);
const testBundle = join(bundleDirectory, "captured-syndicate.test.js");
const userscriptMetadata = await readFile(
  resolve("src/userscript.meta.js"),
  "utf8",
);
await esbuild.build({
  absWorkingDir: process.cwd(),
  entryPoints: ["scripts/captured-syndicate-live-entry.ts"],
  outfile: testBundle,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["esnext"],
  banner: { js: userscriptMetadata },
  define: { __EA_TEST_SURFACE_ENABLED__: "true" },
  logLevel: "silent",
});

const runner = await createChromiumRunner();
process.stdout.write(
  `${JSON.stringify({ gameSnapshot: runner.inputs.gameSnapshot })}\n`,
);
try {
  const session = await runner.openSession({
    bundle: testBundle,
    save,
    settings: {},
    seed: 42,
  });
  try {
    await session.advance(4);
    const facts = await session.evaluate(
      ([playerPanelId, targetPanelId, regions]) => {
        const capture =
          globalThis[Symbol.for("evolve-automation.page-capture")];
        const hooks = globalThis.__EA_TEST_HOOKS__;
        const document = globalThis.document;
        const failed = (message) => ({ error: message });
        if (
          !capture ||
          !hooks ||
          typeof hooks.readOuterFleetSyndicate !== "function"
        ) {
          return failed("the native Syndicate read is not available");
        }
        const root = capture.rootState.readRoot();
        if (root?.race?.truepath !== 1) {
          return failed(
            `captured race.truepath is ${String(root?.race?.truepath)}, not the 1 the pinned game writes`,
          );
        }
        /**
         * Held by identity for the whole run, so every claim below is a comparison against these two
         * nodes rather than a re-query that a rebuilt panel would satisfy just as well.
         */
        const playerPanel = document.getElementById(playerPanelId);
        const targetPanel = document.getElementById(targetPanelId);
        if (playerPanel === null || targetPanel === null) {
          return failed(
            `the page drew neither #${playerPanelId} nor #${targetPanelId}`,
          );
        }

        /**
         * A temporary Vue app is what the `mount: #mTabCivil` scope legitimately costs, so it is
         * counted rather than treated as a failure. What matters is that the count is bounded and does
         * not grow on a repeat read.
         */
        const mounts = { apps: 0 };
        const nativeCreateApp = globalThis.Vue?.createApp;
        if (globalThis.Vue !== undefined && nativeCreateApp !== undefined) {
          globalThis.Vue.createApp = new Proxy(nativeCreateApp, {
            apply(target, thisArg, args) {
              mounts.apps += 1;
              return Reflect.apply(target, thisArg, args);
            },
          });
        }
        /**
         * The prototype as it stands before any read. Compared inside the page, because a function
         * cannot cross the runner's serialization boundary and identity has to be judged here.
         */
        const nativeToFixed = Object.getOwnPropertyDescriptor(
          Number.prototype,
          "toFixed",
        );

        /**
         * Everything one Syndicate read could have cost the player, sampled synchronously around it.
         *
         * `draws` is the capture's own control ledger rather than a counter kept here, so a draw is
         * counted by the registry that performed it.
         */
        const snapshot = (region) => {
          const current = Object.getOwnPropertyDescriptor(
            Number.prototype,
            "toFixed",
          );
          return {
            civTabs: root.settings?.civTabs,
            spaceTabs: root.settings?.spaceTabs,
            captured: capture.controls.capturedElementIds(),
            draws: Object.fromEntries(
              capture.controlUsage
                .readUsage()
                .filter((usage) => usage.method === "swapTab")
                .map((usage) => [usage.elementId, usage.returned]),
            ),
            apps: mounts.apps,
            panelChildElements: playerPanel.childElementCount,
            panelInnerLength: playerPanel.innerHTML.length,
            panelIds: Array.from(
              playerPanel.querySelectorAll("[id]"),
              (node) => node.id,
            ),
            playerPanelIsSameNode:
              document.getElementById(playerPanelId) === playerPanel,
            targetPanelIsOriginal:
              document.getElementById(targetPanelId) === targetPanel,
            aliasedIds: document.querySelectorAll("[id^='ea-aside-']").length,
            readoutInDocument:
              document.getElementById(`${region}synd`) !== null,
            toFixedRestored:
              current !== undefined &&
              current.value === nativeToFixed?.value &&
              current.get === nativeToFixed?.get &&
              current.set === nativeToFixed?.set &&
              current.configurable === nativeToFixed?.configurable &&
              current.enumerable === nativeToFixed?.enumerable &&
              current.writable === nativeToFixed?.writable,
          };
        };

        try {
          const start = snapshot(regions[0]);
          const alreadyCaptured = start.captured.filter((id) =>
            id.endsWith("synd"),
          );
          if (alreadyCaptured.length > 0) {
            return failed(
              `a Syndicate readout was already captured: ${alreadyCaptured.join(", ")}`,
            );
          }
          const steps = [];
          for (const region of regions) {
            const first = hooks.readOuterFleetSyndicate(region);
            const afterFirst = snapshot(region);
            const second = hooks.readOuterFleetSyndicate(region);
            steps.push({
              region,
              first,
              afterFirst,
              second,
              afterSecond: snapshot(region),
            });
          }
          return { start, steps };
        } finally {
          if (globalThis.Vue !== undefined && nativeCreateApp !== undefined) {
            globalThis.Vue.createApp = nativeCreateApp;
          }
        }
      },
      [PLAYER_PANEL, TARGET_PANEL, REGIONS],
    );

    assert.equal(facts.error, undefined, facts.error);

    /** What one read cost, as a difference between two snapshots of the same page. */
    const spent = (before, after) => ({
      civTabs: [before.civTabs, after.civTabs],
      spaceTabs: [before.spaceTabs, after.spaceTabs],
      captured: after.captured.filter((id) => !before.captured.includes(id)),
      draws: Object.keys(after.draws).filter(
        (id) => after.draws[id] > (before.draws[id] ?? 0),
      ),
      apps: after.apps - before.apps,
      readoutInDocument: after.readoutInDocument,
      aliasedIds: after.aliasedIds,
      playerPanelIsSameNode: after.playerPanelIsSameNode,
      targetPanelIsOriginal: after.targetPanelIsOriginal,
      toFixedRestored: after.toFixedRestored,
    });

    const report = facts.steps.map((step, index) => {
      const before =
        index === 0 ? facts.start : facts.steps[index - 1].afterSecond;
      return {
        region: step.region,
        first: step.first,
        repeat: step.second,
        firstUse: spent(before, step.afterFirst),
        secondUse: spent(step.afterFirst, step.afterSecond),
      };
    });
    process.stdout.write(`${JSON.stringify({ offTabDiscovery: report })}\n`);

    // The starting state has to be the one this is about, or none of the rest proves anything.
    assert.equal(
      facts.start.civTabs,
      CIVIC_MAIN_TAB,
      "the player is on Civics",
    );
    assert.equal(
      facts.start.spaceTabs,
      CITY_SPACE_SUB_TAB,
      "the player is on City",
    );
    assert.deepEqual(facts.start.aliasedIds, 0);
    assert.equal(facts.start.readoutInDocument, false);

    for (const [index, step] of facts.steps.entries()) {
      const { region, first, afterFirst, second, afterSecond } = step;
      const before =
        index === 0 ? facts.start : facts.steps[index - 1].afterSecond;
      const label = `${region}: `;
      const readout = `${region}synd`;

      // A real native sample, not a refusal and not a stand-in, and the repeat agrees with it.
      assert.equal(first.kind, "value", `${label}${JSON.stringify(first)}`);
      assert.ok(Number.isFinite(first.value.p), `${label}p`);
      assert.ok(Number.isFinite(first.value.s), `${label}s`);
      assert.ok(first.value.p <= 1, `${label}p is above one`);
      assert.deepEqual(second, first, `${label}the repeat read disagreed`);

      // First use: one protected draw of the main tab and its Space sub-tab reached the binding.
      const discovery = spent(before, afterFirst);
      assert.ok(
        discovery.captured.includes(readout),
        `${label}#${readout} was not captured`,
      );
      assert.deepEqual(
        discovery.draws.sort(),
        ["#mainColumn div.content", "mTabCivil"],
        `${label}draws`,
      );
      assert.ok(
        discovery.apps >= 1,
        `${label}no temporary component was mounted`,
      );
      // The player's tabs are back to exactly what they were, at both levels.
      assert.deepEqual(
        discovery.civTabs,
        [CIVIC_MAIN_TAB, CIVIC_MAIN_TAB],
        `${label}civTabs`,
      );
      assert.deepEqual(
        discovery.spaceTabs,
        [CITY_SPACE_SUB_TAB, CITY_SPACE_SUB_TAB],
        `${label}spaceTabs`,
      );
      // The player's own panel is the same node, with the same content, still answering to its id.
      assert.equal(
        discovery.playerPanelIsSameNode,
        true,
        `${label}player panel node`,
      );
      assert.equal(
        afterFirst.panelChildElements,
        before.panelChildElements,
        `${label}player panel children`,
      );
      assert.equal(
        afterFirst.panelInnerLength,
        before.panelInnerLength,
        `${label}player panel markup`,
      );
      assert.deepEqual(
        afterFirst.panelIds,
        before.panelIds,
        `${label}player panel ids`,
      );
      // Nothing the draw created outlived it, and the captured closure works without it.
      assert.equal(
        discovery.readoutInDocument,
        false,
        `${label}readout element survived`,
      );
      assert.equal(
        discovery.targetPanelIsOriginal,
        true,
        `${label}scratch panel survived`,
      );
      assert.equal(discovery.aliasedIds, 0, `${label}an aliased id survived`);
      assert.equal(discovery.toFixedRestored, true, `${label}toFixed`);

      // Second use: the capture the capture already holds, at no cost at all.
      const repeat = spent(afterFirst, afterSecond);
      assert.deepEqual(repeat.draws, [], `${label}a second draw was spent`);
      assert.equal(repeat.apps, 0, `${label}a second mount was made`);
      assert.deepEqual(
        repeat.captured,
        [],
        `${label}a second read captured more`,
      );
      assert.equal(
        repeat.playerPanelIsSameNode,
        true,
        `${label}player panel node`,
      );
      assert.equal(
        repeat.targetPanelIsOriginal,
        true,
        `${label}scratch panel survived`,
      );
      assert.equal(repeat.aliasedIds, 0, `${label}an aliased id survived`);
      assert.equal(repeat.toFixedRestored, true, `${label}toFixed`);
    }
  } finally {
    await session.close();
  }
} finally {
  await runner.close();
  await rm(bundleDirectory, { recursive: true, force: true });
}

console.log("Captured Syndicate off-tab discovery characterization passed");
