import assert from "node:assert/strict";

import {
  readInflationAssistInput,
  readInflationMoneyInput,
  readInflationSaveInput,
} from "../src/adapters/evolve/inflation-assist.ts";

const TARGET = 250_000_000_000;

function makeSettings(overrides = {}) {
  return {
    inflationChallengeAssist: true,
    inflationChallengeSaveMinutes: 30,
    ...overrides,
  };
}

function makeGame(overrides = {}) {
  return {
    alevel: () => 4,
    global: { race: { inflation: true } },
    ...overrides,
  };
}

function makeResources(money = {}) {
  return {
    Money: {
      currentQuantity: 249_999_999_000,
      maxQuantity: 250_000_000_000,
      rateOfChange: 10,
      ...money,
    },
  };
}

// --- readInflationAssistInput ----------------------------------------------
{
  const result = readInflationAssistInput(makeSettings(), makeGame(), 0);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.input, {
    assistEnabled: true,
    inflationRun: true,
    wheelbarrowStar: 0,
    achievementLevel: 4,
  });
  assert.throws(() => {
    result.input.assistEnabled = false;
  }, "assist input must be frozen");
}

// Non-inflation runs: "inflation" key absent, or explicitly false.
assert.equal(
  readInflationAssistInput(
    makeSettings(),
    makeGame({ global: { race: {} } }),
    0,
  ).input.inflationRun,
  false,
);
assert.equal(
  readInflationAssistInput(
    makeSettings(),
    makeGame({ global: { race: { inflation: false } } }),
    0,
  ).input.inflationRun,
  false,
);
// A truthy non-boolean inflation flag still counts as an inflation run.
assert.equal(
  readInflationAssistInput(
    makeSettings(),
    makeGame({ global: { race: { inflation: { count: 3 } } } }),
    0,
  ).input.inflationRun,
  true,
);

// assistEnabled defaults to false when the setting is absent (legacy falsy).
assert.equal(
  readInflationAssistInput(
    makeSettings({ inflationChallengeAssist: undefined }),
    makeGame(),
    0,
  ).input.assistEnabled,
  false,
);

// Malformed inputs fail closed.
for (const [settings, game, star, field] of [
  [
    makeSettings({ inflationChallengeAssist: 1 }),
    makeGame(),
    0,
    "inflationChallengeAssist",
  ],
  [null, makeGame(), 0, undefined],
  [makeSettings(), { alevel: () => 4, global: {} }, 0, "race"],
  [makeSettings(), makeGame({ alevel: 4 }), 0, "alevel"],
  [makeSettings(), makeGame({ alevel: () => Number.NaN }), 0, "alevel"],
  [makeSettings(), makeGame({ alevel: () => -1 }), 0, "alevel"],
  [makeSettings(), makeGame(), Number.NaN, "wheelbarrow"],
  [makeSettings(), makeGame(), -2, "wheelbarrow"],
]) {
  const result = readInflationAssistInput(settings, game, star);
  assert.equal(
    result.status,
    "unavailable",
    `expected unavailable for field ${field}`,
  );
  if (field !== undefined) assert.equal(result.field, field);
}

// A throwing alevel getter is caught, not propagated.
assert.equal(
  readInflationAssistInput(
    makeSettings(),
    makeGame({
      alevel() {
        throw new Error("boom");
      },
    }),
    0,
  ).status,
  "unavailable",
);

// --- readInflationMoneyInput -----------------------------------------------
{
  const result = readInflationMoneyInput(makeResources(), TARGET);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.input, {
    targetMoney: TARGET,
    currentMoney: 249_999_999_000,
    maxMoney: 250_000_000_000,
    moneyRate: 10,
  });
}
// Negative rate is valid.
assert.equal(
  readInflationMoneyInput(makeResources({ rateOfChange: -50 }), TARGET).status,
  "ready",
);
for (const [resources, target, field] of [
  [makeResources(), Number.NaN, "inflationChallengeMoney"],
  [null, TARGET, undefined],
  [{}, TARGET, "Money"],
  [
    makeResources({ currentQuantity: Number.NaN }),
    TARGET,
    "Money.currentQuantity",
  ],
  [makeResources({ maxQuantity: Number.NaN }), TARGET, "Money.maxQuantity"],
  [
    makeResources({ rateOfChange: Number.POSITIVE_INFINITY }),
    TARGET,
    "Money.rateOfChange",
  ],
]) {
  const result = readInflationMoneyInput(resources, target);
  assert.equal(
    result.status,
    "unavailable",
    `expected unavailable for field ${field}`,
  );
  if (field !== undefined) assert.equal(result.field, field);
}

// --- readInflationSaveInput ------------------------------------------------
{
  const result = readInflationSaveInput(
    makeSettings(),
    makeGame(),
    makeResources(),
    0,
    TARGET,
  );
  assert.equal(result.status, "ready");
  assert.equal(result.input.active, true);
  assert.equal(result.input.saveMinutes, 30);
  assert.equal(result.input.money.targetMoney, TARGET);
}
// Negative save-minutes is valid data (disables saving in the policy).
assert.equal(
  readInflationSaveInput(
    makeSettings({ inflationChallengeSaveMinutes: -1 }),
    makeGame(),
    makeResources(),
    0,
    TARGET,
  ).status,
  "ready",
);
// Propagates assist/money unavailability and rejects malformed save-minutes.
assert.equal(
  readInflationSaveInput(null, makeGame(), makeResources(), 0, TARGET).status,
  "unavailable",
);
assert.equal(
  readInflationSaveInput(makeSettings(), makeGame(), {}, 0, TARGET).status,
  "unavailable",
);
{
  const result = readInflationSaveInput(
    makeSettings({ inflationChallengeSaveMinutes: Number.NaN }),
    makeGame(),
    makeResources(),
    0,
    TARGET,
  );
  assert.equal(result.status, "unavailable");
  assert.equal(result.field, "inflationChallengeSaveMinutes");
}

console.log("Inflation assist adapter contract tests passed");
