import assert from "node:assert/strict";

import { createSpyAdapter } from "../src/adapters/evolve/spy.ts";
import { runSpyAutomation } from "../src/application/spy.ts";
import {
  planSpyCycle,
  planSpyEspionage,
  planSpyTraining,
} from "../src/domain/combat/spy.ts";
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

const TYPES = {
  Influence: { id: "influence" },
  Sabotage: { id: "sabotage" },
  Incite: { id: "incite" },
  Annex: { id: "annex" },
  Purchase: { id: "purchase" },
};

function createForeign(trace, definition, index) {
  let released = definition.released ?? false;
  const foreign = {
    id: definition.id ?? index,
    policy: definition.policy ?? "None",
    gov: {
      spy: definition.spy ?? 0,
      sab: definition.sab ?? 0,
      mil: definition.military ?? 100,
      hstl: definition.hostility ?? 50,
      occ: definition.occupied ?? false,
      anx: definition.annexed ?? false,
      buy: definition.purchased ?? false,
      trn: definition.training ?? 0,
    },
  };
  Object.defineProperty(foreign, "released", {
    get: () => released,
    set(value) {
      released = value;
      trace.stateChange("foreign-released", {
        governmentId: foreign.id,
        released: value,
      });
    },
    enumerable: true,
  });
  return foreign;
}

function createFixture(scenario) {
  const trace = createTraceRecorder();
  const foreigns = (scenario.foreigns ?? [{}]).map((definition, index) =>
    createForeign(trace, definition, index),
  );
  let trainingBudget = scenario.trainingBudget ?? Number.POSITIVE_INFINITY;
  const trainingCost = scenario.trainingCost ?? 10;
  const foreignView = {
    spy_disabled(id) {
      trace.managerCall("spy_disabled", { governmentId: id });
      const foreign = foreigns.find((candidate) => candidate.id === id);
      return (
        scenario.disabledIds?.includes(id) ||
        foreign.gov.trn > 0 ||
        trainingBudget < trainingCost
      );
    },
    spy(id) {
      trace.managerCall("foreign.spy", { governmentId: id });
      trace.command("train-spy", { governmentId: id });
      const foreign = foreigns.find((candidate) => candidate.id === id);
      foreign.gov.trn = 1;
      trainingBudget -= trainingCost;
      trace.stateChange("spy-training", {
        governmentId: id,
        training: 1,
      });
    },
  };
  const SpyManager = {
    _foreignVue: scenario.foreignView === false ? undefined : foreignView,
    foreignActive: foreigns,
    foreignTarget: foreigns[scenario.primaryIndex ?? 0] ?? null,
    purchaseMoney: scenario.purchaseMoney ?? 0,
    purchaseForeigngs: scenario.purchaseForeigns ?? [],
    Types: TYPES,
    performEspionage(governmentId, missionId, secondaryTarget) {
      trace.managerCall("SpyManager.performEspionage", {
        governmentId,
        missionId,
        secondaryTarget,
      });
      trace.command("perform-espionage", {
        governmentId,
        missionId,
        secondaryTarget,
      });
    },
  };
  const WarManager = {
    release(governmentId) {
      trace.managerCall("WarManager.release", { governmentId });
      trace.command("release-foreign", { governmentId });
      const government = foreigns.find(
        (candidate) => candidate.id === governmentId,
      ).gov;
      government.occ = false;
      government.anx = false;
      government.buy = false;
      trace.stateChange("foreign-control", {
        governmentId,
        occupied: false,
        annexed: false,
        purchased: false,
      });
    },
  };
  const settings = {
    foreignTrainSpy: scenario.trainEnabled ?? false,
    foreignSpyMax: scenario.spyMaximum ?? 2,
  };
  const resources = {
    Money: {
      storageRatio: scenario.moneyStorageRatio ?? 1,
      maxQuantity: scenario.moneyMaximum ?? 1_000,
    },
  };
  const poly = { govPrice: () => scenario.purchasePrice ?? 500 };
  const GameLog = {
    logSuccess(id, message, categories) {
      trace.managerCall("GameLog.logSuccess", { id });
      trace.log(id, { message, categories });
    },
  };
  const game = { global: { race: { elusive: scenario.elusive ?? false } } };
  const haveTask = (task) => scenario.tasks?.includes(task) ?? false;
  const haveTech = (technology, level = 1) =>
    technology === "spy" && (scenario.spyTechnology ?? 2) >= level;
  return {
    trace,
    foreigns,
    SpyManager,
    WarManager,
    settings,
    resources,
    poly,
    GameLog,
    game,
    haveTask,
    haveTech,
    shouldSaveInflationMoney: () => scenario.saveInflationMoney ?? false,
    getGovName: (id) => `foreign power ${id + 1}`,
  };
}

