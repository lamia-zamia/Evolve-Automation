import assert from "node:assert/strict";

import { createMercenaryAdapter } from "../src/adapters/evolve/combat/mercenary.ts";
import { runMercenaryAutomation } from "../src/application/mercenary.ts";
import {
  planMercenaryCycle,
  planMercenaryHire,
  planMercenaryLog,
} from "../src/domain/combat/mercenary.ts";
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

function createFixture(scenario) {
  const trace = createTraceRecorder();
  let currentSoldiers = scenario.currentSoldiers ?? 0;
  let hireCount = 0;
  let moneyCurrent = scenario.moneyCurrent ?? 1_000;
  const moneyRequested = scenario.moneyRequested ?? 0;
  const costs = scenario.costs ?? [scenario.cost ?? 10];
  const Money = {
    maxQuantity: scenario.moneyMaximum ?? 1_000,
    storageRequired: scenario.moneyStorageRequired ?? 0,
    get currentQuantity() {
      return moneyCurrent;
    },
    set currentQuantity(value) {
      moneyCurrent = value;
      trace.stateChange("resource-cache", {
        resourceId: "Money",
        quantity: value,
      });
    },
    get spareQuantity() {
      return moneyCurrent - moneyRequested;
    },
  };
  const WarManager = {
    _garrisonVue: scenario.garrisonView === false ? undefined : {},
    isMercenaryUnlocked: () => scenario.unlocked ?? true,
    maxCityGarrison: scenario.maxCityGarrison ?? 2,
    maxSoldiers: scenario.maxSoldiers ?? 2,
    get currentSoldiers() {
      return currentSoldiers;
    },
    get mercenaryCost() {
      return costs[Math.min(hireCount, costs.length - 1)];
    },
    hireMercenary() {
      trace.managerCall("WarManager.hireMercenary", {
        attempt: hireCount + 1,
      });
      if (scenario.managerStopsAt === hireCount) return false;
      const cost = this.mercenaryCost;
      if (currentSoldiers >= this.maxSoldiers || Money.currentQuantity < cost) {
        return false;
      }
      trace.command("hire-mercenary", { cost });
      Money.currentQuantity -= cost;
      currentSoldiers++;
      hireCount++;
      trace.stateChange("garrison", { currentSoldiers });
      return true;
    },
  };
  const state = {
    goal: scenario.goal ?? "Normal",
    moneyMedian: scenario.moneyMedian ?? 100,
  };
  const settings = {
    foreignHireMercDeadSoldiers: scenario.deadSoldierReserve ?? 0,
    foreignHireMercCostLowerThanIncome: scenario.costIncomeMultiplier ?? 1,
    foreignHireMercMoneyStoragePercent: scenario.moneyStoragePercent ?? 0,
    storageAssignExtra: scenario.storageAssignExtra ?? false,
  };
  const resources = { Money };
  const GameLog = {
    logSuccess(id, message, categories) {
      trace.managerCall("GameLog.logSuccess", { id });
      trace.log(id, { message, categories });
    },
  };
  return {
    trace,
    WarManager,
    state,
    settings,
    resources,
    GameLog,
    shouldSaveInflationMoney: () => scenario.saveInflationMoney ?? false,
  };
}

