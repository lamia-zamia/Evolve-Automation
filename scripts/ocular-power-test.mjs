import assert from "node:assert/strict";

import { createOcularPowerAdapter } from "../src/adapters/evolve/traits/ocular-power.ts";
import { runOcularPowerAutomation } from "../src/application/ocular-power.ts";
import { planOcularPowers } from "../src/domain/traits/ocular-power.ts";
import { createTraceRecorder } from "./test-support/modernization-fixtures.mjs";

const CATALOG = [
  { key: "d", id: "disintegration" },
  { key: "p", id: "petrification" },
  { key: "w", id: "wound" },
  { key: "t", id: "telekinesis" },
  { key: "f", id: "fear" },
  { key: "c", id: "charm" },
];
function createFixture(scenario) {
  const trace = createTraceRecorder();
  const capacity = scenario.capacity ?? 2;
  const config = Object.fromEntries(
    CATALOG.map((power) => [power.key, scenario.current?.[power.key] ?? false]),
  );
  const game = {
    global: {
      race: {
        ocular_power: scenario.trait ?? true,
        ocularPowerConfig: scenario.config === false ? undefined : config,
      },
    },
    traits: { ocular_power: { vars: () => [capacity, 100] } },
  };
  const settings = {};
  for (const power of CATALOG) {
    settings[`ocularPower_${power.id}`] =
      scenario.enabled?.[power.key] ?? false;
    settings[`ocularPower_p_${power.id}`] =
      scenario.priorities?.[power.key] ?? 0;
  }
  return {
    trace,
    game,
    settings,
    config,
    controlsAvailable: scenario.controlsAvailable !== false,
    traitVal: () => capacity,
  };
}

function createAutomation(fixture, overrides = {}) {
  const controls = {
    capture: () => true,
    current: (key) => fixture.config[key] ?? false,
    toggle: (id) => {
      if (fixture.controlsAvailable === false) return false;
      const power = CATALOG.find((candidate) => candidate.id === id);
      if (!power) return false;
      fixture.config[power.key] = !fixture.config[power.key];
      return true;
    },
  };
  const adapter = createOcularPowerAdapter({
    getGame: () => fixture.game,
    getSettings: overrides.getSettings ?? (() => fixture.settings),
    getPowerData: overrides.getPowerData ?? (() => CATALOG),
    controls,
  });
  return { reader: adapter.reader, executor: adapter.executor, controls };
}

assert.deepEqual(
  planOcularPowers({
    capacity: 1.5,
    powers: [
      { key: "a", id: "A", enabled: true, priority: 1 },
      { key: "b", id: "B", enabled: true, priority: 1 },
      { key: "c", id: "C", enabled: true, priority: 1 },
    ],
  }),
  [
    { key: "a", id: "A", enabled: true },
    { key: "b", id: "B", enabled: true },
    { key: "c", id: "C", enabled: false },
  ],
);

let settingsRead = false;
let catalogRead = false;
const lockedFixture = createFixture({ trait: false });
assert.equal(
  runOcularPowerAutomation(
    createAutomation(lockedFixture, {
      getSettings: () => {
        settingsRead = true;
        return {};
      },
      getPowerData: () => {
        catalogRead = true;
        return [];
      },
    }),
  ).status,
  "succeeded",
);
assert.equal(settingsRead, false);
assert.equal(catalogRead, false);

const malformedFixture = createFixture({ capacity: 1 });
malformedFixture.settings.ocularPower_p_disintegration = undefined;
const malformedAutomation = createAutomation(malformedFixture);
assert.throws(() => {
  malformedAutomation.reader.readGate();
  malformedAutomation.controls.capture();
  malformedAutomation.reader.readPlan();
}, /ocularPower_p_disintegration must be a finite number/);

const staleFixture = createFixture({
  capacity: 1,
  enabled: { d: true },
});
const staleAutomation = createAutomation(staleFixture);
assert.equal(staleAutomation.reader.readGate().unlocked, true);
assert.equal(staleAutomation.controls.capture(), true);
const [staleDecision] = planOcularPowers(staleAutomation.reader.readPlan());
staleFixture.game.global.race.ocular_power = false;
assert.equal(staleAutomation.executor.execute(staleDecision).status, "stale");
assert.deepEqual(staleFixture.trace.snapshot(), []);

const missingToggleFixture = createFixture({
  capacity: 1,
  enabled: { d: true },
  controlsAvailable: false,
});
const missingToggleOutcome = runOcularPowerAutomation(
  createAutomation(missingToggleFixture),
);
assert.equal(missingToggleOutcome.status, "stale");
assert.deepEqual(missingToggleFixture.trace.snapshot(), []);

const phaseFixture = createFixture({
  capacity: 1,
  enabled: { d: true },
});
const phaseAutomation = createAutomation(phaseFixture);
const phases = [];
assert.equal(
  runOcularPowerAutomation({
    controls: {
      capture() {
        phases.push("capture");
        return phaseAutomation.controls.capture();
      },
      current(key) {
        phases.push(`current:${key}`);
        return phaseAutomation.controls.current(key);
      },
      toggle(id) {
        phases.push(`toggle:${id}`);
        return phaseAutomation.controls.toggle(id);
      },
    },
    reader: {
      readGate() {
        phases.push("gate");
        return phaseAutomation.reader.readGate();
      },
      readPlan() {
        phases.push("plan-input");
        return phaseAutomation.reader.readPlan();
      },
    },
    executor: phaseAutomation.executor,
  }).status,
  "succeeded",
);
assert.deepEqual(phases.slice(0, 3), ["gate", "capture", "plan-input"]);

console.log(
  "Ocular-power domain, Evolve adapter, and application tests passed",
);
