import assert from "node:assert/strict";

import { createStateLogRecord } from "../src/domain/state-log.ts";
import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";
import { createTestDocument, element } from "./dom-fixture.mjs";

function makeRoot(overrides = {}) {
  return {
    race: { species: "human" },
    stats: { days: 7, reset: 4, tdays: 12 },
    tech: {},
    civic: {},
    city: {},
    settings: {},
    resource: {
      Money: {
        amount: 1000,
        max: 2000,
        diff: 10,
        display: true,
        value: 1,
      },
      Knowledge: {
        amount: 200,
        max: 500,
        diff: 2,
        display: true,
        value: 1,
      },
    },
    ...overrides,
  };
}

function makeRuntime({
  settings = {},
  root: initialRoot,
  initialLog,
  invoke,
} = {}) {
  let root = initialRoot ?? makeRoot();
  let cycle;
  const values = new Map([
    [
      "settings",
      JSON.stringify({
        masterScriptToggle: true,
        autoBuild: false,
        autoResearch: false,
        autoPrestige: false,
        stateLogEnabled: false,
        stateLogAutoDownload: false,
        stateLogInterval: 20,
        ...settings,
      }),
    ],
  ]);
  if (initialLog !== undefined) {
    values.set(
      "ea_state_log",
      typeof initialLog === "string" ? initialLog : JSON.stringify(initialLog),
    );
  }
  const storageWrites = [];
  const blobs = new Map();
  const links = [];
  let objectUrlIndex = 0;
  class BlobFixture {
    constructor(parts) {
      this.parts = parts;
    }
  }
  const rootElement = element("main");
  const document = createTestDocument(rootElement);
  const createElement = document.createElement;
  document.createElement = (tag) => {
    const node = createElement(tag);
    if (tag === "a") links.push(node);
    return node;
  };
  const pageWindow = {
    document,
    navigator: { platform: "Win32" },
    location: "https://evolve.test/",
    confirm: () => true,
    Blob: BlobFixture,
    URL: {
      createObjectURL(blob) {
        const url = `blob:state-log-${++objectUrlIndex}`;
        blobs.set(url, blob);
        return url;
      },
      revokeObjectURL() {},
    },
    setTimeout: () => 1,
  };
  const madHandle = {
    elementId: "mad",
    generation: 1,
    methods: ["arm", "launch"],
  };
  const controls = {
    resolve: (id) => (id === "mad" ? madHandle : undefined),
    invoke: (handle, method, args = []) => {
      if (invoke !== undefined) {
        return invoke({
          handle,
          method,
          args,
          readRoot: () => root,
          replaceRoot: (next) => {
            root = next;
          },
        });
      }
      return { ok: false, reason: "unknown-control" };
    },
    capturedElementIds: () => ["mad"],
  };
  const errors = [];
  const stop = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      mechanics: { readStructures: () => undefined },
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls,
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document,
    settingsHostWindow: pageWindow,
    exportToPage: (value) => value,
    mouseEvent: class {},
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
        storageWrites.push(key);
      },
    },
    logError: (message) => errors.push(message),
  });
  return {
    cycle: (periods = 4) => cycle({ periods }),
    stop,
    settingsHostWindow: pageWindow,
    values,
    storageWrites,
    errors,
    readDownloadedLog: (index = -1) => {
      const link = links.at(index);
      if (link === undefined) return null;
      const blob = blobs.get(link.href);
      return {
        filename: link.download,
        record: JSON.parse(blob.parts[0]),
      };
    },
  };
}

// The advertised hook is installed at runtime start and is safe before the first due sample.
{
  const runtime = makeRuntime({
    settings: {
      stateLogEnabled: true,
      stateLogInterval: 2,
      activeTargetsUI: false,
      buildPlannerUI: false,
    },
  });
  assert.equal(typeof runtime.settingsHostWindow.eaExportStateLog, "function");
  runtime.settingsHostWindow.eaExportStateLog();
  assert.equal(runtime.readDownloadedLog(), null);

  // Three raw wakes do not pass tickRate; the fourth makes processed cycle 1.
  runtime.cycle(1);
  runtime.cycle(1);
  runtime.cycle(1);
  runtime.cycle(1);
  runtime.settingsHostWindow.eaExportStateLog();
  assert.equal(runtime.readDownloadedLog(), null);

  // Only the second processed cycle is due. Its export is the current in-memory record.
  runtime.cycle(1);
  runtime.cycle(1);
  runtime.cycle(1);
  runtime.cycle(1);
  runtime.settingsHostWindow.eaExportStateLog();
  const firstExport = runtime.readDownloadedLog();
  assert.equal(firstExport.filename, "evolve-statelog-manual-d7.json");
  assert.equal(firstExport.record.version, 3);
  assert.equal(firstExport.record.sampleCount, 1);
  assert.equal(firstExport.record.samples[0].tick, 2);

  runtime.cycle(4);
  runtime.cycle(4);
  runtime.settingsHostWindow.eaExportStateLog();
  const secondExport = runtime.readDownloadedLog();
  assert.equal(secondExport.record.sampleCount, 2);
  assert.equal(secondExport.record.samples.at(-1).tick, 4);
  assert.equal(runtime.values.has("ea_state_log"), false);
  runtime.stop();
  assert.equal(runtime.settingsHostWindow.eaExportStateLog, undefined);
}

