/** Bounded DeadSpace mining-droid allocation through the captured industry panel. */

import {
  planMiningDroidAdjustments,
  planMiningDroidTargets,
  type MiningDroidDecision,
  type MiningDroidPlanningInput,
} from "../../../../domain/economy/production/mining-droid.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isRecord, readProperty } from "../../../validation.ts";

export const MINING_DROID_CONTROL = "iDroid";

const PRODUCTS = Object.freeze([
  Object.freeze({
    id: "adam",
    resource: "Adamantite",
    weighting: 15,
    priority: 1,
  }),
  Object.freeze({
    id: "uran",
    resource: "Uranium",
    weighting: 5,
    priority: -1,
  }),
  Object.freeze({ id: "coal", resource: "Coal", weighting: 5, priority: -1 }),
  Object.freeze({
    id: "alum",
    resource: "Aluminium",
    weighting: 1,
    priority: 1,
  }),
]);

export interface CapturedMiningDroidDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
}

export interface CapturedMiningDroidAutomation {
  run(): CommandExecutionOutcome;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function settingNumber(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: number,
): number | undefined {
  const value = settings[key];
  if (value === undefined) return fallback;
  return finite(value);
}

function emptyInput(): MiningDroidPlanningInput {
  return Object.freeze({
    initialised: false,
    maximum: 0,
    productions: Object.freeze([]),
  });
}

function readInput(dependencies: CapturedMiningDroidDependencies): {
  readonly root: unknown;
  readonly input: MiningDroidPlanningInput;
} {
  const root = dependencies.rootState.readRoot();
  const interstellar = readProperty(root, "interstellar");
  const droids = readProperty(interstellar, "mining_droid");
  const resources = readProperty(root, "resource");
  const control = dependencies.controls.resolve(MINING_DROID_CONTROL);
  const maximum = finite(readProperty(droids, "on"));
  const count = finite(readProperty(droids, "count"));
  if (
    !isRecord(droids) ||
    !isRecord(resources) ||
    control === undefined ||
    maximum === undefined ||
    count === undefined ||
    count < 1 ||
    maximum < 0
  ) {
    return Object.freeze({ root, input: emptyInput() });
  }

  const settingsValue = dependencies.readSettings();
  const settings = isRecord(settingsValue) ? settingsValue : {};
  const productions = [];
  for (const product of PRODUCTS) {
    const resource = readProperty(resources, product.resource);
    const amount = finite(readProperty(resource, "amount"));
    const maximumResource = finite(readProperty(resource, "max"));
    const current = finite(readProperty(droids, product.id));
    const display = readProperty(resource, "display");
    const weighting = settingNumber(
      settings,
      `droid_w_${product.resource}`,
      product.weighting,
    );
    const priority = settingNumber(
      settings,
      `droid_pr_${product.resource}`,
      product.priority,
    );
    if (
      amount === undefined ||
      maximumResource === undefined ||
      current === undefined ||
      typeof display !== "boolean" ||
      weighting === undefined ||
      priority === undefined ||
      current < 0
    ) {
      return Object.freeze({ root, input: emptyInput() });
    }
    productions.push(
      Object.freeze({
        id: product.id,
        weighting,
        priority,
        demanded: false,
        // DeadSpace removed the legacy isUseful/isDemanded resource contract. The bounded
        // adapter treats a displayed row below capacity as useful and leaves demand ordering
        // outside the captured contract.
        useful:
          display && (maximumResource <= 0 || amount / maximumResource < 0.99),
      }),
    );
  }

  return Object.freeze({
    root,
    input: Object.freeze({
      initialised: true,
      maximum,
      productions: Object.freeze(productions),
    }),
  });
}

function currentCount(root: unknown, id: string): number | undefined {
  return finite(
    readProperty(
      readProperty(readProperty(root, "interstellar"), "mining_droid"),
      id,
    ),
  );
}

function decisionMatches(
  input: Readonly<MiningDroidPlanningInput>,
  current: readonly Readonly<{ productionId: string; count: number }>[],
  decision: Readonly<MiningDroidDecision>,
): boolean {
  const targets = planMiningDroidTargets(input);
  if (targets === null) return false;
  return (
    JSON.stringify(planMiningDroidAdjustments(targets, current)) ===
    JSON.stringify(decision)
  );
}

function executeAdjustment(
  dependencies: CapturedMiningDroidDependencies,
  root: unknown,
  id: string,
  expected: number,
  count: number,
  method: "addItem" | "subItem",
): CommandExecutionOutcome {
  const handle = dependencies.controls.resolve(MINING_DROID_CONTROL);
  if (handle === undefined) {
    return stale(
      "mining-droid-control-missing",
      "captured mining-droid control is unavailable",
    );
  }
  for (let index = 0; index < count; index++) {
    if (dependencies.rootState.readRoot() !== root) {
      return stale("mining-droid-root-changed", "captured game root changed");
    }
    const actual = currentCount(root, id);
    if (actual !== expected + (method === "addItem" ? index : -index)) {
      return stale(
        "mining-droid-count-changed",
        "mining-droid allocation changed",
      );
    }
    const result = dependencies.controls.invoke(handle, method, [id]);
    if (!result.ok) {
      return rejected(
        "mining-droid-control-failed",
        result.detail ?? result.reason,
      );
    }
  }
  return SUCCEEDED;
}

export function createCapturedMiningDroidAutomation(
  dependencies: CapturedMiningDroidDependencies,
): CapturedMiningDroidAutomation {
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const session = readInput(dependencies);
      const targets = planMiningDroidTargets(session.input);
      if (targets === null) return SUCCEEDED;
      const current = session.input.productions.map((production) => ({
        productionId: production.id,
        count:
          finite(
            readProperty(
              readProperty(
                readProperty(session.root, "interstellar"),
                "mining_droid",
              ),
              production.id,
            ),
          ) ?? 0,
      }));
      const decision = planMiningDroidAdjustments(targets, current);
      if (!decisionMatches(session.input, current, decision)) {
        return rejected(
          "invalid-mining-droid-decision",
          "mining-droid decision changed during planning",
        );
      }
      for (const adjustment of decision.adjustments) {
        if (adjustment.delta >= 0) continue;
        const outcome = executeAdjustment(
          dependencies,
          session.root,
          adjustment.productionId,
          adjustment.expectedCurrent,
          -adjustment.delta,
          "subItem",
        );
        if (outcome.status !== "succeeded") return outcome;
      }
      for (const adjustment of decision.adjustments) {
        if (adjustment.delta <= 0) continue;
        const outcome = executeAdjustment(
          dependencies,
          session.root,
          adjustment.productionId,
          adjustment.expectedCurrent,
          adjustment.delta,
          "addItem",
        );
        if (outcome.status !== "succeeded") return outcome;
      }
      return SUCCEEDED;
    },
  });
}