// Exact copy of the deleted controller, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const { WarManager, state, settings, resources, GameLog } = fixture;
  const manager = WarManager;
  if (
    !manager._garrisonVue ||
    !manager.isMercenaryUnlocked() ||
    manager.maxCityGarrison <= 0
  ) {
    return fixture.trace.snapshot();
  }
  if (fixture.shouldSaveInflationMoney() && state.goal !== "Reset") {
    return fixture.trace.snapshot();
  }

  let mercenaryCost = manager.mercenaryCost;
  let mercenariesHired = 0;
  let mercenaryMax = manager.maxSoldiers - settings.foreignHireMercDeadSoldiers;
  let maxCost = state.moneyMedian * settings.foreignHireMercCostLowerThanIncome;
  let minMoney = Math.max(
    (resources.Money.maxQuantity *
      settings.foreignHireMercMoneyStoragePercent) /
      100,
    Math.min(
      resources.Money.maxQuantity - maxCost,
      settings.storageAssignExtra
        ? resources.Money.storageRequired / 1.03
        : resources.Money.storageRequired,
    ),
  );
  if (state.goal === "Reset") {
    mercenaryMax = manager.maxSoldiers;
    minMoney = 0;
    maxCost = Number.MAX_SAFE_INTEGER;
  }
  while (
    manager.currentSoldiers < mercenaryMax &&
    resources.Money.currentQuantity >= mercenaryCost &&
    (resources.Money.spareQuantity - mercenaryCost > minMoney ||
      mercenaryCost < maxCost) &&
    manager.hireMercenary()
  ) {
    mercenariesHired++;
    mercenaryCost = manager.mercenaryCost;
  }

  if (mercenariesHired === 1) {
    GameLog.logSuccess("mercenary", "Hired a mercenary to join the garrison.", [
      "combat",
    ]);
  } else if (mercenariesHired > 1) {
    GameLog.logSuccess(
      "mercenary",
      `Hired ${mercenariesHired} mercenaries to join the garrison.`,
      ["combat"],
    );
  }
  return fixture.trace.snapshot();
}

function createAutomation(fixture, overrides = {}) {
  return createMercenaryAdapter({
    getWarManager: overrides.getWarManager ?? (() => fixture.WarManager),
    getState: overrides.getState ?? (() => fixture.state),
    getSettings: overrides.getSettings ?? (() => fixture.settings),
    getResources: overrides.getResources ?? (() => fixture.resources),
    shouldSaveInflationMoney:
      overrides.shouldSaveInflationMoney ?? fixture.shouldSaveInflationMoney,
    getGameLog: overrides.getGameLog ?? (() => fixture.GameLog),
  });
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  runMercenaryAutomation(createAutomation(fixture));
  return fixture.trace.snapshot();
}

const dualRunScenarios = [
  { name: "garrison panel unavailable", garrisonView: false },
  { name: "mercenaries locked", unlocked: false },
  { name: "no city garrison capacity", maxCityGarrison: 0 },
  { name: "Inflation saving blocks normal run", saveInflationMoney: true },
  {
    name: "dead-soldier reserve blocks hiring",
    maxSoldiers: 5,
    currentSoldiers: 3,
    deadSoldierReserve: 2,
  },
  { name: "current Money cannot afford cost", moneyCurrent: 9 },
  {
    name: "remaining Money equality is not enough",
    maxSoldiers: 1,
    moneyCurrent: 510,
    moneyStoragePercent: 50,
    costIncomeMultiplier: 0,
  },
  {
    name: "remaining Money above threshold hires",
    maxSoldiers: 1,
    moneyCurrent: 511,
    moneyStoragePercent: 50,
    costIncomeMultiplier: 0,
  },
  {
    name: "cheap-cost OR bypasses Money reserve",
    maxSoldiers: 1,
    moneyCurrent: 10,
    moneyStoragePercent: 99,
  },
  { name: "single hire uses singular log", maxSoldiers: 1 },
  {
    name: "multiple hires follow dynamic costs",
    maxSoldiers: 3,
    costs: [10, 20, 30],
  },
  { name: "manager rejects first hire", managerStopsAt: 0 },
  {
    name: "manager rejection after one hire still logs",
    maxSoldiers: 3,
    managerStopsAt: 1,
  },
  {
    name: "Reset overrides saving and reserve policy",
    goal: "Reset",
    saveInflationMoney: true,
    maxSoldiers: 2,
    deadSoldierReserve: 99,
    moneyCurrent: 20,
    moneyStoragePercent: 99,
    costIncomeMultiplier: 0,
  },
  {
    name: "extra-storage adjustment lowers threshold",
    maxSoldiers: 1,
    moneyCurrent: 111,
    moneyMaximum: 1_000,
    moneyStorageRequired: 103,
    costIncomeMultiplier: 0,
    storageAssignExtra: true,
  },
  {
    name: "cheap-cost equality is not enough",
    maxSoldiers: 1,
    moneyCurrent: 10,
    moneyStoragePercent: 99,
    moneyMedian: 10,
    costIncomeMultiplier: 1,
  },
  {
    name: "rising cost stops after affordable hire",
    maxSoldiers: 3,
    moneyCurrent: 100,
    costs: [10, 200],
  },
];

