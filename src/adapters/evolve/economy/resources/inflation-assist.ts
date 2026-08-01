import type {
  InflationAssistActiveInput,
  InflationMoneyInput,
  InflationSaveInput,
} from "../../../../domain/economy/resources/inflation-assist.ts";
import { isInflationAssistActive } from "../../../../domain/economy/resources/inflation-assist.ts";
import {
  isFiniteNumber,
  isNonArrayRecord,
  isNonNegativeNumber,
} from "../../../validation.ts";

type InflationReadReason =
  | "inaccessible-data"
  | "invalid-achievement"
  | "invalid-game-state"
  | "invalid-resource"
  | "invalid-settings";

type Unavailable = {
  readonly status: "unavailable";
  readonly reason: InflationReadReason;
  readonly field?: string;
};

export type InflationAssistReadResult =
  | {
      readonly status: "ready";
      readonly input: Readonly<InflationAssistActiveInput>;
    }
  | Unavailable;

export type InflationMoneyReadResult =
  | { readonly status: "ready"; readonly input: Readonly<InflationMoneyInput> }
  | Unavailable;

export type InflationSaveReadResult =
  | { readonly status: "ready"; readonly input: Readonly<InflationSaveInput> }
  | Unavailable;

function unavailable(reason: InflationReadReason, field?: string): Unavailable {
  return Object.freeze(
    field === undefined
      ? { status: "unavailable", reason }
      : { status: "unavailable", reason, field },
  );
}

export function readInflationAssistInput(
  rawSettings: unknown,
  rawGame: unknown,
  rawWheelbarrowStar: unknown,
): InflationAssistReadResult {
  try {
    if (!isNonArrayRecord(rawSettings)) return unavailable("invalid-settings");
    const assist = rawSettings["inflationChallengeAssist"];
    if (assist !== undefined && typeof assist !== "boolean") {
      return unavailable("invalid-settings", "inflationChallengeAssist");
    }

    if (!isNonArrayRecord(rawGame)) return unavailable("invalid-game-state");
    const global = rawGame["global"];
    if (!isNonArrayRecord(global)) return unavailable("invalid-game-state");
    const race = global["race"];
    if (!isNonArrayRecord(race))
      return unavailable("invalid-game-state", "race");
    const inflationRun =
      Object.hasOwn(race, "inflation") && race["inflation"] !== false;

    const alevel = rawGame["alevel"];
    if (typeof alevel !== "function") {
      return unavailable("invalid-game-state", "alevel");
    }
    const achievementLevel = alevel.call(rawGame);
    if (!isNonNegativeNumber(achievementLevel)) {
      return unavailable("invalid-game-state", "alevel");
    }

    if (!isNonNegativeNumber(rawWheelbarrowStar)) {
      return unavailable("invalid-achievement", "wheelbarrow");
    }

    return Object.freeze({
      status: "ready",
      input: Object.freeze({
        assistEnabled: assist === true,
        inflationRun,
        wheelbarrowStar: rawWheelbarrowStar,
        achievementLevel,
      }),
    });
  } catch {
    return unavailable("inaccessible-data");
  }
}

export function readInflationMoneyInput(
  rawResources: unknown,
  rawTargetMoney: unknown,
): InflationMoneyReadResult {
  try {
    if (!isNonNegativeNumber(rawTargetMoney)) {
      return unavailable("invalid-settings", "inflationChallengeMoney");
    }
    if (!isNonArrayRecord(rawResources)) return unavailable("invalid-resource");
    const money = rawResources["Money"];
    if (!isNonArrayRecord(money))
      return unavailable("invalid-resource", "Money");

    const currentMoney = money["currentQuantity"];
    const maxMoney = money["maxQuantity"];
    const moneyRate = money["rateOfChange"];
    if (!isNonNegativeNumber(currentMoney)) {
      return unavailable("invalid-resource", "Money.currentQuantity");
    }
    if (!isNonNegativeNumber(maxMoney)) {
      return unavailable("invalid-resource", "Money.maxQuantity");
    }
    // A deficit is valid, so the rate may be negative but must be finite.
    if (!isFiniteNumber(moneyRate)) {
      return unavailable("invalid-resource", "Money.rateOfChange");
    }

    return Object.freeze({
      status: "ready",
      input: Object.freeze({
        targetMoney: rawTargetMoney,
        currentMoney,
        maxMoney,
        moneyRate,
      }),
    });
  } catch {
    return unavailable("inaccessible-data");
  }
}

export function readInflationSaveInput(
  rawSettings: unknown,
  rawGame: unknown,
  rawResources: unknown,
  rawWheelbarrowStar: unknown,
  rawTargetMoney: unknown,
): InflationSaveReadResult {
  const assist = readInflationAssistInput(
    rawSettings,
    rawGame,
    rawWheelbarrowStar,
  );
  if (assist.status !== "ready") return assist;
  const money = readInflationMoneyInput(rawResources, rawTargetMoney);
  if (money.status !== "ready") return money;

  // rawSettings is confirmed a record by readInflationAssistInput above.
  const saveMinutes = (rawSettings as Record<PropertyKey, unknown>)[
    "inflationChallengeSaveMinutes"
  ];
  if (!isFiniteNumber(saveMinutes)) {
    return unavailable("invalid-settings", "inflationChallengeSaveMinutes");
  }

  return Object.freeze({
    status: "ready",
    input: Object.freeze({
      active: isInflationAssistActive(assist.input),
      saveMinutes,
      money: money.input,
    }),
  });
}
