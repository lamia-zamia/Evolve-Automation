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
import { rejected, stale } from "../../command-outcomes.ts";
import {
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../../validation.ts";

interface MercenarySession {
  readonly manager: UnknownRecord;
  readonly resources: UnknownRecord;
  readonly money: UnknownRecord;
}

export interface MercenaryAdapterDependencies {
  // TRANSITIONAL: WarManager remains the narrow bridge to the current
  // Vue-backed garrison command. Replace it with the final Evolve/browser
  // garrison adapters when the remaining combat slices remove WarManager.
  readonly getWarManager: () => unknown;
  readonly getState: () => unknown;
  readonly getSettings: () => unknown;
  readonly getResources: () => unknown;
  readonly shouldSaveInflationMoney: () => unknown;
  readonly getGameLog: () => unknown;
}

function unavailableInput(): MercenaryCycleInput {
  return Object.freeze({
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
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

function readMercenaryState(
  manager: UnknownRecord,
  money: UnknownRecord,
): MercenaryState {
  return Object.freeze({
    currentSoldiers: requireNumber(
      manager["currentSoldiers"],
      "WarManager.currentSoldiers",
    ),
    mercenaryCost: requireNumber(
      manager["mercenaryCost"],
      "WarManager.mercenaryCost",
    ),
    moneyCurrent: requireNumber(
      money["currentQuantity"],
      "resources.Money.currentQuantity",
    ),
    moneySpare: requireNumber(
      money["spareQuantity"],
      "resources.Money.spareQuantity",
    ),
  });
}

function decisionMatchesState(
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

export function createMercenaryAdapter(
  dependencies: MercenaryAdapterDependencies,
): {
  readonly reader: MercenaryReader;
  readonly executor: MercenaryExecutor;
  readonly logger: MercenaryLogger;
} {
  let session: MercenarySession | null = null;
  let lastState: Readonly<MercenaryState> | null = null;

  const reader: MercenaryReader = Object.freeze({
    readCycle(): MercenaryCycleInput {
      session = null;
      lastState = null;
      const manager = requireRecord(dependencies.getWarManager(), "WarManager");
      if (!manager["_garrisonVue"]) return unavailableInput();
      const isUnlocked = requireFunction(
        manager["isMercenaryUnlocked"],
        "WarManager.isMercenaryUnlocked",
      );
      if (!Reflect.apply(isUnlocked, manager, [])) return unavailableInput();
      const maxCityGarrison = requireNumber(
        manager["maxCityGarrison"],
        "WarManager.maxCityGarrison",
      );
      if (maxCityGarrison <= 0) return unavailableInput();

      const state = requireRecord(dependencies.getState(), "state");
      const goal = requireString(state["goal"], "state.goal");
      const saveInflationMoney = Boolean(
        dependencies.shouldSaveInflationMoney(),
      );
      if (saveInflationMoney && goal !== "Reset") {
        return Object.freeze({
          ...unavailableInput(),
          available: true,
          saveInflationMoney: true,
          goal,
        });
      }

      const settings = requireRecord(dependencies.getSettings(), "settings");
      const resources = requireRecord(dependencies.getResources(), "resources");
      const money = requireRecord(resources["Money"], "resources.Money");
      session = Object.freeze({ manager, resources, money });
      return Object.freeze({
        available: true,
        saveInflationMoney,
        goal,
        maxSoldiers: requireNumber(
          manager["maxSoldiers"],
          "WarManager.maxSoldiers",
        ),
        deadSoldierReserve: requireNumber(
          settings["foreignHireMercDeadSoldiers"],
          "settings.foreignHireMercDeadSoldiers",
        ),
        moneyMedian: requireNumber(state["moneyMedian"], "state.moneyMedian"),
        costIncomeMultiplier: requireNumber(
          settings["foreignHireMercCostLowerThanIncome"],
          "settings.foreignHireMercCostLowerThanIncome",
        ),
        moneyStoragePercent: requireNumber(
          settings["foreignHireMercMoneyStoragePercent"],
          "settings.foreignHireMercMoneyStoragePercent",
        ),
        storageAssignExtra: requireBoolean(
          settings["storageAssignExtra"],
          "settings.storageAssignExtra",
        ),
        moneyMaximum: requireNumber(
          money["maxQuantity"],
          "resources.Money.maxQuantity",
        ),
        moneyStorageRequired: requireNumber(
          money["storageRequired"],
          "resources.Money.storageRequired",
        ),
      });
    },

    readState(): MercenaryState {
      if (session === null) {
        throw new Error("mercenary cycle must be read before mercenary state");
      }
      lastState = readMercenaryState(session.manager, session.money);
      return lastState;
    },
  });

  const executor: MercenaryExecutor = Object.freeze({
    hire(decision: Readonly<HireMercenaryDecision>) {
      const active = session;
      const sampled = lastState;
      if (active === null || sampled === null) {
        return stale(
          "mercenary-session-missing",
          "mercenary session is missing",
        );
      }
      if (
        !Number.isFinite(decision.expectedSoldiers) ||
        !Number.isFinite(decision.expectedCost) ||
        !Number.isFinite(decision.expectedMoneyCurrent) ||
        !Number.isFinite(decision.expectedMoneySpare) ||
        !decisionMatchesState(decision, sampled)
      ) {
        return rejected(
          "invalid-mercenary-decision",
          "mercenary decision does not match the sampled state",
        );
      }
      if (
        dependencies.getWarManager() !== active.manager ||
        dependencies.getResources() !== active.resources
      ) {
        return stale(
          "mercenary-dependencies-changed",
          "mercenary dependencies changed",
        );
      }
      const actual = readMercenaryState(active.manager, active.money);
      if (!decisionMatchesState(decision, actual)) {
        return stale("mercenary-state-changed", "mercenary state changed");
      }
      const hireMercenary = requireFunction(
        active.manager["hireMercenary"],
        "WarManager.hireMercenary",
      );
      lastState = null;
      return Reflect.apply(hireMercenary, active.manager, [])
        ? Object.freeze({ status: "hired" as const })
        : Object.freeze({ status: "not-hired" as const });
    },
  });

  const logger: MercenaryLogger = Object.freeze({
    write(event: Readonly<MercenaryLogEvent>): void {
      const gameLog = requireRecord(dependencies.getGameLog(), "GameLog");
      const logSuccess = requireFunction(
        gameLog["logSuccess"],
        "GameLog.logSuccess",
      );
      Reflect.apply(logSuccess, gameLog, [
        event.id,
        event.message,
        event.categories,
      ]);
    },
  });

  return Object.freeze({ reader, executor, logger });
}
