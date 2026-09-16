/** Captured DeadSpace mercenary hiring through the city's game-owned garrison component. */

import { computeMoneyWindow } from "../../../domain/state-update.ts";
import type {
  HireMercenaryDecision,
  MercenaryCycleInput,
  MercenaryLogEvent,
  MercenaryState,
} from "../../../domain/combat/mercenary.ts";
import type {
  MercenaryExecutor,
  MercenaryLogger,
  MercenaryReader,
} from "../../../ports/mercenary.ts";
import type { GameActivitySink } from "../../../ports/game-message-log.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { rejected, stale } from "../../command-outcomes.ts";
import { readCapturedInflationSaveMoney } from "../economy/resources/captured-inflation-assist.ts";
import { finite, isRecord, readProperty } from "../../validation.ts";

/** `buildGarrison` binds the same hire methods to the full and compact city panels. */
export const CAPTURED_MERCENARY_CONTROLS = Object.freeze([
  "garrison",
  "c_garrison",
] as const);

const CAPTURED_MERCENARY_METHODS = Object.freeze([
  "vis",
  "hire",
  "hell",
  "s_max",
] as const);
const CAPTURED_MERCENARY_EMPTY_STATE: MercenaryState = Object.freeze({
  currentSoldiers: Number.MAX_SAFE_INTEGER,
  mercenaryCost: Number.POSITIVE_INFINITY,
  moneyCurrent: 0,
  moneySpare: 0,
});
const CAPTURED_MERCENARY_EMPTY_CYCLE: MercenaryCycleInput = Object.freeze({
  available: false,
  saveInflationMoney: false,
  goal: "Normal",
  maxSoldiers: 0,
  deadSoldierReserve: 0,
  moneyMedian: 0,
  costIncomeMultiplier: 0,
  moneyStoragePercent: 0,
  storageAssignExtra: false,
  moneyMaximum: 0,
  moneyStorageRequired: 0,
});

interface CapturedMercenaryMetrics {
  readonly workers: number;
  readonly crew: number;
  readonly maximumWorkers: number;
  readonly currentSoldiers: number;
  readonly maxSoldiers: number;
  readonly uses: number;
  readonly moneyCurrent: number;
  readonly moneyMaximum: number;
  readonly moneyRate: number;
  readonly citySoldiers: number;
  readonly cityMaximum: number;
  readonly mercenaryCost: number;
}

interface CapturedMercenarySession {
  readonly root: unknown;
  readonly control: GameControlHandle;
  readonly cycle: Readonly<CapturedMercenaryMetrics>;
}

export interface CapturedMercenaryDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  /** The captured prestige control owns this one-tick goal handoff. */
  readonly readGoal?: () => unknown;
  /** Demand owns the commitments that make Money no longer spare. */
  readonly readMoneyRequested?: () => unknown;
  /** Demand owns the storage needed by the current captured cycle. */
  readonly readMoneyStorageRequired?: () => unknown;
  /** Observed key modifiers mean DeadSpace's hire() would intentionally batch hires. */
  readonly keyState?: {
    readPressed(key: string | number): boolean | undefined;
  };
  readonly onActivity?: GameActivitySink;
}

function capturedMercenarySettingNumber(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: number,
): number | undefined {
  const value = settings[key];
  return value === undefined ? fallback : finite(value);
}

function capturedMercenarySettingBoolean(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: boolean,
): boolean | undefined {
  const value = settings[key];
  return value === undefined
    ? fallback
    : typeof value === "boolean"
      ? value
      : undefined;
}

function capturedMercenaryControl(
  controls: GameControlRegistry,
): GameControlHandle | undefined {
  return CAPTURED_MERCENARY_CONTROLS.map((elementId) =>
    controls.resolve(elementId),
  ).find(
    (control) =>
      control !== undefined &&
      CAPTURED_MERCENARY_METHODS.every((method) =>
        control.methods.includes(method),
      ),
  );
}

