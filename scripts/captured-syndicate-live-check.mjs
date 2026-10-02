/**
 * The running game's own Truepath Syndicate result, characterized against the real page.
 *
 * Everything here is deliberately written as "change the save's state, watch the game's answer move".
 * No expected value is computed here: the deleted replica's arithmetic is what this slice exists to
 * stop believing, so asserting it would reinstate it. What each case proves is that the answer the
 * automation now receives belongs to the running game — that it is one module instance reading one
 * live `global`, and that it covers rules the deleted tables got wrong.
 *
 * Run with `node scripts/captured-syndicate-live-check.mjs`. Not part of `npm test`: it needs the
 * exact runner and a real page.
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
import { truepathSave } from "./captured-syndicate-live-save.mjs";

const save = truepathSave(
  parseSave(
    await readFile(
      resolve("test-artifacts/benchmark/saves/ds-steel-gate.json"),
      "utf8",
    ),
  ),
);

const bundleDirectory = await mkdtemp(join(tmpdir(), "captured-syndicate-"));
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
    const facts = await session.evaluate(() => {
      const capture = globalThis[Symbol.for("evolve-automation.page-capture")];
      const hooks = globalThis.__EA_TEST_HOOKS__;
      if (
        !capture ||
        !hooks ||
        typeof hooks.readOuterFleetSyndicate !== "function"
      ) {
        return { error: "the native Syndicate read is not available" };
      }
      const root = capture.rootState.readRoot();
      const read = (region) => hooks.readOuterFleetSyndicate(region);
      const nativeToFixed = Object.getOwnPropertyDescriptor(
        Number.prototype,
        "toFixed",
      );

      // Everything a probe could be accused of leaving behind, counted across the whole run below.
      const counts = { workers: 0, apps: 0, intervals: 0, globals: [] };
      const nativeWorker = globalThis.Worker;
      const nativeCreateApp = globalThis.Vue?.createApp;
      const nativeSetInterval = globalThis.setInterval;
      globalThis.Worker = new Proxy(nativeWorker, {
        construct(target, args) {
          counts.workers += 1;
          return Reflect.construct(target, args);
        },
      });
      if (globalThis.Vue !== undefined) {
        globalThis.Vue.createApp = new Proxy(nativeCreateApp, {
          apply(target, thisArg, args) {
            counts.apps += 1;
            return Reflect.apply(target, thisArg, args);
          },
        });
      }
      globalThis.setInterval = new Proxy(nativeSetInterval, {
        apply(target, thisArg, args) {
          counts.intervals += 1;
          return Reflect.apply(target, thisArg, args);
        },
      });
      const before = Object.keys(globalThis);

      try {
        const syndicate = root?.space?.syndicate ?? {};
        const regions = Object.keys(syndicate).filter((region) =>
          region.startsWith("spc_"),
        );
        const region = regions[0];
        if (region === undefined) {
          return { error: "the save carries no Syndicate regions" };
        }
        const ships = root?.space?.shipyard?.ships;
        const shipyard = Array.isArray(ships)
          ? {
              count: ships.length,
              hull: ships[0]?.class,
              weapon: ships[0]?.weapon,
            }
          : { count: 0 };
        // The representation the pinned game itself writes, on the live root the read below consults.
        // Checked before the first read rather than inferred from one: a gate that demanded the
        // boolean `true` would answer "inactive" here, and every assertion below would then be
        // asserting the native default instead of the game's calculation.
        const truepath = root?.race?.truepath;
        if (truepath !== 1) {
          return {
            error: `captured race.truepath is ${String(truepath)}, not the 1 the pinned game writes`,
          };
        }
        const baseline = read(region);
        const baselinePiracy = syndicate[region];

        // What the game's own readout returns and what it rounded, so a failure below names which
        // half of the contract moved rather than only that the sample was refused.
        const readoutId = `${region}synd`;
        const readout = capture.controls.resolve(readoutId);
        const observation = readout
          ? capture.mechanics.readRoundedValues(() => {
              capture.controls.invoke(readout, "scan", [region]);
            })
          : { kind: "absent", noControl: true };
        const readoutResult = readout
          ? capture.controls.invoke(readout, "scan", [region])
          : undefined;

        // 1. The answer follows the save's own piracy. This is the "one live `global`, not a second
        //    one" proof: a second module instance would read a second `global` that nothing here
        //    mutates, and would keep answering with the original number.
        const raised = Math.round(Number(baselinePiracy)) + 4321;
        syndicate[region] = raised;
        const afterPiracy = read(region);
        syndicate[region] = baselinePiracy;
        const restored = read(region);

        // 2. Shadow at 5 shuts the game's Syndicate off entirely, and the game answers with its own
        //    default rather than with a defended region. The deleted replica had no such gate and
        //    would have kept producing a ratio.
        const shadowBefore = root.tech.shadow;
        root.tech.shadow = 5;
        const afterShadow = read(region);
        root.tech.shadow = shadowBefore;
        const afterShadowRestore = read(region);

        // 3. A Gauss-armed hull parked at the region is defense the deleted weapon table had no
        //    entry for at all. `shipDockedAt` reads `ship.location.id`, so the ship is written the
        //    way modern upstream stores it.
        const gaussRead = Array.isArray(ships) ? readWithShip() : null;

        function readWithShip() {
          if (!Array.isArray(ships)) return null;
          const ship = {
            class: "destroyer",
            weapon: "gauss",
            sensor: "radar",
            damage: 0,
            fueled: true,
            location: { id: region },
          };
          ships.push(ship);
          const withShip = read(region);
          ships.pop();
          const afterShip = read(region);
          return { withShip, afterShip, hull: ship };
        }

        // 4. A hull's sensor reach is the game's own, and depends on the hull. The same radar on a
        //    destroyer and on a corvette is two different reaches, which the deleted table's one
        //    number per sensor could not express.
        const hull = Array.isArray(ships) ? ships[0] : undefined;
        let hullRange;
        let sensorUpgrade;
        if (hull !== undefined) {
          const classBefore = hull.class;
          hull.class = "corvette";
          const onCorvette = read(region);
          hull.class = classBefore;
          hullRange = {
            onDestroyer: baseline,
            onCorvette,
            afterHull: read(region),
          };

          // 5. Improved Sensors is a yard technology the game owns (`syard_sensor >= 5`), and it
          //    moves the game's own reading of a hull that carries a passive radar. Setting the
          //    technology is the save changing its own mind; nothing here knows what it is worth.
          const sensorBefore = hull.sensor;
          const sensorTechBefore = root.tech.syard_sensor;
          hull.sensor = "visual";
          const onVisual = read(region);
          root.tech.syard_sensor = 5;
          const onImprovedSensors = read(region);
          root.tech.syard_sensor = sensorTechBefore;
          hull.sensor = sensorBefore;
          sensorUpgrade = {
            onVisual,
            onImprovedSensors,
            afterUpgrade: read(region),
          };
        }

        const restoredToFixed = Object.getOwnPropertyDescriptor(
          Number.prototype,
          "toFixed",
        );
        return {
          region,
          regions,
          truepath,
          shipyard,
          baseline,
          observation,
          readoutResult,
          afterPiracy,
          restored,
          raisedPiracy: raised,
          afterShadow,
          afterShadowRestore,
          gaussRead,
          hullRange,
          sensorUpgrade,
          toFixedRestored:
            restoredToFixed?.value === nativeToFixed?.value &&
            restoredToFixed?.get === nativeToFixed?.get &&
            restoredToFixed?.set === nativeToFixed?.set &&
            restoredToFixed?.configurable === nativeToFixed?.configurable &&
            restoredToFixed?.enumerable === nativeToFixed?.enumerable &&
            restoredToFixed?.writable === nativeToFixed?.writable,
          counts,
          newGlobals: Object.keys(globalThis).filter(
            (name) => !before.includes(name),
          ),
          leaks: [
            "syndicate",
            "syndicateActive",
            "shipCrewSize",
            "shipAttackPower",
            "sensorRange",
            "truepath",
            "ships",
            "__eaSyndicate",
          ].filter((name) => Object.hasOwn(globalThis, name)),
          shipSample: Array.isArray(ships)
            ? {
                keys: Object.keys(ships[0] ?? {}),
                locationIsPoint:
                  ships[0] !== undefined &&
                  typeof ships[0]?.location === "object" &&
                  ships[0]?.location !== null,
              }
            : undefined,
        };
      } finally {
        globalThis.Worker = nativeWorker;
        if (globalThis.Vue !== undefined)
          globalThis.Vue.createApp = nativeCreateApp;
        globalThis.setInterval = nativeSetInterval;
      }
    });

    assert.equal(facts.error, undefined, facts.error);
    process.stdout.write(`${JSON.stringify({ nativeSyndicate: facts })}\n`);

    // The answer is a real sample, not a refusal and not a stand-in, read over the representation the
    // pinned game writes.
    assert.equal(facts.truepath, 1);
    assert.equal(facts.baseline.kind, "value", JSON.stringify(facts.baseline));
    assert.ok(Number.isFinite(facts.baseline.value.p));
    assert.ok(Number.isFinite(facts.baseline.value.s));
    assert.ok(facts.baseline.value.p <= 1);

    // One live `global`: the save's own piracy moves the game's own answer, and restoring it returns
    // the original answer exactly.
    assert.equal(facts.afterPiracy.kind, "value");
    assert.notEqual(facts.afterPiracy.value.p, facts.baseline.value.p);
    assert.deepEqual(facts.restored, facts.baseline);

    // Shadow 5 is the game's own shutdown, and the native inactive answer is not "unavailable".
    assert.deepEqual(facts.afterShadow, {
      kind: "value",
      value: { p: 1, s: 0 },
    });
    assert.deepEqual(facts.afterShadowRestore, facts.baseline);

    // A Gauss-armed hull is defense the deleted weapon table could not represent at all, and it
    // counts because modern upstream reads `ship.location.id` rather than comparing the field
    // itself to a region name.
    assert.notEqual(
      facts.gaussRead,
      null,
      "the disposable save has a hull to read",
    );
    assert.equal(facts.gaussRead.withShip.kind, "value");
    assert.notEqual(facts.gaussRead.withShip.value.p, facts.baseline.value.p);
    assert.notEqual(facts.gaussRead.withShip.value.s, facts.baseline.value.s);
    assert.deepEqual(facts.gaussRead.afterShip, facts.baseline);
    assert.equal(facts.shipSample.locationIsPoint, true);

    // The hull's own sensor reach: one radar, two hulls, two reaches. The deleted table held one
    // number per sensor and could not tell them apart.
    assert.notEqual(facts.hullRange, undefined);
    assert.notEqual(
      facts.hullRange.onCorvette.value.s,
      facts.hullRange.onDestroyer.value.s,
    );
    assert.deepEqual(facts.hullRange.afterHull, facts.baseline);

    // Improved Sensors is a yard technology the game owns, and it moves the game's own reading.
    assert.notEqual(facts.sensorUpgrade, undefined);
    assert.notEqual(
      facts.sensorUpgrade.onImprovedSensors.value.s,
      facts.sensorUpgrade.onVisual.value.s,
    );
    assert.deepEqual(facts.sensorUpgrade.afterUpgrade, facts.baseline);

    // The game's own rounding, both halves, read out of the readout itself: the four-digit string
    // `syndicate()` builds its ratio from, and the one-digit one its own scan display formats.
    assert.equal(facts.observation.kind, "value");
    const ratioRounding = facts.observation.value.filter(
      (value) => value.digits === 4,
    );
    const scanRounding = facts.observation.value.filter(
      (value) => value.digits === 1,
    );
    assert.equal(ratioRounding.length, 1);
    assert.equal(scanRounding.length, 1);
    assert.equal(
      facts.baseline.value.p,
      1 - Number(ratioRounding[0].text),
      "p is one minus the ratio the game itself rounded",
    );
    assert.equal(
      facts.baseline.value.s,
      scanRounding[0].receiver * 1.25 - 25,
      "s comes from the value the game's own display rounded",
    );
    assert.equal(facts.readoutResult.ok, true);

    // Nothing the read did outlived it.
    assert.equal(facts.toFixedRestored, true);
    assert.equal(facts.counts.workers, 0);
    assert.deepEqual(facts.counts, {
      workers: 0,
      apps: 0,
      intervals: 0,
      globals: [],
    });
    assert.deepEqual(facts.newGlobals, []);
    assert.deepEqual(facts.leaks, []);
  } finally {
    await session.close();
  }
} finally {
  await runner.close();
  await rm(bundleDirectory, { recursive: true, force: true });
}

console.log("Captured Syndicate live characterization passed");
