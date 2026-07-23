import assert from "node:assert/strict";

import { createGeneticsControls } from "../src/adapters/browser/genetics-controls.ts";
import { createGeneticsAdapter } from "../src/adapters/evolve/traits/genetics.ts";
import { runGeneticsAutomation } from "../src/application/genetics.ts";
import { planGenetics } from "../src/domain/traits/genetics.ts";
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

function createResource(id, trace, definition) {
  let current = definition.current;
  const resource = {
    rateOfChange: definition.rate ?? 0,
    maxQuantity: definition.maximum ?? 0,
    isDemanded: () => definition.demanded ?? false,
  };
  Object.defineProperty(resource, "currentQuantity", {
    get: () => current,
    set(next) {
      current = next;
      trace.stateChange("resource-cache", { resourceId: id, quantity: next });
    },
    enumerable: true,
  });
  return resource;
}

function createFixture(scenario) {
  const trace = createTraceRecorder();
  const sequence =
    scenario.sequence === false
      ? undefined
      : {
          on: scenario.sequenceOn ?? false,
          boost: scenario.boostOn ?? false,
          auto: scenario.autoOn ?? false,
        };
  const game = {
    global: {
      tech: { genetics: scenario.level ?? 6 },
      race: { mutation: scenario.mutations ?? 0 },
      arpa: { sequence },
    },
  };
  const settings = {
    geneticsSequence: scenario.sequenceMode ?? "none",
    geneticsBoost: scenario.boostMode ?? "none",
    geneticsAssemble: scenario.assembleMode ?? "none",
  };
  const resources = {
    Knowledge: createResource("Knowledge", trace, {
      current: scenario.knowledgeCurrent ?? 0,
      rate: scenario.knowledgeRate ?? 0,
      maximum: scenario.knowledgeMaximum ?? 0,
      demanded: scenario.knowledgeDemanded ?? false,
    }),
    Genes: createResource("Genes", trace, {
      current: scenario.genesCurrent ?? 0,
    }),
  };
  const vue = {
    toggle() {
      trace.managerCall("toggle", {});
      trace.command("set-genetics-toggle", { toggle: "sequence" });
      sequence.on = !sequence.on;
      trace.stateChange("genetics-toggle", {
        toggle: "sequence",
        enabled: sequence.on,
      });
    },
    booster() {
      trace.managerCall("booster", {});
      trace.command("set-genetics-toggle", { toggle: "boost" });
      sequence.boost = !sequence.boost;
      trace.stateChange("genetics-toggle", {
        toggle: "boost",
        enabled: sequence.boost,
      });
    },
    auto_seq() {
      trace.managerCall("auto_seq", {});
      trace.command("set-genetics-toggle", { toggle: "auto" });
      sequence.auto = !sequence.auto;
      trace.stateChange("genetics-toggle", {
        toggle: "auto",
        enabled: sequence.auto,
      });
    },
    novo() {
      trace.managerCall("novo", {});
      trace.command("assemble-genes", {});
    },
  };
  const KeyManager = {
    *click(count) {
      trace.managerCall("KeyManager.click", { count });
      while (count > 0) yield --count;
    },
  };
  return {
    trace,
    game,
    settings,
    resources,
    sequence,
    vue,
    KeyManager,
    getVueById: (id) =>
      id === "arpaSequence" && scenario.panel !== false ? vue : undefined,
    ticksPerSecond: scenario.ticksPerSecond ?? 4,
  };
}

// Exact copy of the deleted controller, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const { game, settings, resources, KeyManager } = fixture;
  const genetics = game.global.tech.genetics;
  const mutations = game.global.race.mutation;
  if (!genetics) return fixture.trace.snapshot();

  const geneticsVue = fixture.getVueById("arpaSequence");
  const seq = game.global.arpa.sequence;
  if (!geneticsVue || !seq) return fixture.trace.snapshot();

  if (
    (settings.geneticsSequence === "enabled" && !seq.on) ||
    (settings.geneticsSequence === "disabled" && seq.on) ||
    (settings.geneticsSequence === "decode" &&
      ((seq.on && mutations >= 1) || (!seq.on && mutations < 1)))
  ) {
    geneticsVue.toggle();
  }
  if (genetics < 5) return fixture.trace.snapshot();

  if (
    (settings.geneticsBoost === "enabled" && !seq.boost) ||
    (settings.geneticsBoost === "disabled" && seq.boost)
  ) {
    geneticsVue.booster();
  }
  if (genetics < 6) return fixture.trace.snapshot();

  if (
    (settings.geneticsAssemble === "enabled" && !seq.auto) ||
    (settings.geneticsAssemble === "disabled" && seq.auto)
  ) {
    geneticsVue.auto_seq();
  }
  if (
    settings.geneticsAssemble !== "auto" ||
    resources.Knowledge.currentQuantity < 200_000 ||
    resources.Knowledge.isDemanded()
  ) {
    return fixture.trace.snapshot();
  }

  const nextTickKnowledge =
    resources.Knowledge.currentQuantity +
    resources.Knowledge.rateOfChange / fixture.ticksPerSecond;
  const overflowKnowledge = nextTickKnowledge - resources.Knowledge.maxQuantity;
  if (overflowKnowledge <= 0) return fixture.trace.snapshot();

  const genesToAssemble = Math.ceil(overflowKnowledge / 200_000);
  resources.Knowledge.currentQuantity -= 200_000 * genesToAssemble;
  resources.Genes.currentQuantity += genesToAssemble;
  for (const unused of KeyManager.click(genesToAssemble)) {
    void unused;
    geneticsVue.novo();
  }
  return fixture.trace.snapshot();
}