function capturedMercenaryInvokeNumber(
  controls: GameControlRegistry,
  control: GameControlHandle,
  method: "hell" | "s_max",
): number | undefined {
  const result = controls.invoke(control, method, []);
  return result.ok ? finite(result.value) : undefined;
}

function capturedMercenaryVisible(
  controls: GameControlRegistry,
  control: GameControlHandle,
): boolean {
  const result = controls.invoke(control, "vis", []);
  return result.ok && result.value === true;
}

function capturedMercenaryTraitScale(
  rank: number,
  low: readonly number[],
  mid: readonly number[],
  high: readonly number[],
): readonly number[] {
  const effectiveRank = Math.max(0.1, rank);
  const from = effectiveRank < 1 ? low : mid;
  const to = effectiveRank < 1 ? mid : high;
  const fraction =
    effectiveRank < 1
      ? (effectiveRank - 0.1) / 0.9
      : effectiveRank <= 2
        ? effectiveRank - 1
        : 1 + (effectiveRank - 2) / 2;
  return Object.freeze(
    mid.map((value, index) => {
      const fromValue = from[index];
      const toValue = to[index];
      return typeof fromValue === "number" && typeof toValue === "number"
        ? Number((fromValue + (toValue - fromValue) * fraction).toFixed(6))
        : value;
    }),
  );
}

function capturedMercenaryTraitRank(
  race: Record<PropertyKey, unknown>,
  trait: "brute" | "high_pop",
  kind: "major" | "genus",
): number | undefined {
  const rank = finite(race[trait]);
  if (rank === undefined) return undefined;
  if (!race["empowered"]) return rank;
  const empoweredRank = finite(race["empowered"]);
  if (empoweredRank === undefined) return undefined;
  const empowered = capturedMercenaryTraitScale(
    Math.min(2, empoweredRank),
    [0.01, 0.005],
    [0.2, 0.1],
    [0.4, 0.2],
  );
  const bonus = empowered[kind === "major" ? 0 : 1];
  return bonus === undefined ? undefined : Number((rank + bonus).toFixed(6));
}

/**
 * DeadSpace's `mercCost()` is lexical and is not exposed by either garrison component. Keep this
 * one adapter-owned mirror until the upstream component exposes a numeric cost oracle; hiring
 * still goes through the captured `hire()` method and the result is verified from root state.
 */
function capturedMercenaryCost(
  root: unknown,
  workers: number,
  uses: number,
): number | undefined {
  const race = readProperty(root, "race");
  if (!isRecord(race)) return undefined;
  let cost = Math.round(1.24 ** workers * 75) - 50;
  if (cost > 25_000) cost = 25_000;
  if (uses > 0) cost *= 1.1 ** uses;

  if (race["brute"]) {
    const rank = capturedMercenaryTraitRank(race, "brute", "major");
    if (rank === undefined) return undefined;
    const discount = capturedMercenaryTraitScale(
      rank,
      [15, 40],
      [50, 100],
      [70, 150],
    )[0];
    if (discount === undefined) return undefined;
    cost *= 1 - discount / 100;
  }

  const city = readProperty(root, "city");
  const dwellers = readProperty(city, "surfaceDwellers");
  const housing = readProperty(city, "captive_housing");
  if (
    race["unfathomable"] &&
    Array.isArray(dwellers) &&
    dwellers.includes("orc") &&
    housing
  ) {
    const index = dwellers.indexOf("orc");
    const active = finite(readProperty(housing, `race${index}`));
    const torturerWorkers = finite(
      readProperty(
        readProperty(readProperty(root, "civic"), "torturer"),
        "workers",
      ),
    );
    if (active === undefined || torturerWorkers === undefined) return undefined;
    let adjusted = Math.min(active, 100);
    if (adjusted > torturerWorkers) {
      adjusted -= Math.ceil((adjusted - torturerWorkers) / 3);
    }
    const nightmare =
      finite(
        readProperty(
          readProperty(
            readProperty(readProperty(root, "stats"), "achieve"),
            "nightmare",
          ),
          "mg",
        ),
      ) ?? 0;
    const fathom = (adjusted / 100) * (nightmare / 5);
    if (fathom > 0) {
      const fathomDiscount = capturedMercenaryTraitScale(
        1,
        [15, 40],
        [50, 100],
        [70, 150],
      )[0];
      if (fathomDiscount === undefined) return undefined;
      cost *= 1 - (fathomDiscount / 100) * fathom;
    }
  }

  const inflation = race["inflation"];
  if (inflation) {
    const level = finite(inflation);
    if (level === undefined) return undefined;
    cost *= 1 + level / 500;
  }
  if (race["high_pop"]) {
    const rank = capturedMercenaryTraitRank(race, "high_pop", "genus");
    if (rank === undefined) return undefined;
    const multiplier = capturedMercenaryTraitScale(
      rank,
      [2, 50, 1.2],
      [4, 26, 3.5],
      [7, 15.8, 6.5],
    )[1];
    if (multiplier === undefined) return undefined;
    cost *= multiplier / 100;
  }
  return Number.isFinite(cost) ? Math.round(cost) : undefined;
}

