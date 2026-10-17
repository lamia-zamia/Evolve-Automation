import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createChromiumRunner,
  decodeExport,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bundle = resolve(root, "evolve_automation.user.js");
const bundleBytes = await readFile(bundle);
const bundleText = bundleBytes.toString("utf8");
const bundleIdentity = createHash("sha256").update(bundleBytes).digest("hex");
for (const marker of [
  "captureCompletedTechConditionsDuring",
  "researchConditionGateCompromised",
  "researchConditionGateObserveRegistry",
]) {
  assert.equal(
    bundleText.includes(marker),
    false,
    `ordinary bundle omits ${marker}`,
  );
}

const save = parseSave(
  await readFile(
    resolve(
      root,
      "test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt",
    ),
    "utf8",
  ),
);
const rawSettings = JSON.parse(
  await readFile(
    resolve(root, "test-artifacts/benchmark/slice0/settings/mad-disabled.json"),
    "utf8",
  ),
);
const settings = JSON.stringify({
  ...rawSettings,
  autoPrestige: true,
  autoEvolution: true,
  autoResearch: true,
  autoBuild: true,
  buildingAlwaysClick: false,
  evolutionQueue: [],
  evolutionQueueEnabled: false,
});

const games = [
  {
    label: "pinned DeadSpace",
    path: resolve(root, "test-artifacts/game/evolve-deadspace.js"),
    upstream: "D:/work/Evolve-DeadSpace",
    commit: "db38e2af831907d49aeb5348d678d8d8745d6c3f",
  },
  {
    label: "beta source snapshot",
    path: resolve(root, "test-artifacts/game/evolve-beta-bc12393.js"),
    upstream: "D:/work/Evolve-Beta",
    commit: "bc12393a2bee95ded06920a0f9d53caaf3ba38f2",
  },
];

function currentNativeState() {
  const capture = window[Symbol.for("evolve-automation.page-capture")];
  const state = capture?.rootState?.readRoot?.();
  const jobControls = (capture?.controls?.capturedElementIds?.() ?? [])
    .filter((id) => /job|servant|farmer|craft/i.test(id))
    .map((id) => ({
      id,
      methods: [...(capture.controls.resolve(id)?.methods ?? [])],
    }));
  return {
    loads: window.__EA_RUNNER__?.loads?.() ?? null,
    species: state?.race?.species ?? null,
    reset: state?.stats?.reset ?? null,
    day: state?.stats?.days ?? null,
    RNA: state?.resource?.RNA?.amount ?? null,
    DNA: state?.resource?.DNA?.amount ?? null,
    jobs: state?.civic?.jobs ?? null,
    jobControls,
  };
}

const reports = [];
for (const game of games) {
  const runner = await createChromiumRunner({
    game: game.path,
    upstream: game.upstream,
  });
  let session;
  try {
    session = await runner.openSession({
      bundle,
      save,
      settings,
      seed: 42,
      snapshotAt: [43, 51],
    });
    const initial = await session.evaluate(currentNativeState);
    for (let completed = 0; completed < 6000; completed += 100) {
      await session.advance(Math.min(100, 6000 - completed));
    }
    const final = await session.evaluate(currentNativeState);
    const snapshots = await session.snapshots();
    const protoplasm = decodeExport(snapshots[43].exportSave);
    const evolved = decodeExport(snapshots[51].exportSave);
    const diagnostics = await session.diagnostics();
    const usageAtEvolution = snapshots[51].controlUsage;
    const usage = diagnostics.controlUsage;
    const count = (counts, key) => counts?.[key]?.returned ?? 0;
    const madCalls = {
      arm: count(usage, "mad.arm"),
      launch: count(usage, "mad.launch"),
    };
    const evolutionCalls = {
      humanoid: count(usage, "evolution-humanoid.action"),
      human: count(usage, "evolution-human.action"),
    };
    const constructionCallsAfterHuman = Object.fromEntries(
      Object.entries(usage)
        .filter(([key]) => /^city-.+\.action$/.test(key))
        .map(([key, calls]) => [
          key,
          Math.max(0, calls.returned - count(usageAtEvolution, key)),
        ])
        .filter(([, calls]) => calls > 0),
    );
    const report = {
      game: { label: game.label, commit: game.commit, path: game.path },
      bundle: { path: bundle, sha256: bundleIdentity },
      initial,
      snapshots: {
        protoplasm: {
          period: 43,
          species: protoplasm.race?.species ?? null,
          RNA: protoplasm.resource?.RNA?.amount ?? null,
          DNA: protoplasm.resource?.DNA?.amount ?? null,
        },
        human: {
          period: 51,
          species: evolved.race?.species ?? null,
          reset: evolved.stats?.reset ?? null,
        },
      },
      final,
      madCalls,
      evolutionCalls,
      constructionCallsAfterHuman,
      workTicks: diagnostics.workTicks,
      errors: diagnostics.events
        .filter((event) =>
          ["error", "pageerror", "rejection"].includes(event.kind),
        )
        .map(({ kind, text }) => ({ kind, text })),
      assertions: {
        resetIncreasedExactlyOnce: final.reset - initial.reset === 1,
        oneNewDocument: final.loads - initial.loads === 1,
        protoplasmInitialized:
          protoplasm.race?.species === "protoplasm" &&
          protoplasm.resource?.RNA !== undefined &&
          protoplasm.resource?.DNA !== undefined,
        nativeHumanoidAndHumanInvoked:
          evolutionCalls.humanoid > 0 && evolutionCalls.human > 0,
        speciesHuman: final.species === "human",
        civilizationConstructionAfterHuman:
          Object.keys(constructionCallsAfterHuman).length > 0,
        automationContinuedAfterEvolution:
          Object.keys(constructionCallsAfterHuman).length > 0,
      },
    };
    for (const [name, passed] of Object.entries(report.assertions)) {
      assert.equal(passed, true, `${game.label}: ${name}`);
    }
    assert.equal(madCalls.arm, 1, `${game.label}: MAD arm called once`);
    assert.equal(madCalls.launch, 1, `${game.label}: MAD launch called once`);
    reports.push(report);
  } finally {
    await session?.close();
    await runner.close();
  }
}

console.log(
  JSON.stringify(
    { bundle: { path: bundle, sha256: bundleIdentity }, reports },
    null,
    2,
  ),
);