for (const scenario of dualRunScenarios) {
  assertEquivalentTraces({
    legacy: runLegacy(scenario),
    modern: runModern(scenario),
    label: `mercenary ${scenario.name}`,
  });
}

const normalCycle = planMercenaryCycle({
  available: true,
  saveInflationMoney: false,
  goal: "Normal",
  maxSoldiers: 5,
  deadSoldierReserve: 2,
  moneyMedian: 10,
  costIncomeMultiplier: 3,
  moneyStoragePercent: 25,
  storageAssignExtra: false,
  moneyMaximum: 1_000,
  moneyStorageRequired: 100,
});
assert.deepEqual(normalCycle, {
  soldierLimit: 3,
  minimumMoney: 250,
  maximumCheapCost: 30,
});
assert.deepEqual(
  planMercenaryHire(normalCycle, {
    currentSoldiers: 2,
    mercenaryCost: 20,
    moneyCurrent: 20,
    moneySpare: 20,
  }),
  {
    kind: "hire-mercenary",
    expectedSoldiers: 2,
    expectedCost: 20,
    expectedMoneyCurrent: 20,
    expectedMoneySpare: 20,
  },
);
assert.deepEqual(planMercenaryLog(2), {
  id: "mercenary",
  message: "Hired 2 mercenaries to join the garrison.",
  categories: ["combat"],
});

const unavailableFixture = createFixture({ garrisonView: false });
let stateRead = false;
let settingsRead = false;
let resourcesRead = false;
let saveRead = false;
assert.equal(
  runMercenaryAutomation(
    createAutomation(unavailableFixture, {
      getState: () => ((stateRead = true), {}),
      getSettings: () => ((settingsRead = true), {}),
      getResources: () => ((resourcesRead = true), {}),
      shouldSaveInflationMoney: () => (saveRead = true),
    }),
  ).status,
  "succeeded",
);
assert.deepEqual(
  { stateRead, settingsRead, resourcesRead, saveRead },
  {
    stateRead: false,
    settingsRead: false,
    resourcesRead: false,
    saveRead: false,
  },
);

const countFixture = createFixture({ maxSoldiers: 3 });
let saveCount = 0;
assert.equal(
  runMercenaryAutomation(
    createAutomation(countFixture, {
      shouldSaveInflationMoney: () => (saveCount++, false),
    }),
  ).status,
  "succeeded",
);
assert.equal(saveCount, 1);

const malformedFixture = createFixture({});
malformedFixture.settings.foreignHireMercDeadSoldiers = Number.NaN;
assert.throws(
  () => runMercenaryAutomation(createAutomation(malformedFixture)),
  /settings\.foreignHireMercDeadSoldiers must be a finite number/,
);

const staleFixture = createFixture({ maxSoldiers: 1 });
const staleAutomation = createAutomation(staleFixture);
const staleCycle = planMercenaryCycle(staleAutomation.reader.readCycle());
const staleDecision = planMercenaryHire(
  staleCycle,
  staleAutomation.reader.readState(),
);
staleFixture.resources.Money.currentQuantity--;
assert.equal(staleAutomation.executor.hire(staleDecision).status, "stale");
assert.deepEqual(staleFixture.trace.snapshot(), [
  {
    category: "state-change",
    name: "resource-cache",
    details: { resourceId: "Money", quantity: 999 },
  },
]);

console.log(
  `Mercenary domain, Evolve adapter, application loop, logging, and parity tests passed (${dualRunScenarios.length} dual-run scenarios)`,
);
