import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bundle = resolve(root, "evolve_automation.user.js");
const bundleBytes = await readFile(bundle);
const bundleIdentity = createHash("sha256").update(bundleBytes).digest("hex");
const pinnedGame = resolve(root, "test-artifacts/game/evolve-deadspace.js");
const betaGame = resolve(root, "test-artifacts/game/evolve-beta-bc12393.js");
const pinnedUpstream = "D:/work/Evolve-DeadSpace";
const betaUpstream = "D:/work/Evolve-Beta";
const lateSave = parseSave(
  await readFile(
    resolve(
      root,
      "test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt",
    ),
    "utf8",
  ),
);
const earlySave = parseSave(
  await readFile(
    resolve(
      root,
      "test-artifacts/benchmark/slice0/saves/deadspace-early-day14.json",
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

function settingsFor({ prestige, evolution, autoBuild = true }) {
  return JSON.stringify({
    ...rawSettings,
    autoPrestige: prestige,
    autoEvolution: evolution,
    autoResearch: true,
    autoBuild,
    buildingAlwaysClick: false,
    evolutionQueue: [],
    evolutionQueueEnabled: false,
  });
}

function summaryView() {
  const capture = window[Symbol.for("evolve-automation.page-capture")];
  const state = capture?.rootState?.readRoot?.();
  const resource = state?.resource ?? {};
  const controls = capture?.controls;
  const control = (id) => {
    const handle = controls?.resolve?.(id);
    return handle === undefined
      ? null
      : { generation: handle.generation, methods: [...handle.methods] };
  };
  const actionIds = controls?.capturedElementIds?.() ?? [];
  const action = (id) => {
    const value = resource[id];
    return value === undefined
      ? null
      : { amount: value.amount, max: value.max };
  };
  return {
    loads: window.__EA_RUNNER__?.loads?.() ?? null,
    periods: window.__EA_RUNNER__?.periods?.() ?? null,
    species: state?.race?.species ?? null,
    universe: state?.race?.universe ?? null,
    seeded: state?.race?.seeded ?? null,
    chose: state?.race?.chose ?? null,
    bigbang: state?.race?.bigbang ?? null,
    finalEvolutionMenu: state?.race?.evoFinalMenu ?? null,
    evolutionAttempts: state?.stats?.evo ?? null,
    newGame: state?.new ?? null,
    paused: state?.settings?.pause ?? null,
    showEvolution: state?.settings?.showEvolve ?? null,
    automationEvolution: (() => {
      try {
        return (
          JSON.parse(localStorage.getItem("settings") ?? "{}").autoEvolution ??
          null
        );
      } catch {
        return null;
      }
    })(),
    automationTargets: (() => {
      try {
        const values = JSON.parse(localStorage.getItem("settings") ?? "{}");
        return {
          universe: values.userUniverseTargetName ?? null,
          planet: values.userPlanetTargetName ?? null,
          evolution: values.userEvolutionTarget ?? null,
          master: values.masterScriptToggle ?? null,
        };
      } catch {
        return null;
      }
    })(),
    day: state?.stats?.days ?? null,
    totalDays: state?.stats?.tdays ?? null,
    reset: state?.stats?.reset ?? null,
    madTech: state?.tech?.mad ?? null,
    madArmed: state?.civic?.mad?.armed ?? null,
    resourceKeys: Object.keys(resource).length,
    evolutionKeys: Object.keys(state?.evolution ?? {}).length,
    RNA: action("RNA"),
    DNA: action("DNA"),
    Mana: action("Mana"),
    controls: {
      mad: control("mad"),
      evolutionRNA: control("evolution-rna"),
      evolutionDNA: control("evolution-dna"),
    },
    capturedEvolutionIds: actionIds.filter((id) => id.startsWith("evolution-")),
    evolutionActionCount: actionIds.filter((id) => id.startsWith("evolution-"))
      .length,
    targetCommitted: document.body.innerText.includes(
      "Attempting evolution of Human.",
    ),
    renderedEvolutionRoot: Boolean(document.querySelector("#evolution")),
    renderedRNAAction: Boolean(document.querySelector("#evolution-rna")),
    renderedDNAAction: Boolean(document.querySelector("#evolution-dna")),
  };
}

async function runScenario({
  game,
  upstream,
  save,
  settings,
  periods,
  chunkSize = 100,
}) {
  const runner = await createChromiumRunner({ game, upstream });
  let session;
  try {
    session = await runner.openSession({
      bundle,
      save,
      settings,
      seed: 42,
      perf: true,
    });
    let reloads = 0;
    const observations = [];
    let prior = null;
    for (let completed = 0; completed < periods; completed += chunkSize) {
      const advanced = await session.advance(
        Math.min(chunkSize, periods - completed),
      );
      reloads += advanced.reloads;
      const current = await session.evaluate(summaryView);
      const marker = [
        current.loads,
        current.reset,
        current.species,
        Boolean(current.RNA),
        Boolean(current.DNA),
        current.controls.evolutionRNA?.generation ?? null,
        current.controls.evolutionDNA?.generation ?? null,
      ].join("|");
      if (marker !== prior || (completed + chunkSize) % 1000 === 0) {
        observations.push(current);
        prior = marker;
      }
    }
    const diagnostics = await session.diagnostics();
    const relevantUsage = Object.fromEntries(
      Object.entries(diagnostics.controlUsage).filter(([key]) =>
        /^(mad\.|evolution-|city-(food|lumber|stone)|undefined-food)/.test(key),
      ),
    );
    const errorGroups = new Map();
    for (const event of diagnostics.events) {
      if (!["pageerror", "rejection", "error"].includes(event.kind)) continue;
      const key = `${event.kind}:${event.text.slice(0, 180)}`;
      errorGroups.set(key, (errorGroups.get(key) ?? 0) + 1);
    }
    return {
      observations,
      reloads,
      errorCounts: diagnostics.counts,
      boundedLogLines: diagnostics.lines,
      boundedErrors: [...errorGroups].map(([message, count]) => ({
        message,
        count,
      })),
      relevantControlUsage: relevantUsage,
      workTicks: diagnostics.workTicks,
      captureComplete: diagnostics.captureComplete,
      serverMisses: runner.serverMisses(),
    };
  } finally {
    await session?.close();
    await runner.close();
  }
}

function configureGatherSave(save, primitive) {
  const configured = structuredClone(save);
  configured.race.universe = "magic";
  configured.race.sappy = false;
  configured.race.fasting = false;
  configured.tech.conjuring = 2;
  configured.tech.primitive = primitive;
  configured.city.rock_quarry = { count: 0 };
  configured.resource.Mana.amount = 1;
  configured.resource.Food.amount = Math.max(
    100,
    configured.resource.Food.amount,
  );
  configured.resource.Lumber.amount = 0;
  configured.resource.Stone.amount = 0;
  return configured;
}

const report = {
  bundle: { path: bundle, sha256: bundleIdentity },
  games: [
    {
      label: "pinned DeadSpace",
      commit: "db38e2af831907d49aeb5348d678d8d8745d6c3f",
      game: pinnedGame,
    },
    {
      label: "beta source snapshot",
      commit: "bc12393a2bee95ded06920a0f9d53caaf3ba38f2",
      game: betaGame,
    },
  ],
  scenarios: {},
};
const onlyScenarios = new Set(
  process.argv.slice(2).flatMap((value) => value.split(",")),
);
async function runNamedScenario(name, options) {
  if (onlyScenarios.size > 0 && !onlyScenarios.has(name)) return;
  report.scenarios[name] = await runScenario(options);
}

for (const game of report.games) {
  const pinned = game.label === "pinned DeadSpace";
  const upstream = pinned ? pinnedUpstream : betaUpstream;
  const gatherSource = pinned ? earlySave : lateSave;
  await runNamedScenario(`${pinned ? "pinned" : "beta"}-mad-transition`, {
    game: game.game,
    upstream,
    save: lateSave,
    settings: settingsFor({ prestige: true, evolution: true }),
    periods: 6000,
  });
  await runNamedScenario(`${pinned ? "pinned" : "beta"}-direct-new-game`, {
    game: game.game,
    upstream,
    save: null,
    settings: settingsFor({ prestige: false, evolution: true }),
    periods: 6000,
  });
  await runNamedScenario(`${pinned ? "pinned" : "beta"}-gather-bootstrap`, {
    game: game.game,
    upstream,
    save: configureGatherSave(gatherSource, undefined),
    settings: settingsFor({ prestige: false, evolution: false }),
    periods: 1000,
  });
  await runNamedScenario(`${pinned ? "pinned" : "beta"}-gather-mature`, {
    game: game.game,
    upstream,
    save: configureGatherSave(lateSave, 1),
    settings: settingsFor({ prestige: false, evolution: false }),
    periods: 1000,
  });
}

const output = resolve(
  root,
  "test-artifacts/autoclick-mad-evolution-replay.json",
);
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(output);
