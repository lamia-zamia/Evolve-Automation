import type { CommandExecutionOutcome } from "../../domain/commands.ts";
import {
  planPsychic,
  type PsychicBoostCandidate,
  type PsychicDecision,
  type PsychicInput,
  type PsychicRoomView,
} from "../../domain/traits/psychic.ts";
import type { DecisionExecutor } from "../../ports/decision-executor.ts";
import type { PsychicControls, PsychicReader } from "../../ports/psychic.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

interface CapturedResource {
  readonly record: UnknownRecord;
  readonly view: Readonly<PsychicRoomView>;
}

interface CapturedBoostResource extends CapturedResource {
  readonly id: string;
}

interface PsychicSession {
  readonly input: Readonly<PsychicInput>;
  readonly resources: UnknownRecord;
  readonly energy: UnknownRecord;
  readonly population: UnknownRecord | null;
  readonly thrall: UnknownRecord | null;
  readonly money: CapturedResource | null;
  readonly powers: UnknownRecord;
  readonly stats: UnknownRecord | null;
  readonly boostResources: readonly CapturedBoostResource[];
}

export interface PsychicAdapterDependencies {
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
  readonly getResources: () => unknown;
  readonly controls: PsychicControls;
}

function requireMode(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

function readGlobal(gameValue: unknown): UnknownRecord {
  const game = requireRecord(gameValue, "game");
  return requireRecord(game["global"], "game.global");
}

function readTechnologyLevel(tech: UnknownRecord, key: string): number {
  const value = tech[key];
  if (value === undefined || value === null || value === 0) return 0;
  return requireNumber(value, `game.global.tech.${key}`);
}

function readRoom(record: UnknownRecord, path: string): PsychicRoomView {
  return Object.freeze({
    current: requireNumber(
      record["currentQuantity"],
      `${path}.currentQuantity`,
    ),
    income: requireNumber(record["income"], `${path}.income`),
    maximum: requireNumber(record["maxQuantity"], `${path}.maxQuantity`),
  });
}

function emptyInput(): PsychicInput {
  return Object.freeze({
    available: false,
    mode: "none",
    technologyLevel: 0,
    killCount: 10,
    energyCurrent: 0,
    energyStorageRatio: 0,
    populationCurrent: 0,
    thrallAvailable: false,
    thrallTechnologyLevel: 0,
    thrallRate: 0,
    thrallStorageRatio: 0,
    cashActive: false,
    boostActive: false,
    assaultActive: false,
    money: null,
    boostResourceMode: "none",
    boostCandidates: Object.freeze([]),
  });
}

function decisionsMatch(
  left: Readonly<PsychicDecision>,
  right: Readonly<PsychicDecision>,
): boolean {
  return (
    left.kind === right.kind &&
    left.power === right.power &&
    left.energyCost === right.energyCost &&
    left.expectedEnergy === right.expectedEnergy &&
    left.expectedTechnologyLevel === right.expectedTechnologyLevel &&
    left.boostedResourceId === right.boostedResourceId
  );
}

function roomMatches(
  record: UnknownRecord,
  expected: Readonly<PsychicRoomView>,
  path: string,
): boolean {
  const actual = readRoom(record, path);
  return (
    actual.current === expected.current &&
    actual.income === expected.income &&
    actual.maximum === expected.maximum
  );
}

export function createPsychicAdapter(
  dependencies: PsychicAdapterDependencies,
): {
  readonly reader: PsychicReader;
  readonly executor: DecisionExecutor<PsychicDecision>;
} {
  let session: PsychicSession | null = null;

  const reader: PsychicReader = Object.freeze({
    readGate() {
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const mode = requireMode(
        settings["psychicPower"],
        "settings.psychicPower",
      );
      if (mode === "none") {
        session = null;
        return Object.freeze({ unlocked: false });
      }
      const global = readGlobal(dependencies.getGame());
      const race = requireRecord(global["race"], "game.global.race");
      if (!race["psychic"]) {
        session = null;
        return Object.freeze({ unlocked: false });
      }
      const tech = requireRecord(global["tech"], "game.global.tech");
      if (readTechnologyLevel(tech, "psychic") === 0) {
        session = null;
        return Object.freeze({ unlocked: false });
      }
      const resources = requireRecord(dependencies.getResources(), "resources");
      const energy = requireRecord(resources["Energy"], "resources.Energy");
      const storageRatio = requireNumber(
        energy["storageRatio"],
        "resources.Energy.storageRatio",
      );
      if (storageRatio < 1) {
        session = null;
        return Object.freeze({ unlocked: false });
      }
      return Object.freeze({ unlocked: true });
    },

    readPlan(): PsychicInput {
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const mode = requireMode(
        settings["psychicPower"],
        "settings.psychicPower",
      );
      if (mode === "none") {
        session = null;
        return emptyInput();
      }
      const global = readGlobal(dependencies.getGame());
      const race = requireRecord(global["race"], "game.global.race");
      const tech = requireRecord(global["tech"], "game.global.tech");
      const technologyLevel = readTechnologyLevel(tech, "psychic");
      if (!race["psychic"] || technologyLevel === 0) {
        session = null;
        return emptyInput();
      }
      const resources = requireRecord(dependencies.getResources(), "resources");
      const energy = requireRecord(resources["Energy"], "resources.Energy");
      const energyStorageRatio = requireNumber(
        energy["storageRatio"],
        "resources.Energy.storageRatio",
      );
      if (energyStorageRatio < 1) {
        session = null;
        return emptyInput();
      }
      const energyCurrent = requireNumber(
        energy["currentQuantity"],
        "resources.Energy.currentQuantity",
      );

      let stats: UnknownRecord | null = null;
      let killCount = 10;
      if (mode !== "boost" && mode !== "murder") {
        stats = requireRecord(global["stats"], "game.global.stats");
        killCount = requireNumber(
          stats["psykill"],
          "game.global.stats.psykill",
        );
      }
      const murderEligible =
        mode === "murder" || (mode !== "boost" && killCount < 10);
      const population = murderEligible
        ? requireRecord(resources["Population"], "resources.Population")
        : null;
      const populationCurrent =
        population === null
          ? 0
          : requireNumber(
              population["currentQuantity"],
              "resources.Population.currentQuantity",
            );

      const thrallTechnologyLevel = readTechnologyLevel(tech, "psychicthrall");
      const thrallAvailable = Boolean(
        thrallTechnologyLevel && tech["unfathomable"] && race["unfathomable"],
      );
      const thrall = thrallAvailable
        ? requireRecord(resources["Thrall"], "resources.Thrall")
        : null;
      const thrallRate =
        thrall === null
          ? 0
          : requireNumber(
              thrall["rateOfChange"],
              "resources.Thrall.rateOfChange",
            );
      const thrallStorageRatio =
        thrall === null
          ? 0
          : requireNumber(
              thrall["storageRatio"],
              "resources.Thrall.storageRatio",
            );

      const powers = requireRecord(
        race["psychicPowers"],
        "game.global.race.psychicPowers",
      );
      let money: CapturedResource | null = null;
      if ((mode === "auto" || mode === "profit") && technologyLevel >= 3) {
        const record = requireRecord(resources["Money"], "resources.Money");
        money = Object.freeze({
          record,
          view: readRoom(record, "resources.Money"),
        });
      }

      const boostActive = Boolean(powers["boostTime"]);
      let boostResourceMode = "none";
      const boostCandidates: PsychicBoostCandidate[] = [];
      const boostResources: CapturedBoostResource[] = [];
      if (
        (mode === "auto" || mode === "boost") &&
        !boostActive &&
        energyCurrent >= (technologyLevel >= 5 ? 60 : 75)
      ) {
        boostResourceMode = requireMode(
          settings["psychicBoostRes"],
          "settings.psychicBoostRes",
        );
        if (boostResourceMode === "auto") {
          for (const [index, rawResource] of Object.values(
            resources,
          ).entries()) {
            const record = requireRecord(rawResource, `resources[${index}]`);
            const isUnlocked = requireFunction(
              record["isUnlocked"],
              `resources[${index}].isUnlocked`,
            );
            if (!Reflect.apply(isUnlocked, record, [])) continue;
            const atomicMass = requireNumber(
              record["atomicMass"],
              `resources[${index}].atomicMass`,
            );
            if (atomicMass <= 0) continue;
            const view = readRoom(record, `resources[${index}]`);
            const id = record["id"];
            if (typeof id !== "string") {
              throw new TypeError(`resources[${index}].id must be a string`);
            }
            boostCandidates.push(Object.freeze({ id, ...view }));
            boostResources.push(Object.freeze({ id, record, view }));
          }
        }
      }

      const input: PsychicInput = Object.freeze({
        available: true,
        mode,
        technologyLevel,
        killCount,
        energyCurrent,
        energyStorageRatio,
        populationCurrent,
        thrallAvailable,
        thrallTechnologyLevel,
        thrallRate,
        thrallStorageRatio,
        cashActive: Boolean(powers["cash"]),
        boostActive,
        assaultActive: Boolean(powers["assaultTime"]),
        money: money?.view ?? null,
        boostResourceMode,
        boostCandidates: Object.freeze(boostCandidates),
      });
      session = Object.freeze({
        input,
        resources,
        energy,
        population,
        thrall,
        money,
        powers,
        stats,
        boostResources: Object.freeze(boostResources),
      });
      return input;
    },
  });

  function validateLiveState(
    active: PsychicSession,
    decision: Readonly<PsychicDecision>,
  ): CommandExecutionOutcome {
    const global = readGlobal(dependencies.getGame());
    const race = requireRecord(global["race"], "game.global.race");
    const tech = requireRecord(global["tech"], "game.global.tech");
    const technologyLevel = readTechnologyLevel(tech, "psychic");
    if (
      !race["psychic"] ||
      technologyLevel !== active.input.technologyLevel ||
      race["psychicPowers"] !== active.powers
    ) {
      return stale("psychic-game-state-changed", "psychic game state changed");
    }
    if (dependencies.getResources() !== active.resources) {
      return stale("psychic-resources-changed", "psychic resources changed");
    }
    const energyCurrent = requireNumber(
      active.energy["currentQuantity"],
      "resources.Energy.currentQuantity",
    );
    const energyStorageRatio = requireNumber(
      active.energy["storageRatio"],
      "resources.Energy.storageRatio",
    );
    if (
      energyCurrent !== active.input.energyCurrent ||
      energyStorageRatio !== active.input.energyStorageRatio
    ) {
      return stale("psychic-energy-changed", "psychic Energy changed", {
        expectedEnergy: active.input.energyCurrent,
        actualEnergy: energyCurrent,
      });
    }

    if (decision.power === "murder") {
      if (active.population === null) {
        return stale(
          "psychic-population-missing",
          "psychic Population snapshot is missing",
        );
      }
      const population = requireNumber(
        active.population["currentQuantity"],
        "resources.Population.currentQuantity",
      );
      if (population !== active.input.populationCurrent) {
        return stale(
          "psychic-population-changed",
          "psychic Population changed",
        );
      }
      if (active.stats !== null) {
        const killCount = requireNumber(
          active.stats["psykill"],
          "game.global.stats.psykill",
        );
        if (killCount !== active.input.killCount) {
          return stale(
            "psychic-kill-count-changed",
            "psychic kill count changed",
          );
        }
      }
    }

    if (decision.power === "mind_break" || decision.power === "stun") {
      const thrallLevel = readTechnologyLevel(tech, "psychicthrall");
      if (
        active.thrall === null ||
        thrallLevel !== active.input.thrallTechnologyLevel ||
        !tech["unfathomable"] ||
        !race["unfathomable"]
      ) {
        return stale(
          "psychic-thrall-state-changed",
          "psychic Thrall state changed",
        );
      }
      const rate = requireNumber(
        active.thrall["rateOfChange"],
        "resources.Thrall.rateOfChange",
      );
      const ratio = requireNumber(
        active.thrall["storageRatio"],
        "resources.Thrall.storageRatio",
      );
      if (
        rate !== active.input.thrallRate ||
        ratio !== active.input.thrallStorageRatio
      ) {
        return stale("psychic-thrall-changed", "psychic Thrall values changed");
      }
    }

    if (
      decision.power === "profit" &&
      (active.money === null ||
        !roomMatches(
          active.money.record,
          active.money.view,
          "resources.Money",
        ) ||
        Boolean(active.powers["cash"]) !== active.input.cashActive)
    ) {
      return stale(
        "psychic-profit-state-changed",
        "psychic profit state changed",
      );
    }
    if (
      decision.power === "boost" &&
      Boolean(active.powers["boostTime"]) !== active.input.boostActive
    ) {
      return stale(
        "psychic-boost-state-changed",
        "psychic boost state changed",
      );
    }
    if (
      decision.power === "boost" &&
      active.input.boostResourceMode === "auto"
    ) {
      const resource = active.boostResources.find(
        (candidate) => candidate.id === decision.boostedResourceId,
      );
      if (
        resource === undefined ||
        !roomMatches(resource.record, resource.view, `resources.${resource.id}`)
      ) {
        return stale(
          "psychic-boost-resource-changed",
          "psychic boost resource changed",
        );
      }
    }
    if (
      decision.power === "assault" &&
      Boolean(active.powers["assaultTime"]) !== active.input.assaultActive
    ) {
      return stale(
        "psychic-assault-state-changed",
        "psychic assault state changed",
      );
    }
    return SUCCEEDED;
  }

  const executor: DecisionExecutor<PsychicDecision> = Object.freeze({
    execute(decision: Readonly<PsychicDecision>) {
      const active = session;
      if (active === null) {
        return stale("psychic-session-missing", "psychic session is missing");
      }
      const expected = planPsychic(active.input).find((candidate) =>
        decisionsMatch(candidate, decision),
      );
      if (expected === undefined) {
        return rejected(
          "invalid-psychic-decision",
          "psychic decision was not present in the sampled plan",
        );
      }
      const liveState = validateLiveState(active, decision);
      if (liveState.status !== "succeeded") return liveState;
      if (!dependencies.controls.activate(decision)) {
        return stale(
          "psychic-control-unavailable",
          `psychic ${decision.power} control is unavailable`,
        );
      }
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