function capturedMercenaryMetrics(
  root: unknown,
  controls: GameControlRegistry,
  control: GameControlHandle,
): CapturedMercenaryMetrics | undefined {
  const garrison = readProperty(readProperty(root, "civic"), "garrison");
  const money = readProperty(readProperty(root, "resource"), "Money");
  if (!isRecord(garrison) || !isRecord(money)) return undefined;
  const workers = finite(garrison["workers"]);
  const crew = finite(garrison["crew"]);
  const maximumWorkers = finite(garrison["max"]);
  const uses = finite(garrison["m_use"]);
  const moneyCurrent = finite(money["amount"]);
  const moneyMaximum = finite(money["max"]);
  const moneyRate = finite(money["diff"]);
  const citySoldiers = capturedMercenaryInvokeNumber(controls, control, "hell");
  const cityMaximum = capturedMercenaryInvokeNumber(controls, control, "s_max");
  if (
    workers === undefined ||
    crew === undefined ||
    maximumWorkers === undefined ||
    uses === undefined ||
    moneyCurrent === undefined ||
    moneyMaximum === undefined ||
    moneyRate === undefined ||
    citySoldiers === undefined ||
    cityMaximum === undefined
  ) {
    return undefined;
  }
  const mercenaryCost = capturedMercenaryCost(root, workers, uses);
  if (mercenaryCost === undefined) return undefined;
  return Object.freeze({
    workers,
    crew,
    maximumWorkers,
    currentSoldiers: workers - crew,
    maxSoldiers: maximumWorkers - crew,
    uses,
    moneyCurrent,
    moneyMaximum,
    moneyRate,
    citySoldiers,
    cityMaximum,
    mercenaryCost,
  });
}

function capturedMercenaryState(
  root: unknown,
  controls: GameControlRegistry,
  control: GameControlHandle,
  readMoneyRequested: (() => unknown) | undefined,
): MercenaryState {
  const metrics = capturedMercenaryMetrics(root, controls, control);
  if (metrics === undefined) return CAPTURED_MERCENARY_EMPTY_STATE;
  const requested =
    readMoneyRequested === undefined ? 0 : finite(readMoneyRequested());
  if (requested === undefined) return CAPTURED_MERCENARY_EMPTY_STATE;
  return Object.freeze({
    currentSoldiers: metrics.currentSoldiers,
    mercenaryCost: metrics.mercenaryCost,
    moneyCurrent: metrics.moneyCurrent,
    moneySpare: metrics.moneyCurrent - requested,
  });
}

function capturedMercenaryDecisionsMatch(
  decision: Readonly<HireMercenaryDecision>,
  state: Readonly<MercenaryState>,
): boolean {
  return (
    decision.kind === "hire-mercenary" &&
    decision.expectedSoldiers === state.currentSoldiers &&
    decision.expectedCost === state.mercenaryCost &&
    decision.expectedMoneyCurrent === state.moneyCurrent &&
    decision.expectedMoneySpare === state.moneySpare
  );
}