// Exact copy of the deleted controller, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const {
    SpyManager,
    WarManager,
    haveTask,
    haveTech,
    resources,
    settings,
    poly,
    GameLog,
    game,
  } = fixture;
  const manager = SpyManager;
  if (
    !manager._foreignVue ||
    haveTask("combo_spy") ||
    haveTask("spyop") ||
    !haveTech("spy")
  ) {
    return fixture.trace.snapshot();
  }
  if (fixture.shouldSaveInflationMoney()) return fixture.trace.snapshot();
  if (!haveTech("spy", 2) && resources.Money.storageRatio < 0.9) {
    return fixture.trace.snapshot();
  }

  if (settings.foreignTrainSpy) {
    for (const foreign of manager.foreignActive) {
      if (
        manager._foreignVue.spy_disabled(foreign.id) ||
        foreign.gov.occ ||
        foreign.gov.anx ||
        foreign.gov.buy
      ) {
        continue;
      }
      let spiesRequired =
        settings.foreignSpyMax >= 0
          ? settings.foreignSpyMax
          : Number.MAX_SAFE_INTEGER;
      if (
        spiesRequired < 1 &&
        foreign.policy !== "Occupy" &&
        foreign.policy !== "Ignore"
      ) {
        spiesRequired = 1;
      }
      if (
        spiesRequired < 3 &&
        foreign.policy === "Purchase" &&
        resources.Money.maxQuantity >= poly.govPrice(foreign.id)
      ) {
        spiesRequired = 3;
      }
      if (
        foreign.gov.spy >= spiesRequired ||
        (manager.purchaseMoney > 0 &&
          foreign.policy !== "Purchase" &&
          foreign.gov.spy > 0)
      ) {
        continue;
      }
      GameLog.logSuccess(
        "spying",
        `Training a spy to send against ${fixture.getGovName(foreign.id)}.`,
        ["spy"],
      );
      manager._foreignVue.spy(foreign.id);
    }
  }

  if (!haveTech("spy", 2)) return fixture.trace.snapshot();
  for (const foreign of manager.foreignActive) {
    if (
      foreign.gov.spy < 1 ||
      foreign.gov.sab !== 0 ||
      foreign.policy === "None"
    ) {
      continue;
    }
    let espionageMission;
    if (foreign.policy === "Betrayal") {
      espionageMission =
        foreign.gov.mil <= 75 || foreign.gov.hstl <= 0
          ? manager.Types.Sabotage
          : manager.Types.Influence;
    } else if (foreign.policy === "Occupy") {
      espionageMission = manager.Types.Sabotage;
    } else {
      espionageMission = manager.Types[foreign.policy];
    }
    if (!espionageMission) continue;
    if (
      manager.purchaseMoney > 0 &&
      manager.purchaseForeigngs.includes(foreign.id) &&
      espionageMission === manager.Types.Purchase &&
      foreign.gov.spy < 3 &&
      !game.global.race["elusive"]
    ) {
      continue;
    }
    if (
      (foreign.gov.anx && foreign.policy !== "Annex") ||
      (foreign.gov.buy && foreign.policy !== "Purchase") ||
      (foreign.gov.occ && foreign.policy !== "Occupy")
    ) {
      WarManager.release(foreign.id);
      foreign.released = true;
    } else if (!foreign.gov.anx && !foreign.gov.buy && !foreign.gov.occ) {
      manager.performEspionage(
        foreign.id,
        espionageMission.id,
        foreign !== manager.foreignTarget,
      );
    }
  }
  return fixture.trace.snapshot();
}

