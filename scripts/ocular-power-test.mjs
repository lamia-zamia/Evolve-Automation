import assert from "node:assert/strict";

import { createOcularPowerControls } from "../src/adapters/browser/ocular-power-controls.ts";
import { createOcularPowerAdapter } from "../src/adapters/evolve/ocular-power.ts";
import { runOcularPowerAutomation } from "../src/application/ocular-power.ts";
import { planOcularPowers } from "../src/domain/traits/ocular-power.ts";
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

const CATALOG = [
  { key: "d", id: "disintegration" },
  { key: "p", id: "petrification" },
  { key: "w", id: "wound" },
  { key: "t", id: "telekinesis" },
  { key: "f", id: "fear" },
  { key: "c", id: "charm" },
];
const CANONICAL_KEYS = CATALOG.map((power) => power.key);

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
  const enforceCapacity = (clickedKey) => {
    let active = 0;
    for (const key of CANONICAL_KEYS) {
      if (config[key]) active++;
      if (active > capacity && key !== clickedKey) {
        config[key] = false;
        trace.stateChange("ocular-power", { key, enabled: false });
      }
    }
    if (active > capacity) {
      active = 0;
      for (const key of [...CANONICAL_KEYS].reverse()) {
        if (config[key]) active++;
        if (active > capacity && key !== clickedKey) {
          config[key] = false;
          trace.stateChange("ocular-power", { key, enabled: false });
        }
      }
    }
  };
  const elements = Object.fromEntries(
    CATALOG.map((power) => [
      `ocular${power.id}`,
      {
        querySelector(selector) {
          assert.equal(selector, "input");
          return {
            click() {
              trace.managerCall("click", { id: power.id });
              trace.command("toggle-ocular-power", {
                key: power.key,
                id: power.id,
              });
              config[power.key] = !config[power.key];
              trace.stateChange("ocular-power", {
                key: power.key,
                enabled: config[power.key],
              });
              enforceCapacity(power.key);
            },
          };
        },
      },
    ]),
  );
  const document = {
    getElementById(id) {
      return elements[id] ?? null;
    },
  };
  return {
    trace,
    game,
    settings,
    config,
    document,
    getVueById: (id) =>
      id === "ocularPower" && scenario.panel !== false ? config : undefined,
    traitVal: () => capacity,
  };
}

// Exact copy of the deleted controller, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const { game, settings, document, traitVal } = fixture;
  const ocularPowerData = CATALOG;
  if (
    !game.global.race["ocular_power"] ||
    !game.global.race["ocularPowerConfig"]
  ) {
    return fixture.trace.snapshot();
  }

  const vue = fixture.getVueById("ocularPower");
  if (!vue) return fixture.trace.snapshot();

  const powerCap = traitVal("ocular_power", 0);
  if (powerCap < 1) return fixture.trace.snapshot();

  const allPowers = ocularPowerData
    .map((power) => ({
      key: power.key,
      id: power.id,
      enabled: Boolean(settings[`ocularPower_${power.id}`]),
      priority: Number(settings[`ocularPower_p_${power.id}`]),
    }))
    .sort((left, right) => right.priority - left.priority);
  let enabledPowers = 0;
  allPowers.forEach((power) => {
    const enable = power.enabled && enabledPowers < powerCap;
    if (enable) enabledPowers++;
    if (vue[power.key] !== enable) {
      document
        .getElementById(`ocular${power.id}`)
        .querySelector("input")
        .click();
    }
  });
  return fixture.trace.snapshot();
}

function createAutomation(fixture, overrides = {}) {
  const controls = createOcularPowerControls({
    getVueById: fixture.getVueById,
    getDocument: () => fixture.document,
  });
  const adapter = createOcularPowerAdapter({
    getGame: () => fixture.game,
    getSettings: overrides.getSettings ?? (() => fixture.settings),
    getPowerData: overrides.getPowerData ?? (() => CATALOG),
    controls,
  });
  return { reader: adapter.reader, executor: adapter.executor, controls };
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  runOcularPowerAutomation(createAutomation(fixture));
  return fixture.trace.snapshot();
}

const dualRunScenarios = [
  { name: "trait locked", trait: false },
  { name: "configuration locked", config: false },
  { name: "panel missing", panel: false },
  { name: "capacity below one", capacity: 0 },
  {
    name: "disable active powers",
    current: { d: true, p: true },
  },
  {
    name: "highest enabled priority wins",
    capacity: 1,
    enabled: { d: true, c: true },
    priorities: { d: 1, c: 10 },
  },
  {
    name: "equal priorities preserve catalog order",
    capacity: 2,
    enabled: { d: true, p: true, w: true },
    priorities: { d: 5, p: 5, w: 5 },
  },
  {
    name: "disabled high priority does not consume capacity",
    capacity: 1,
    enabled: { p: true },
    priorities: { d: 100, p: 1 },
  },
  {
    name: "numeric string priorities retain conversion",
    capacity: 1,
    enabled: { d: true, p: true },
    priorities: { d: "2", p: "10" },
  },
  {
    name: "earlier click auto-disables later power",
    capacity: 1,
    current: { d: true },
    enabled: { c: true },
    priorities: { c: 10, d: 1 },
  },
];

for (const scenario of dualRunScenarios) {
  assertEquivalentTraces({
    legacy: runLegacy(scenario),
    modern: runModern(scenario),
    label: `ocular power ${scenario.name}`,
  });
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
});
missingToggleFixture.document.getElementById = () => null;
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
  `Ocular-power domain, Evolve/browser adapters, application, and parity tests passed (${dualRunScenarios.length} dual-run scenarios)`,
);