function capturedMercenaryModifierHeld(
  root: unknown,
  keyState: CapturedMercenaryDependencies["keyState"],
): boolean {
  if (keyState === undefined) return false;
  const settings = readProperty(root, "settings");
  if (readProperty(settings, "mKeys") !== true) return false;
  const keyMap = readProperty(settings, "keyMap");
  return ["x10", "x25", "x100"].some((key) => {
    const mapped = readProperty(keyMap, key);
    return (
      (typeof mapped === "string" || typeof mapped === "number") &&
      keyState.readPressed(mapped) === true
    );
  });
}

export function createCapturedMercenary(
  dependencies: CapturedMercenaryDependencies,
): {
  readonly reader: MercenaryReader;
  readonly executor: MercenaryExecutor;
  readonly logger: MercenaryLogger;
} {
  let session: CapturedMercenarySession | undefined;
  let lastState: Readonly<MercenaryState> | undefined;
  let moneyIncomes: number[] = [];
  const reportActivity = dependencies.onActivity ?? (() => {});

  const reader: MercenaryReader = Object.freeze({
    readCycle(): MercenaryCycleInput {
      session = undefined;
      lastState = undefined;
      const root = dependencies.rootState.readRoot();
      if (!isRecord(root)) return CAPTURED_MERCENARY_EMPTY_CYCLE;
      const settingsValue = dependencies.readSettings();
      const settings = isRecord(settingsValue) ? settingsValue : {};
      const tech = readProperty(root, "tech");
      const civicGarrison = readProperty(
        readProperty(root, "civic"),
        "garrison",
      );
      if (
        !isRecord(tech) ||
        !readProperty(tech, "mercs") ||
        !isRecord(civicGarrison) ||
        civicGarrison["mercs"] !== true
      ) {
        return CAPTURED_MERCENARY_EMPTY_CYCLE;
      }
      const control = capturedMercenaryControl(dependencies.controls);
      if (
        control === undefined ||
        !capturedMercenaryVisible(dependencies.controls, control)
      ) {
        return CAPTURED_MERCENARY_EMPTY_CYCLE;
      }
      const cycle = capturedMercenaryMetrics(
        root,
        dependencies.controls,
        control,
      );
      if (
        cycle === undefined ||
        cycle.maxSoldiers <= 0 ||
        cycle.cityMaximum <= 0 ||
        capturedMercenaryModifierHeld(root, dependencies.keyState)
      ) {
        return CAPTURED_MERCENARY_EMPTY_CYCLE;
      }
      const deadSoldierReserve = capturedMercenarySettingNumber(
        settings,
        "foreignHireMercDeadSoldiers",
        1,
      );
      const costIncomeMultiplier = capturedMercenarySettingNumber(
        settings,
        "foreignHireMercCostLowerThanIncome",
        1,
      );
      const moneyStoragePercent = capturedMercenarySettingNumber(
        settings,
        "foreignHireMercMoneyStoragePercent",
        90,
      );
      const storageAssignExtra = capturedMercenarySettingBoolean(
        settings,
        "storageAssignExtra",
        true,
      );
      const moneyStorageRequired =
        dependencies.readMoneyStorageRequired === undefined
          ? 1
          : finite(dependencies.readMoneyStorageRequired());
      if (
        deadSoldierReserve === undefined ||
        costIncomeMultiplier === undefined ||
        moneyStoragePercent === undefined ||
        storageAssignExtra === undefined ||
        moneyStorageRequired === undefined
      ) {
        return CAPTURED_MERCENARY_EMPTY_CYCLE;
      }
      const moneyWindow = computeMoneyWindow(moneyIncomes, cycle.moneyRate);
      moneyIncomes = moneyWindow.incomes;
      const goalValue = dependencies.readGoal?.();
      const goal = typeof goalValue === "string" ? goalValue : "Standard";
      session = Object.freeze({ root, control, cycle });
      return Object.freeze({
        available: true,
        saveInflationMoney: readCapturedInflationSaveMoney(root, settings),
        goal,
        maxSoldiers: cycle.maxSoldiers,
        deadSoldierReserve,
        moneyMedian: moneyWindow.median,
        costIncomeMultiplier,
        moneyStoragePercent,
        storageAssignExtra,
        moneyMaximum: cycle.moneyMaximum,
        moneyStorageRequired,
      });
    },

    readState(): MercenaryState {
      const active = session;
      if (active === undefined) {
        lastState = CAPTURED_MERCENARY_EMPTY_STATE;
        return lastState;
      }
      lastState = capturedMercenaryState(
        active.root,
        dependencies.controls,
        active.control,
        dependencies.readMoneyRequested,
      );
      return lastState;
    },
  });

  const executor: MercenaryExecutor = Object.freeze({
    hire(decision: Readonly<HireMercenaryDecision>) {
      const active = session;
      const sampled = lastState;
      if (active === undefined || sampled === undefined) {
        return stale(
          "captured-mercenary-session-missing",
          "captured mercenary session is missing",
        );
      }
      if (
        decision.expectedSoldiers < 0 ||
        !Number.isFinite(decision.expectedCost) ||
        !Number.isFinite(decision.expectedMoneyCurrent) ||
        !Number.isFinite(decision.expectedMoneySpare) ||
        !capturedMercenaryDecisionsMatch(decision, sampled)
      ) {
        return rejected(
          "invalid-captured-mercenary-decision",
          "captured mercenary decision does not match the sampled state",
        );
      }
      if (
        dependencies.rootState.readRoot() !== active.root ||
        dependencies.controls.resolve(active.control.elementId)?.generation !==
          active.control.generation
      ) {
        return stale(
          "captured-mercenary-state-changed",
          "captured mercenary state or control changed",
        );
      }
      if (capturedMercenaryModifierHeld(active.root, dependencies.keyState)) {
        return Object.freeze({ status: "not-hired" as const });
      }
      const current = capturedMercenaryMetrics(
        active.root,
        dependencies.controls,
        active.control,
      );
      if (
        current === undefined ||
        !capturedMercenaryDecisionsMatch(decision, {
          currentSoldiers: current.currentSoldiers,
          mercenaryCost: current.mercenaryCost,
          moneyCurrent: current.moneyCurrent,
          moneySpare:
            current.moneyCurrent -
            (dependencies.readMoneyRequested === undefined
              ? 0
              : (finite(dependencies.readMoneyRequested()) ?? Number.NaN)),
        })
      ) {
        return stale(
          "captured-mercenary-state-changed",
          "captured mercenary state changed",
        );
      }
      if (current.citySoldiers >= current.cityMaximum) {
        return Object.freeze({ status: "not-hired" as const });
      }
      const result = dependencies.controls.invoke(active.control, "hire", []);
      if (!result.ok) {
        return stale(
          "captured-mercenary-hire-failed",
          `captured mercenary hire failed: ${result.reason}`,
        );
      }
      const afterRoot = dependencies.rootState.readRoot();
      if (afterRoot !== active.root) {
        return stale(
          "captured-mercenary-root-changed",
          "captured game root changed after mercenary hire",
        );
      }
      const after = capturedMercenaryMetrics(
        afterRoot,
        dependencies.controls,
        active.control,
      );
      if (
        after === undefined ||
        after.workers !== current.workers + 1 ||
        after.uses !== current.uses + 1 ||
        after.moneyCurrent >= current.moneyCurrent
      ) {
        return stale(
          "captured-mercenary-not-hired",
          "the game did not hire a mercenary",
        );
      }
      lastState = undefined;
      return Object.freeze({ status: "hired" as const });
    },
  });

  const logger: MercenaryLogger = Object.freeze({
    write(event: Readonly<MercenaryLogEvent>): void {
      reportActivity({
        message: event.message,
        color: "success",
        tags: Object.freeze(["combat"]),
      });
    },
  });

  return Object.freeze({ reader, executor, logger });
}
