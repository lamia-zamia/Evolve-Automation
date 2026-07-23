import assert from "node:assert/strict";

import { createWishControls } from "../src/adapters/browser/wish-controls.ts";
import {
  createWishCommandExecutor,
  createWishReader,
} from "../src/adapters/evolve/traits/wish.ts";
import { runWishAutomation } from "../src/application/wish.ts";
import { planWishes } from "../src/domain/traits/wish.ts";
import { createTraceRecorder } from "./test-support/modernization-fixtures.mjs";

function createFixture(scenario) {
  const trace = createTraceRecorder();
  const wishStats = {
    minor: scenario.minorRemaining ?? 0,
    major: scenario.majorRemaining ?? 0,
  };
  const game = {
    global: {
      race: {
        wish: scenario.raceWish ?? true,
        wishStats,
      },
      tech: { wish: scenario.technologyLevel ?? 2 },
    },
  };
  const settings = {
    wishMinor: scenario.minorSelection ?? "Know",
    wishMajor: scenario.majorSelection ?? "Power",
  };
  const panels = {
    minorWish: scenario.minorPanel === false ? undefined : {},
    majorWish: scenario.majorPanel === false ? undefined : {},
  };
  const getVueById = (id) => {
    trace.managerCall("getVueById", { id });
    return panels[id];
  };
  const clickSelector = (selector) => {
    trace.managerCall("clickSelector", { selector });
    trace.command("select-wish", { selector });
    if (scenario.mutateOnClick) {
      if (selector === `#wish${settings.wishMinor}`) wishStats.minor = 10;
      if (selector === `#wish${settings.wishMajor}`) wishStats.major = 20;
    }
  };
  return {
    trace,
    game,
    settings,
    wishStats,
    getVueById,
    clickSelector,
  };
}

function createAutomation(fixture) {
  return {
    reader: createWishReader({
      getGame: () => fixture.game,
      getSettings: () => fixture.settings,
    }),
    executor: createWishCommandExecutor({
      getGame: () => fixture.game,
      controls: createWishControls({
        getVueById: fixture.getVueById,
        clickSelector: fixture.clickSelector,
      }),
    }),
  };
}

const planned = planWishes({
  unlocked: true,
  technologyLevel: 2,
  minorRemaining: 0,
  majorRemaining: 0,
  minorSelection: "Know",
  majorSelection: "Power",
});
assert.deepEqual(planned, [
  { tier: "minor", wishId: "Know", expectedRemaining: 0 },
  { tier: "major", wishId: "Power", expectedRemaining: 0 },
]);
assert.equal(Object.isFrozen(planned), true);
assert.equal(Object.isFrozen(planned[0]), true);

let settingsRead = false;
const lockedReader = createWishReader({
  getGame: () => ({ global: { race: { wish: false } } }),
  getSettings: () => {
    settingsRead = true;
    return {};
  },
});
assert.deepEqual(planWishes(lockedReader.read()), []);
assert.equal(settingsRead, false);

const levelOneFixture = createFixture({ technologyLevel: 1 });
Object.defineProperty(levelOneFixture.settings, "wishMajor", {
  get() {
    throw new Error("major setting should not be read");
  },
});
assert.doesNotThrow(() => createAutomation(levelOneFixture).reader.read());

const malformedFixture = createFixture({});
malformedFixture.wishStats.minor = Number.NaN;
assert.throws(
  () => createAutomation(malformedFixture).reader.read(),
  /wishStats\.minor must be a finite number/,
);

const staleFixture = createFixture({
  minorSelection: "Know",
  majorSelection: "none",
});
const staleAutomation = createAutomation(staleFixture);
const [staleDecision] = planWishes(staleAutomation.reader.read());
staleFixture.wishStats.minor = 1;
assert.equal(staleAutomation.executor.execute(staleDecision).status, "stale");
assert.deepEqual(staleFixture.trace.snapshot(), []);

const missingFixture = createFixture({ minorPanel: false });
const missingOutcome = runWishAutomation(createAutomation(missingFixture));
assert.equal(missingOutcome.status, "stale");
assert.deepEqual(missingFixture.trace.snapshot(), [
  {
    category: "manager-call",
    name: "getVueById",
    details: { id: "minorWish" },
  },
]);

const phaseFixture = createFixture({ majorSelection: "none" });
const phaseAutomation = createAutomation(phaseFixture);
const phases = [];
assert.equal(
  runWishAutomation({
    reader: {
      read() {
        phases.push("read");
        return phaseAutomation.reader.read();
      },
    },
    executor: {
      execute(decision) {
        phases.push(`execute:${decision.tier}`);
        return phaseAutomation.executor.execute(decision);
      },
    },
  }).status,
  "succeeded",
);
assert.deepEqual(phases, ["read", "execute:minor"]);

console.log(
  "Wish domain, Evolve/browser adapters, and application tests passed",
);
