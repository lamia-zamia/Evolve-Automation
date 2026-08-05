import assert from "node:assert/strict";

import { createGameClickMultipliers } from "../src/adapters/browser/game-click-multipliers.ts";
import { createGeneticsControls } from "../src/adapters/browser/genetics-controls.ts";
import { createGeneticsAdapter } from "../src/adapters/evolve/traits/genetics.ts";
import { runGeneticsAutomation } from "../src/application/genetics.ts";
import { planGenetics } from "../src/domain/traits/genetics.ts";
import { createTraceRecorder } from "./test-support/modernization-fixtures.mjs";

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

function createAutomation(fixture, overrides = {}) {
  const controls = createGeneticsControls({
    getVueById: fixture.getVueById,
    clickMultipliers: createGameClickMultipliers({
      getKeyManager: () => fixture.KeyManager,
    }),
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
  "Genetics domain, Evolve/browser adapters, and application tests passed",
);
