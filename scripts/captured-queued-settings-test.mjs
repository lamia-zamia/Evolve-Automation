import assert from "node:assert/strict";

import { createSettingsStore } from "../src/adapters/browser/settings-store.ts";
import { createCapturedQueuedSettings } from "../src/adapters/evolve/progression/evolution/captured-queued-settings.ts";

function createFixture(initial) {
  let saved;
  const storage = {
    getItem: () => JSON.stringify(initial),
    setItem: (key, value) => {
      assert.equal(key, "settings");
      saved = value;
    },
  };
  const warnings = [];
  let refreshes = 0;
  const settings = createSettingsStore({ storage });
  const queued = createCapturedQueuedSettings({
    settings,
    refreshSettings: () => {
      refreshes += 1;
    },
    onWarning: (message) => warnings.push(message),
  });
  return {
    queued,
    settings,
    warnings,
    readRefreshes: () => refreshes,
    readSaved: () => (saved === undefined ? undefined : JSON.parse(saved)),
  };
}

// One load applies matching values, rejects mismatched values without dropping them, persists the
// shifted queue, reports the attempt, and refreshes the visible script settings section.
{
  const fixture = createFixture({
    evolutionQueueEnabled: true,
    evolutionQueueRepeat: false,
    showSettings: true,
    enabled: true,
    count: 3,
    evolutionQueue: [
      { enabled: false, count: "wrong", unknown: true },
      { enabled: true },
    ],
  });

  fixture.queued.loadQueuedSettings();
  assert.equal(fixture.settings.readRaw().enabled, false);
  assert.equal(fixture.settings.readRaw().count, 3);
  assert.equal(fixture.settings.readRaw().unknown, undefined);
  assert.deepEqual(fixture.settings.readRaw().evolutionQueue, [
    { enabled: true },
  ]);
  assert.equal(fixture.queued.readEvolutionAttempts(), 1);
  assert.equal(fixture.readRefreshes(), 1);
  assert.equal(fixture.warnings.length, 2);
  assert.match(fixture.warnings[0], /settingsRaw\.count type: number/);
  assert.match(fixture.warnings[1], /settingsRaw\.unknown type: undefined/);
  assert.deepEqual(fixture.readSaved().evolutionQueue, [{ enabled: true }]);

  fixture.queued.loadQueuedSettings();
  assert.equal(fixture.settings.readRaw().enabled, true);
  assert.equal(fixture.settings.readRaw().evolutionQueue.length, 0);
  assert.equal(fixture.queued.readEvolutionAttempts(), 2);
  assert.equal(fixture.readRefreshes(), 2);
}

// Repeating keeps the applied record at the end, while a hidden settings panel receives no refresh.
{
  const fixture = createFixture({
    evolutionQueueEnabled: true,
    evolutionQueueRepeat: true,
    showSettings: false,
    enabled: true,
    evolutionQueue: [{ enabled: false }],
  });

  fixture.queued.loadQueuedSettings();
  assert.equal(fixture.settings.readRaw().enabled, false);
  assert.deepEqual(fixture.settings.readRaw().evolutionQueue, [
    { enabled: false },
  ]);
  assert.equal(fixture.queued.readEvolutionAttempts(), 1);
  assert.equal(fixture.readRefreshes(), 0);
}

// Disabled, empty, and malformed queue states are safe no-ops and do not create a false attempt.
for (const initial of [
  {
    evolutionQueueEnabled: false,
    evolutionQueue: [{ enabled: false }],
  },
  {
    evolutionQueueEnabled: true,
    evolutionQueue: [],
  },
  {
    evolutionQueueEnabled: true,
    evolutionQueue: ["not a settings record"],
  },
]) {
  const fixture = createFixture(initial);
  fixture.queued.loadQueuedSettings();
  assert.equal(fixture.queued.readEvolutionAttempts(), 0);
  assert.equal(fixture.readSaved(), undefined);
}

console.log("Captured queued settings tests passed");