function createAutomation(fixture, overrides = {}) {
  return createSpyAdapter({
    getSpyManager: overrides.getSpyManager ?? (() => fixture.SpyManager),
    getWarManager: overrides.getWarManager ?? (() => fixture.WarManager),
    getHaveTask: overrides.getHaveTask ?? (() => fixture.haveTask),
    getHaveTech: overrides.getHaveTech ?? (() => fixture.haveTech),
    shouldSaveInflationMoney:
      overrides.shouldSaveInflationMoney ?? fixture.shouldSaveInflationMoney,
    getResources: overrides.getResources ?? (() => fixture.resources),
    getSettings: overrides.getSettings ?? (() => fixture.settings),
    getPoly: overrides.getPoly ?? (() => fixture.poly),
    getGameLog: overrides.getGameLog ?? (() => fixture.GameLog),
    getGovName: overrides.getGovName ?? fixture.getGovName,
    getGame: overrides.getGame ?? (() => fixture.game),
  });
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  runSpyAutomation(createAutomation(fixture));
  return fixture.trace.snapshot();
}

const dualRunScenarios = [
  { name: "foreign panel unavailable", foreignView: false },
  { name: "combo spy task active", tasks: ["combo_spy"] },
  { name: "spy operation task active", tasks: ["spyop"] },
  { name: "spy technology locked", spyTechnology: 0 },
  { name: "Inflation saving blocks spies", saveInflationMoney: true },
  {
    name: "level-one spy waits below Money storage threshold",
    spyTechnology: 1,
    moneyStorageRatio: 0.89,
  },
  {
    name: "level-one spy trains but cannot perform espionage",
    spyTechnology: 1,
    trainEnabled: true,
    foreigns: [{ policy: "Influence", spy: 0 }],
  },
  {
    name: "disabled training control skips foreign",
    trainEnabled: true,
    disabledIds: [0],
  },
  {
    name: "controlled foreign skips training",
    trainEnabled: true,
    foreigns: [{ policy: "Influence", occupied: true }],
  },
  {
    name: "non-control policy requires at least one spy",
    trainEnabled: true,
    spyMaximum: 0,
    foreigns: [{ policy: "Influence", spy: 0 }],
  },
  {
    name: "Ignore policy honors zero-spy maximum",
    trainEnabled: true,
    spyMaximum: 0,
    foreigns: [{ policy: "Ignore", spy: 0 }],
  },
  {
    name: "affordable Purchase capacity requires three spies",
    trainEnabled: true,
    spyMaximum: 1,
    foreigns: [{ policy: "Purchase", spy: 2 }],
  },
  {
    name: "unaffordable Purchase capacity honors configured maximum",
    trainEnabled: true,
    spyMaximum: 1,
    moneyMaximum: 100,
    purchasePrice: 500,
    foreigns: [{ policy: "Purchase", spy: 1 }],
  },
  {
    name: "purchase reservation suppresses extra non-Purchase spy",
    trainEnabled: true,
    spyMaximum: 3,
    purchaseMoney: 500,
    foreigns: [{ policy: "Influence", spy: 1 }],
  },
  {
    name: "earlier training spend disables later foreign",
    trainEnabled: true,
    trainingBudget: 10,
    foreigns: [
      { policy: "Influence", spy: 0 },
      { policy: "Influence", spy: 0 },
    ],
  },
  {
    name: "Betrayal sabotages weakened military",
    foreigns: [{ policy: "Betrayal", spy: 1, military: 75, hostility: 50 }],
  },
  {
    name: "Betrayal influences strong hostile foreign",
    foreigns: [{ policy: "Betrayal", spy: 1, military: 76, hostility: 1 }],
  },
  {
    name: "Occupy policy prepares with sabotage",
    foreigns: [{ policy: "Occupy", spy: 1 }],
  },
  {
    name: "direct Incite runs against secondary target",
    primaryIndex: 1,
    foreigns: [{ policy: "Incite", spy: 1 }, { policy: "None" }],
  },
  {
    name: "Purchase preparation preserves spies",
    purchaseMoney: 500,
    purchaseForeigns: [0],
    foreigns: [{ policy: "Purchase", spy: 2 }],
  },
  {
    name: "Elusive Purchase bypasses spy preservation",
    purchaseMoney: 500,
    purchaseForeigns: [0],
    elusive: true,
    foreigns: [{ policy: "Purchase", spy: 2 }],
  },
  {
    name: "mismatched controlled foreign is released",
    foreigns: [{ policy: "Influence", spy: 1, occupied: true }],
  },
  {
    name: "matching controlled foreign remains controlled",
    foreigns: [{ policy: "Occupy", spy: 1, occupied: true }],
  },
  {
    name: "busy espionage skips mission",
    foreigns: [{ policy: "Sabotage", spy: 1, sab: 1 }],
  },
];

