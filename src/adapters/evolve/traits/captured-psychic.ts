import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import {
  planPsychic,
  type PsychicBoostCandidate,
  type PsychicDecision,
  type PsychicInput,
  type PsychicPower,
  type PsychicRoomView,
} from "../../../domain/traits/psychic.ts";
import type { DecisionExecutor } from "../../../ports/decision-executor.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type { PsychicControls, PsychicReader } from "../../../ports/psychic.ts";
import { readCapturedResourceView } from "../captured-affordability.ts";
import { stale, SUCCEEDED } from "../../command-outcomes.ts";
import {
  finite,
  isRecord,
  readProperty,
  requireRecord,
  requireString,
} from "../../validation.ts";

export const CAPTURED_PSYCHIC_CONTROL_IDS = Object.freeze({
  boostOptions: "psychicBoost",
  murder: "psychicKill",
  mindBreak: "psychicMindBreak",
  stun: "psychicCapture",
  profit: "psychicFinance",
  boost: "psychicBoost",
  assault: "psychicAssault",
});

const CAPTURED_PSYCHIC_ACTION: Readonly<
  Record<PsychicPower, Readonly<{ controlId: string; method: string }>>
> = Object.freeze({
  murder: Object.freeze({
    controlId: CAPTURED_PSYCHIC_CONTROL_IDS.murder,
    method: "murder",
  }),
  mind_break: Object.freeze({
    controlId: CAPTURED_PSYCHIC_CONTROL_IDS.mindBreak,
    method: "breakMind",
  }),
  stun: Object.freeze({
    controlId: CAPTURED_PSYCHIC_CONTROL_IDS.stun,
    method: "stun",
  }),
  profit: Object.freeze({
    controlId: CAPTURED_PSYCHIC_CONTROL_IDS.profit,
    method: "boostVal",
  }),
  boost: Object.freeze({
    controlId: CAPTURED_PSYCHIC_CONTROL_IDS.boost,
    method: "boostVal",
  }),
  assault: Object.freeze({
    controlId: CAPTURED_PSYCHIC_CONTROL_IDS.assault,
    method: "boostVal",
  }),
});

export interface CapturedPsychicDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => unknown;
  readonly readSettings: () => unknown;
  readonly ensureControls: () => boolean;
}

interface CapturedPsychicRoom extends PsychicRoomView {
  readonly amount: number;
  readonly ratio: number;
}

interface CapturedPsychicSample {
  readonly input: Readonly<PsychicInput>;
  readonly energyAmount: number;
  readonly populationAmount: number;
  readonly killCount: number | undefined;
  readonly duration: number;
  readonly captiveTotals: Readonly<{
    readonly free: number;
    readonly jailed: number;
  }> | null;
}

