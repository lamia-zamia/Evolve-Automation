import assert from "node:assert/strict";

import {
  appendStateLogRecord,
  createStateLogRecord,
  normalizeStateLogInterval,
  parseStateLogRecord,
  STATE_LOG_SAMPLE_LIMIT,
} from "../src/domain/state-log.ts";
import { createStateLogRecorder } from "../src/application/state-log.ts";
import { createCapturedStateLogReader } from "../src/adapters/evolve/captured-state-log.ts";

function observation({ reset = 2, tick = 1, day = 9 } = {}) {
  const resource = {
    present: true,
    unlocked: true,
    amount: 100,
    max: 1000,
    rateOfChange: 5,
    storageRatio: 0.1,
  };
  return {
    reset,
    species: "human",
    tick,
    day,
    resources: { Money: resource, Knowledge: resource },
    offeredTechs: [{ id: "tech-mining", cost: { Knowledge: 25 } }],
  };
}

function createStore(initial = null) {
  let value = initial;
  const writes = [];
  return {
    writes,
    load: () => {
      if (value === "corrupt") throw new SyntaxError("corrupt JSON");
      return value;
    },
    save: (record) => {
      value = record;
      writes.push(record);
    },
  };
}

assert.equal(normalizeStateLogInterval(undefined), 20);
assert.equal(normalizeStateLogInterval("4"), 20);
assert.equal(normalizeStateLogInterval(0), 20);
assert.equal(normalizeStateLogInterval(-1), 20);
assert.equal(normalizeStateLogInterval(0.5), 20);
assert.equal(normalizeStateLogInterval(3.8), 3);

// Construction logging projects the exact readout already consumed by Script Planner.
{
  const constructionSnapshot = {
    cycleId: 18,
    detailLevel: "planner",
    targets: [
      {
        key: "queued-city-hut",
        family: "building",
        weighting: 1000,
        cost: {},
        queued: true,
        blocker: "ready",
      },
      {
        key: "city-bank",
        family: "building",
        weighting: 900,
        cost: { Money: 5000 },
        queued: false,
        blocker: "income",
        resourceId: "Money",
        timeSeconds: 440,
      },
    ],
  };
  const resource = {
    present: true,
    unlocked: true,
    amount: 10,
    max: 100,
    rateOfChange: 2,
    storageRatio: 0.1,
  };
  const captured = createCapturedStateLogReader({
    identity: {
      readIdentity: () => ({ species: "human", resets: 2, days: 9 }),
    },
    resources: {
      readResources: () =>
        Object.freeze({
          resources: new Map([
            ["Money", resource],
            ["Knowledge", resource],
          ]),
        }),
    },
    readConstruction: () => constructionSnapshot,
  });
  const sample = captured.read(21);
  assert.deepEqual(sample.construction, {
    cycleId: 18,
    detailLevel: "planner",
    target: {
      key: "city-bank",
      family: "building",
      blocker: "income",
      resourceId: "Money",
      timeSeconds: 440,
    },
  });
  assert.equal(sample.tick, 21);
}

// Disabled instrumentation neither samples game state nor writes storage.
{
  const store = createStore();
  let reads = 0;
  const lifecycle = createStateLogRecorder({
    store,
    reader: { read: () => (reads++, observation()) },
  });
  for (let tick = 1; tick <= 40; tick += 1) {
    lifecycle.recordProcessedCycle(tick, {
      stateLogEnabled: false,
      stateLogInterval: 1,
    });
  }
  assert.equal(reads, 0);
  assert.equal(store.writes.length, 0);
}

// The cadence is measured in calls from the processed-cycle owner, not in raw wakeups.
{
  const store = createStore();
  const readTicks = [];
  let day = 4;
  const lifecycle = createStateLogRecorder({
    store,
    reader: {
      read: (tick) => {
        readTicks.push(tick);
        return observation({ tick, day: day++ });
      },
    },
  });
  for (let tick = 1; tick <= 6; tick += 1) {
    lifecycle.recordProcessedCycle(tick, {
      stateLogEnabled: true,
      stateLogInterval: 3,
    });
  }
  assert.deepEqual(readTicks, [3, 6]);
  assert.equal(lifecycle.readCurrent().sampleCount, 2);
  assert.equal(store.writes.length, 0);
}

// Invalid imported intervals use the same State Log default as settings reset; zero is clamped.
{
  const store = createStore();
  let reads = 0;
  const lifecycle = createStateLogRecorder({
    store,
    reader: { read: (tick) => (reads++, observation({ tick })) },
  });
  for (let tick = 1; tick <= 19; tick += 1) {
    lifecycle.recordProcessedCycle(tick, {
      stateLogEnabled: true,
      stateLogInterval: Number.NaN,
    });
  }
  assert.equal(reads, 0);
  lifecycle.recordProcessedCycle(20, {
    stateLogEnabled: true,
    stateLogInterval: Number.NaN,
  });
  assert.equal(reads, 1);
}