// Disabled logging performs no state-log writes and the hook safely has nothing to export.
{
  const runtime = makeRuntime({ settings: { stateLogEnabled: false } });
  assert.equal(typeof runtime.settingsHostWindow.eaExportStateLog, "function");
  for (let tick = 0; tick < 12; tick += 1) runtime.cycle();
  assert.equal(runtime.storageWrites.includes("ea_state_log"), false);
  runtime.settingsHostWindow.eaExportStateLog();
  assert.equal(runtime.readDownloadedLog(), null);
  runtime.stop();
}

// Same-reset reload appends to the persisted run; a changed reset starts a clean run.
{
  const prior = createStateLogRecord({
    reset: 4,
    species: "human",
    tick: 10,
    day: 3,
    resources: {
      Money: {
        present: true,
        unlocked: true,
        amount: 100,
        max: 1000,
        rateOfChange: 1,
        storageRatio: 0.1,
      },
      Knowledge: {
        present: true,
        unlocked: true,
        amount: 50,
        max: 500,
        rateOfChange: 2,
        storageRatio: 0.1,
      },
    },
  });
  const sameRun = makeRuntime({
    settings: { stateLogEnabled: true, stateLogInterval: 1 },
    root: makeRoot({ stats: { days: 20, reset: 4, tdays: 32 } }),
    initialLog: { ...prior, sampleCount: 25 },
  });
  sameRun.cycle();
  sameRun.settingsHostWindow.eaExportStateLog();
  const resumed = sameRun.readDownloadedLog().record;
  assert.equal(resumed.sampleCount, 26);
  assert.equal(resumed.startDay, 3);
  assert.equal(resumed.samples.at(-1).day, 20);
  sameRun.stop();

  const newRun = makeRuntime({
    settings: { stateLogEnabled: true, stateLogInterval: 1 },
    root: makeRoot({ stats: { days: 0, reset: 5, tdays: 32 } }),
    initialLog: prior,
  });
  newRun.cycle();
  newRun.settingsHostWindow.eaExportStateLog();
  const fresh = newRun.readDownloadedLog().record;
  assert.equal(fresh.reset, 5);
  assert.equal(fresh.sampleCount, 1);
  assert.equal(fresh.startDay, 0);
  newRun.stop();
}

// Corrupt storage falls back to a new State Log without preventing runtime startup.
{
  const runtime = makeRuntime({
    settings: { stateLogEnabled: true, stateLogInterval: 1 },
    initialLog: "not valid JSON",
  });
  runtime.cycle();
  runtime.settingsHostWindow.eaExportStateLog();
  assert.equal(runtime.readDownloadedLog().record.sampleCount, 1);
  assert.deepEqual(runtime.errors, []);
  runtime.stop();
}

// Auto-download is attached to the captured MAD adapter's confirmed root replacement.
function madRuntime(commits) {
  return makeRuntime({
    settings: {
      autoPrestige: true,
      prestigeType: "mad",
      prestigeMADWait: false,
      prestigeMADPopulation: 28,
      stateLogEnabled: true,
      stateLogInterval: 1,
      stateLogAutoDownload: true,
    },
    root: makeRoot({
      civic: {
        mad: { display: true, armed: true },
        garrison: { workers: 12, max: 20, crew: 2 },
      },
      tech: { mad: 1 },
      resource: {
        Money: {
          amount: 100,
          max: 1000,
          diff: 1,
          display: true,
          value: 1,
        },
        Knowledge: {
          amount: 50,
          max: 500,
          diff: 2,
          display: true,
          value: 1,
        },
        Population: { amount: 30, max: 30, display: true },
      },
    }),
    invoke: ({ method, readRoot, replaceRoot }) => {
      if (method === "launch" && commits) {
        const oldRoot = readRoot();
        replaceRoot({
          ...oldRoot,
          stats: { ...oldRoot.stats, days: 0, reset: oldRoot.stats.reset + 1 },
        });
      }
      return { ok: true, value: undefined };
    },
  });
}

{
  const successful = madRuntime(true);
  successful.cycle(); // Sets the captured one-cycle Reset goal.
  successful.cycle(); // MAD launch replaces the captured root and commits the reset.
  const endingRun = successful.readDownloadedLog();
  assert.equal(endingRun.filename, "evolve-statelog-human-r4-d7.json");
  assert.equal(endingRun.record.reset, 4);
  assert.equal(endingRun.record.samples.length, 1);
  successful.cycle();
  assert.equal(successful.readDownloadedLog(1), null);
  assert.equal(successful.readDownloadedLog().record.reset, 4);
  successful.stop();

  const failed = madRuntime(false);
  failed.cycle();
  failed.cycle(); // Wrapper succeeds but root identity does not change: no commit callback.
  assert.equal(failed.readDownloadedLog(), null);
  failed.stop();
}

console.log("State Log production runtime tests passed");