function capturedPsychicEmptyInput(): PsychicInput {
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

function capturedPsychicTechnologyLevel(tech: unknown, key: string): number {
  const value = readProperty(tech, key);
  return value === undefined || value === null || value === 0
    ? 0
    : (finite(value) ?? 0);
}

function capturedPsychicRoom(
  root: unknown,
  id: string,
): CapturedPsychicRoom | null {
  const view = readCapturedResourceView(root, id);
  if (!view.present) return null;
  const amount = finite(view.amount);
  const maximum = finite(view.max);
  const income = finite(view.rateOfChange);
  const ratio = finite(view.storageRatio);
  if (
    amount === undefined ||
    maximum === undefined ||
    income === undefined ||
    ratio === undefined
  ) {
    return null;
  }
  return Object.freeze({ current: amount, amount, income, maximum, ratio });
}

function capturedPsychicEnergy(
  root: unknown,
): Readonly<{ amount: number; ratio: number }> | null {
  const view = readCapturedResourceView(root, "Energy");
  const amount = finite(view.amount);
  const ratio = finite(view.storageRatio);
  return view.present && amount !== undefined && ratio !== undefined
    ? Object.freeze({ amount, ratio })
    : null;
}

function capturedPsychicRadioOptions(document: unknown): readonly string[] {
  const querySelectorAll = readProperty(document, "querySelectorAll");
  if (typeof querySelectorAll !== "function") return Object.freeze([]);
  let nodes: unknown;
  try {
    nodes = Reflect.apply(querySelectorAll, document, [
      "#psyhscrolltarget input[type='radio']",
    ]);
  } catch {
    return Object.freeze([]);
  }
  const length = finite(readProperty(nodes, "length"));
  if (length === undefined || !Number.isSafeInteger(length) || length < 0) {
    return Object.freeze([]);
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < length; index += 1) {
    const node = readProperty(nodes, String(index));
    const value = readProperty(node, "value");
    if (typeof value === "string" && value.length > 0 && !seen.has(value)) {
      seen.add(value);
      ids.push(value);
    }
  }
  return Object.freeze(ids);
}

function capturedPsychicCaptiveTotals(
  root: unknown,
): Readonly<{ readonly free: number; readonly jailed: number }> | null {
  const city = readProperty(root, "city");
  const dwellers = readProperty(city, "surfaceDwellers");
  const housing = readProperty(city, "captive_housing");
  if (!Array.isArray(dwellers) || !isRecord(housing)) return null;
  let free = 0;
  let jailed = 0;
  for (let index = 0; index < dwellers.length; index += 1) {
    const currentFree = finite(readProperty(housing, `race${index}`));
    const currentJailed = finite(readProperty(housing, `jailrace${index}`));
    if (currentFree === undefined || currentJailed === undefined) return null;
    free += currentFree;
    jailed += currentJailed;
  }
  return Object.freeze({ free, jailed });
}

function capturedPsychicNightmareRank(root: unknown): number {
  return (
    finite(
      readProperty(
        readProperty(
          readProperty(readProperty(root, "stats"), "achieve"),
          "nightmare",
        ),
        "mg",
      ),
    ) ?? 0
  );
}

function capturedPsychicDurationFromRoot(
  root: unknown,
  power: PsychicPower,
): number {
  const race = readProperty(root, "race");
  const psychicPowers = readProperty(race, "psychicPowers");
  const field =
    power === "profit"
      ? "cash"
      : power === "boost"
        ? "boostTime"
        : power === "assault"
          ? "assaultTime"
          : undefined;
  return field === undefined
    ? 0
    : (finite(readProperty(psychicPowers, field)) ?? 0);
}

function capturedPsychicPopulationAmount(root: unknown): number {
  const species = readProperty(readProperty(root, "race"), "species");
  if (typeof species !== "string") return 0;
  const view = readCapturedResourceView(root, species);
  return view.present ? (finite(view.amount) ?? 0) : 0;
}

function capturedPsychicKillCount(root: unknown): number | undefined {
  return finite(readProperty(readProperty(root, "stats"), "psykill"));
}

function capturedPsychicDecisionMatches(
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

export function createCapturedPsychicAutomation(
  dependencies: CapturedPsychicDependencies,
): {
  readonly reader: PsychicReader;
  readonly controls: PsychicControls;
  readonly executor: DecisionExecutor<PsychicDecision>;
} {
  let session: CapturedPsychicSample | null = null;

  function capturedPsychicGate(): boolean {
    const settings = requireRecord(dependencies.readSettings(), "settings");
    if (
      requireString(settings["psychicPower"], "settings.psychicPower") ===
      "none"
    ) {
      session = null;
      return false;
    }
    const root = dependencies.rootState.readRoot();
    const race = readProperty(root, "race");
    const tech = readProperty(root, "tech");
    const technologyLevel = capturedPsychicTechnologyLevel(tech, "psychic");
    const energy = capturedPsychicEnergy(root);
    if (
      !readProperty(race, "psychic") ||
      technologyLevel <= 0 ||
      energy === null ||
      energy.ratio < 1
    ) {
      session = null;
      return false;
    }
    return true;
  }

  function capturedPsychicSamplePlan(): PsychicInput {
    if (!capturedPsychicGate()) return capturedPsychicEmptyInput();
    if (!dependencies.ensureControls()) {
      session = null;
      return capturedPsychicEmptyInput();
    }
    const root = dependencies.rootState.readRoot();
    const settings = requireRecord(dependencies.readSettings(), "settings");
    const race = requireRecord(readProperty(root, "race"), "global.race");
    const tech = readProperty(root, "tech");
    const technologyLevel = capturedPsychicTechnologyLevel(tech, "psychic");
    const energy = capturedPsychicEnergy(root);
    const powers = readProperty(race, "psychicPowers");
    if (energy === null || !isRecord(powers) || technologyLevel <= 0) {
      session = null;
      return capturedPsychicEmptyInput();
    }
    const mode = requireString(
      settings["psychicPower"],
      "settings.psychicPower",
    );
    let killCount = 10;
    if (mode !== "boost" && mode !== "murder") {
      killCount = capturedPsychicKillCount(root) ?? 10;
    }
    const species = readProperty(race, "species");
    const populationAmount =
      typeof species === "string"
        ? (capturedPsychicRoom(root, species)?.amount ?? 0)
        : 0;
    const thrallTechnologyLevel = capturedPsychicTechnologyLevel(
      tech,
      "psychicthrall",
    );
    const thrallAvailable = Boolean(
      thrallTechnologyLevel > 0 &&
      readProperty(tech, "unfathomable") &&
      readProperty(race, "unfathomable"),
    );
    const thrall = thrallAvailable ? capturedPsychicRoom(root, "Thrall") : null;
    const money =
      (mode === "auto" || mode === "profit") && technologyLevel >= 3
        ? capturedPsychicRoom(root, "Money")
        : null;
    const boostActive = Boolean(readProperty(powers, "boostTime"));
    let boostResourceMode = "none";
    const boostCandidates: PsychicBoostCandidate[] = [];
    if (
      (mode === "auto" || mode === "boost") &&
      !boostActive &&
      energy.amount >= (technologyLevel >= 5 ? 60 : 75)
    ) {
      boostResourceMode = requireString(
        settings["psychicBoostRes"],
        "settings.psychicBoostRes",
      );
      if (boostResourceMode === "auto") {
        for (const id of capturedPsychicRadioOptions(
          dependencies.getDocument(),
        )) {
          const resource = capturedPsychicRoom(root, id);
          if (
            resource === null ||
            readProperty(readProperty(root, "resource"), id) === undefined ||
            !readProperty(
              readProperty(readProperty(root, "resource"), id),
              "display",
            )
          ) {
            continue;
          }
          boostCandidates.push(
            Object.freeze({
              id,
              current: resource.current,
              income: resource.income,
              maximum: resource.maximum,
            }),
          );
        }
      }
    }
    const input: PsychicInput = Object.freeze({
      available: true,
      mode,
      technologyLevel,
      killCount,
      energyCurrent: energy.amount,
      energyStorageRatio: energy.ratio,
      populationCurrent: populationAmount,
      thrallAvailable: thrallAvailable && thrall !== null,
      thrallTechnologyLevel,
      thrallRate: thrall?.income ?? 0,
      thrallStorageRatio: thrall?.ratio ?? 0,
      cashActive: Boolean(readProperty(powers, "cash")),
      boostActive,
      assaultActive: Boolean(readProperty(powers, "assaultTime")),
      money:
        money === null
          ? null
          : Object.freeze({
              current: money.current,
              income: money.income,
              maximum: money.maximum,
            }),
      boostResourceMode,
      boostCandidates: Object.freeze(boostCandidates),
    });
    session = Object.freeze({
      input,
      energyAmount: energy.amount,
      populationAmount,
      killCount: capturedPsychicKillCount(root),
      duration: 72 * capturedPsychicNightmareRank(root),
      captiveTotals: capturedPsychicCaptiveTotals(root),
    });
    return input;
  }

  const reader: PsychicReader = Object.freeze({
    readGate: () => Object.freeze({ unlocked: capturedPsychicGate() }),
    readPlan: capturedPsychicSamplePlan,
  });

  const controls: PsychicControls = Object.freeze({
    activate(psychicPowerAction: Readonly<PsychicDecision>): boolean {
      if (!dependencies.ensureControls()) return false;
      const action = CAPTURED_PSYCHIC_ACTION[psychicPowerAction.power];
      const handle = dependencies.controls.resolve(action.controlId);
      if (handle === undefined || !handle.methods.includes(action.method)) {
        return false;
      }
      if (psychicPowerAction.power === "boost") {
        const selected = psychicPowerAction.boostedResourceId;
        if (selected === null || selected === undefined) return false;
        const liveRoot = dependencies.rootState.readRoot();
        const currentBoostResource = readProperty(
          readProperty(readProperty(liveRoot, "race"), "psychicPowers"),
          "boost",
        );
        if (readProperty(currentBoostResource, "r") !== selected) {
          const nodeList = readProperty(
            dependencies.getDocument(),
            "querySelectorAll",
          );
          if (typeof nodeList !== "function") return false;
          let radios: unknown;
          try {
            radios = Reflect.apply(nodeList, dependencies.getDocument(), [
              "#psyhscrolltarget input[type='radio']",
            ]);
          } catch {
            return false;
          }
          const length = finite(readProperty(radios, "length"));
          if (
            length === undefined ||
            !Number.isSafeInteger(length) ||
            length < 0
          ) {
            return false;
          }
          let selectedNode: unknown;
          for (let index = 0; index < length; index += 1) {
            const node = readProperty(radios, String(index));
            if (readProperty(node, "value") === selected) {
              selectedNode = node;
              break;
            }
          }
          const click = readProperty(selectedNode, "click");
          if (typeof click !== "function") return false;
          try {
            Reflect.apply(click, selectedNode, []);
          } catch {
            return false;
          }
        }
        const livePowers = readProperty(
          readProperty(dependencies.rootState.readRoot(), "race"),
          "psychicPowers",
        );
        if (readProperty(readProperty(livePowers, "boost"), "r") !== selected) {
          return false;
        }
      }
      const currentHandle = dependencies.controls.resolve(action.controlId);
      if (
        currentHandle === undefined ||
        currentHandle.generation !== handle.generation ||
        !currentHandle.methods.includes(action.method)
      ) {
        return false;
      }
      return dependencies.controls.invoke(currentHandle, action.method).ok;
    },
  });

  const executor: DecisionExecutor<PsychicDecision> = Object.freeze({
    execute(
      psychicPlanAction: Readonly<PsychicDecision>,
    ): CommandExecutionOutcome {
      const currentInput = capturedPsychicSamplePlan();
      const current = session;
      if (current === null) {
        return stale(
          "psychic-state-unavailable",
          "psychic state is unavailable",
        );
      }
      const currentDecision = planPsychic(currentInput).find((candidate) =>
        capturedPsychicDecisionMatches(candidate, psychicPlanAction),
      );
      if (currentDecision === undefined) {
        return stale(
          "psychic-state-changed",
          "psychic decision is no longer valid",
        );
      }
      const activated = controls.activate(psychicPlanAction);
      const afterRoot = dependencies.rootState.readRoot();
      const energyAfter = capturedPsychicEnergy(afterRoot)?.amount;
      if (
        !activated ||
        energyAfter !== current.energyAmount - psychicPlanAction.energyCost
      ) {
        return stale(
          activated
            ? "psychic-postcondition-failed"
            : "psychic-control-unavailable",
          activated
            ? `psychic ${psychicPlanAction.power} did not spend its expected Energy`
            : `psychic ${psychicPlanAction.power} control is unavailable`,
        );
      }
      const populationAfter = capturedPsychicPopulationAmount(afterRoot);
      const killCountAfter = capturedPsychicKillCount(afterRoot);
      if (
        psychicPlanAction.power === "murder" &&
        (populationAfter !== current.populationAmount - 1 ||
          (current.killCount !== undefined &&
            killCountAfter !== current.killCount + 1))
      ) {
        return stale(
          "psychic-postcondition-failed",
          "psychic murder did not reduce population and advance the kill count",
        );
      }
      if (
        psychicPlanAction.power === "mind_break" ||
        psychicPlanAction.power === "stun"
      ) {
        const afterCaptives = capturedPsychicCaptiveTotals(afterRoot);
        if (current.captiveTotals === null || afterCaptives === null) {
          return stale(
            "psychic-postcondition-unavailable",
            "psychic captive state could not be verified",
          );
        }
        const changed =
          psychicPlanAction.power === "mind_break"
            ? afterCaptives.jailed === current.captiveTotals.jailed - 1 &&
              afterCaptives.free === current.captiveTotals.free + 1
            : afterCaptives.jailed === current.captiveTotals.jailed + 1;
        if (!changed) {
          return stale(
            "psychic-postcondition-failed",
            `psychic ${psychicPlanAction.power} did not change captive housing`,
          );
        }
      }
      if (
        psychicPlanAction.power === "profit" ||
        psychicPlanAction.power === "boost" ||
        psychicPlanAction.power === "assault"
      ) {
        const expectedDuration = current.duration;
        if (
          capturedPsychicDurationFromRoot(
            afterRoot,
            psychicPlanAction.power,
          ) !== expectedDuration
        ) {
          return stale(
            "psychic-postcondition-failed",
            `psychic ${psychicPlanAction.power} timer did not reach its game-computed value`,
          );
        }
      }
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, controls, executor });
}