for (const scenario of dualRunScenarios) {
  assertEquivalentTraces({
    legacy: runLegacy(scenario),
    modern: runModern(scenario),
    label: `spy ${scenario.name}`,
  });
}

assert.deepEqual(
  planSpyCycle({
    available: true,
    trainEnabled: true,
    advancedEspionage: true,
    foreignCount: 3,
  }),
  { trainEnabled: true, espionageEnabled: true, foreignCount: 3 },
);
assert.deepEqual(
  planSpyTraining({
    foreignIndex: 0,
    governmentId: 0,
    governmentName: "first",
    disabled: false,
    occupied: false,
    annexed: false,
    purchased: false,
    policy: "Purchase",
    spyCount: 2,
    spyMaximumSetting: 1,
    purchaseMoney: 0,
    moneyMaximum: 1_000,
    purchasePrice: 500,
  }),
  {
    kind: "train-spy",
    foreignIndex: 0,
    governmentId: 0,
    governmentName: "first",
  },
);
assert.deepEqual(
  planSpyEspionage({
    foreignIndex: 0,
    governmentId: 0,
    policy: "Betrayal",
    spyCount: 1,
    sabotageProgress: 0,
    military: 76,
    hostility: 1,
    occupied: false,
    annexed: false,
    purchased: false,
    purchaseMoney: 0,
    purchaseForeign: false,
    elusive: false,
    isPrimaryTarget: true,
    missionIds: Object.fromEntries(
      Object.entries(TYPES).map(([name, type]) => [name, type.id]),
    ),
  }),
  {
    kind: "perform-espionage",
    foreignIndex: 0,
    governmentId: 0,
    missionId: "influence",
    secondaryTarget: false,
  },
);

const lockedFixture = createFixture({ foreignView: false });
let taskRead = false;
let settingsRead = false;
let resourcesRead = false;
assert.equal(
  runSpyAutomation(
    createAutomation(lockedFixture, {
      getHaveTask: () => {
        taskRead = true;
        return () => false;
      },
      getSettings: () => ((settingsRead = true), {}),
      getResources: () => ((resourcesRead = true), {}),
    }),
  ).status,
  "succeeded",
);
assert.deepEqual(
  { taskRead, settingsRead, resourcesRead },
  { taskRead: false, settingsRead: false, resourcesRead: false },
);

const noTrainingFixture = createFixture({ trainEnabled: false });
delete noTrainingFixture.settings.foreignSpyMax;
assert.equal(
  runSpyAutomation(createAutomation(noTrainingFixture)).status,
  "succeeded",
);

const malformedFixture = createFixture({ trainEnabled: true });
malformedFixture.settings.foreignSpyMax = Number.NaN;
assert.throws(
  () => runSpyAutomation(createAutomation(malformedFixture)),
  /settings\.foreignSpyMax must be a finite number/,
);

const staleFixture = createFixture({
  trainEnabled: false,
  foreigns: [{ policy: "Influence", spy: 1 }],
});
const staleAutomation = createAutomation(staleFixture);
staleAutomation.reader.readCycle();
const staleInput = staleAutomation.reader.readEspionage(0);
const staleDecision = planSpyEspionage(staleInput);
staleFixture.foreigns[0].gov.spy = 2;
assert.equal(staleAutomation.executor.execute(staleDecision).status, "stale");
assert.deepEqual(staleFixture.trace.snapshot(), []);

console.log(
  `Spy domain, phased Evolve adapter/application, and parity tests passed (${dualRunScenarios.length} dual-run scenarios)`,
);