function createAutomation(fixture, overrides = {}) {
  const controls = createGeneticsControls({
    getVueById: fixture.getVueById,
    getKeyManager: () => fixture.KeyManager,
  });
  const adapter = createGeneticsAdapter({
    getGame: () => fixture.game,
    getSettings: overrides.getSettings ?? (() => fixture.settings),
    getResources: overrides.getResources ?? (() => fixture.resources),
    getTicksPerSecond: () => fixture.ticksPerSecond,
    controls,
  });
  return { reader: adapter.reader, executor: adapter.executor, controls };
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  runGeneticsAutomation(createAutomation(fixture));
  return fixture.trace.snapshot();
}

const dualRunScenarios = [
  { name: "genetics locked", level: 0 },
  { name: "panel missing", panel: false },
  { name: "sequence missing", sequence: false },
  {
    name: "sequence enabled before boost technology",
    level: 4,
    sequenceMode: "enabled",
  },
  {
    name: "decode starts before first mutation",
    level: 4,
    sequenceMode: "decode",
    mutations: 0,
  },
  {
    name: "decode stops after mutation",
    level: 4,
    sequenceMode: "decode",
    mutations: 1,
    sequenceOn: true,
  },
  { name: "boost setting at level five", level: 5, boostMode: "enabled" },
  {
    name: "auto toggle exposed at legacy level six",
    level: 6,
    assembleMode: "enabled",
  },
  {
    name: "all toggles in method order",
    level: 6,
    sequenceMode: "enabled",
    boostMode: "enabled",
    assembleMode: "enabled",
  },
  {
    name: "auto assembly waits below knowledge floor",
    assembleMode: "auto",
    knowledgeCurrent: 199_999,
  },
  {
    name: "auto assembly waits on demand",
    assembleMode: "auto",
    knowledgeCurrent: 200_000,
    knowledgeDemanded: true,
  },
  {
    name: "auto assembly waits without projected overflow",
    assembleMode: "auto",
    knowledgeCurrent: 200_000,
    knowledgeMaximum: 300_000,
    knowledgeRate: 100_000,
  },
  {
    name: "one projected overflow assembly",
    assembleMode: "auto",
    knowledgeCurrent: 200_000,
    knowledgeMaximum: 200_000,
    knowledgeRate: 800_000,
    genesCurrent: 3,
  },
  {
    name: "projected overflow can overdraw wrapper knowledge",
    assembleMode: "auto",
    knowledgeCurrent: 200_000,
    knowledgeMaximum: 200_000,
    knowledgeRate: 1_600_000,
    genesCurrent: 3,
  },
];

for (const scenario of dualRunScenarios) {
  assertEquivalentTraces({
    legacy: runLegacy(scenario),
    modern: runModern(scenario),
    label: `genetics ${scenario.name}`,
  });
}

assert.deepEqual(
  planGenetics({
    available: true,
    technologyLevel: 4,
    mutationCount: 0,
    sequenceMode: "decode",
    sequenceOn: false,
    boostMode: "none",
    boostOn: false,
    assembleMode: "none",
    autoOn: false,
    assembly: null,
  }),
  [
    {
      kind: "set-genetics-toggle",
      toggle: "sequence",
      expected: false,
      enabled: true,
    },
  ],
);

let settingsRead = false;
let resourcesRead = false;
const lockedFixture = createFixture({ level: 0 });
assert.equal(
  runGeneticsAutomation(
    createAutomation(lockedFixture, {
      getSettings: () => {
        settingsRead = true;
        return {};
      },
      getResources: () => {
        resourcesRead = true;
        return {};
      },
    }),
  ).status,
  "succeeded",
);
assert.equal(settingsRead, false);
assert.equal(resourcesRead, false);

const lowFixture = createFixture({ assembleMode: "auto", knowledgeCurrent: 1 });
delete lowFixture.resources.Genes;
assert.equal(
  runGeneticsAutomation(createAutomation(lowFixture)).status,
  "succeeded",
);

const staleFixture = createFixture({ sequenceMode: "enabled" });
const staleAutomation = createAutomation(staleFixture);
staleAutomation.reader.readGate();
staleAutomation.controls.capture();
const [staleDecision] = planGenetics(staleAutomation.reader.readPlan());
staleFixture.sequence.on = true;
assert.equal(staleAutomation.executor.execute(staleDecision).status, "stale");
assert.deepEqual(staleFixture.trace.snapshot(), []);

const malformedFixture = createFixture({
  assembleMode: "auto",
  knowledgeCurrent: 200_000,
  knowledgeMaximum: 200_000,
  knowledgeRate: 1,
  ticksPerSecond: 0,
});
assert.throws(
  () => runGeneticsAutomation(createAutomation(malformedFixture)),
  /ticksPerSecond must be greater than zero/,
);

const phaseFixture = createFixture({ sequenceMode: "enabled" });
const phaseAutomation = createAutomation(phaseFixture);
const phases = [];
assert.equal(
  runGeneticsAutomation({
    controls: {
      capture() {
        phases.push("capture");
        return phaseAutomation.controls.capture();
      },
      toggle: phaseAutomation.controls.toggle,
      assemble: phaseAutomation.controls.assemble,
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
assert.deepEqual(phases, ["gate", "capture", "plan-input"]);

console.log(
  `Genetics domain, Evolve/browser adapters, application, and parity tests passed (${dualRunScenarios.length} dual-run scenarios)`,
);