// A valid record resumes in the same reset and retains its original species/start day.
{
  const persisted = createStateLogRecord(observation({ tick: 25, day: 3 }));
  const sameRun = { ...persisted, sampleCount: 25 };
  const store = createStore(sameRun);
  const lifecycle = createStateLogRecorder({
    store,
    reader: { read: (tick) => observation({ tick, day: 14 }) },
  });
  lifecycle.recordProcessedCycle(26, {
    stateLogEnabled: true,
    stateLogInterval: 1,
  });
  assert.equal(lifecycle.readCurrent().sampleCount, 26);
  assert.equal(lifecycle.readCurrent().startDay, 3);
  assert.equal(lifecycle.readCurrent().species, "human");
  assert.equal(store.writes.length, 0);
}

// A different reset and an unreadable persisted value both start a fresh record safely.
{
  const previous = createStateLogRecord(observation({ reset: 1, day: 3 }));
  const store = createStore(previous);
  const lifecycle = createStateLogRecorder({
    store,
    reader: { read: (tick) => observation({ reset: 2, tick, day: 14 }) },
  });
  lifecycle.recordProcessedCycle(1, {
    stateLogEnabled: true,
    stateLogInterval: 1,
  });
  assert.equal(lifecycle.readCurrent().reset, 2);
  assert.equal(lifecycle.readCurrent().startDay, 14);
  assert.equal(lifecycle.readCurrent().sampleCount, 1);

  const corruptLifecycle = createStateLogRecorder({
    store: createStore("corrupt"),
    reader: { read: (tick) => observation({ tick }) },
  });
  assert.doesNotThrow(() =>
    corruptLifecycle.recordProcessedCycle(1, {
      stateLogEnabled: true,
      stateLogInterval: 1,
    }),
  );
  assert.equal(corruptLifecycle.readCurrent().sampleCount, 1);
}

// A real commit seals and flushes the ending run before any new reset identity is sampled.
{
  const store = createStore();
  const downloads = [];
  const lifecycle = createStateLogRecorder({
    store,
    reader: { read: (tick) => observation({ tick, day: 16 }) },
    download: {
      triggerFileDownload: (contents, filename) =>
        downloads.push({ contents, filename }),
    },
  });
  const settings = {
    stateLogEnabled: true,
    stateLogInterval: 1,
    stateLogAutoDownload: true,
  };
  lifecycle.recordProcessedCycle(1, settings);
  lifecycle.prestigeCommitted(settings, 2, 17);
  lifecycle.prestigeCommitted(settings, 2, 17);
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].filename, "evolve-statelog-human-r2-d17.json");
  assert.deepEqual(JSON.parse(downloads[0].contents), store.writes[0]);
  assert.equal(lifecycle.readCurrent().reset, 2);

  const failedStore = createStore();
  const failedDownloads = [];
  const failedAttempt = createStateLogRecorder({
    store: failedStore,
    reader: { read: (tick) => observation({ tick }) },
    download: {
      triggerFileDownload: (contents, filename) =>
        failedDownloads.push({ contents, filename }),
    },
  });
  failedAttempt.recordProcessedCycle(1, settings);
  assert.equal(failedDownloads.length, 0);
}

// A reset before the next sample can use a persisted log only when its run identity matches.
{
  const priorRun = createStateLogRecord(observation({ reset: 4, tick: 10 }));
  const matchingStore = createStore(priorRun);
  const matchingDownloads = [];
  const matchingRecorder = createStateLogRecorder({
    store: matchingStore,
    reader: { read: (tick) => observation({ tick }) },
    download: {
      triggerFileDownload: (contents, filename) =>
        matchingDownloads.push({ contents, filename }),
    },
  });
  const settings = {
    stateLogEnabled: true,
    stateLogInterval: 50,
    stateLogAutoDownload: true,
  };
  matchingRecorder.prestigeCommitted(settings, 4);
  assert.equal(matchingDownloads.length, 1);
  assert.equal(
    matchingDownloads[0].filename,
    "evolve-statelog-human-r4-d9.json",
  );

  const staleStore = createStore(priorRun);
  const staleDownloads = [];
  const staleRecorder = createStateLogRecorder({
    store: staleStore,
    reader: { read: (tick) => observation({ tick }) },
    download: {
      triggerFileDownload: (contents, filename) =>
        staleDownloads.push({ contents, filename }),
    },
  });
  staleRecorder.prestigeCommitted(settings, 5);
  assert.equal(staleDownloads.length, 0);
}

// Schema v2 is deliberately discarded; a full current-format run keeps the original 20k cap.
{
  assert.equal(parseStateLogRecord({ v: 2, reset: 1, samples: [] }), null);
  assert.equal(
    parseStateLogRecord({
      version: 3,
      reset: 1,
      startDay: 0,
      species: "human",
      sampleCount: 0,
      samples: [],
    }),
    null,
  );
  const first = createStateLogRecord(observation({ tick: 0 }));
  const full = {
    ...first,
    sampleCount: STATE_LOG_SAMPLE_LIMIT,
    samples: Array(STATE_LOG_SAMPLE_LIMIT).fill(first.samples[0]),
  };
  const capped = appendStateLogRecord(full, observation({ tick: 1 }));
  assert.equal(capped.sampleCount, STATE_LOG_SAMPLE_LIMIT + 1);
  assert.equal(capped.samples.length, STATE_LOG_SAMPLE_LIMIT);
  assert.equal(capped.samples.at(-1).tick, 1);
}

console.log("State Log lifecycle tests passed");
