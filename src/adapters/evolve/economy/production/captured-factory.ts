/** Captured DeadSpace city-factory capacity repair. */

import {
  CAPTURED_FACTORY_LINES,
  planCapturedFactoryTrim,
  type CapturedFactoryInput,
} from "../../../../domain/economy/production/captured-factory.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isRecord, readProperty } from "../../../validation.ts";

export const FACTORY_CONTROL = "iFactory";

const FACTORY_REGIONS = Object.freeze([
  ["space", "red_factory"],
  ["interstellar", "int_factory"],
  ["portal", "hell_factory"],
  ["underground", "under_factory"],
  ["surface", "crater_factory"],
  ["tauceti", "tau_factory"],
  ["space", "industrial_complex"],
] as const);

export interface CapturedFactoryDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
}

interface FactorySession {
  readonly root: unknown;
  readonly input: Readonly<CapturedFactoryInput>;
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function readInput(root: unknown): Readonly<CapturedFactoryInput> | undefined {
  const city = readProperty(root, "city");
  if (!isRecord(city)) return undefined;
  const factory = readProperty(city, "factory");
  if (!isRecord(factory)) return undefined;
  const maximum = finiteNonNegative(factory["on"]);
  if (maximum === undefined || !Number.isSafeInteger(maximum)) return undefined;

  // The city-only capacity is exact only when no later-region factory adds lines.
  // Missing lazy structures are valid zero state; malformed present structures are not.
  for (const [region, id] of FACTORY_REGIONS) {
    const owner = readProperty(root, region);
    if (owner === undefined) continue;
    if (!isRecord(owner)) return undefined;
    const structure = readProperty(owner, id);
    if (structure === undefined) continue;
    if (!isRecord(structure)) return undefined;
    const count = finiteNonNegative(structure["count"]);
    if (count === undefined) return undefined;
    if (count > 0) return undefined;
  }

  const lines = [];
  for (const id of CAPTURED_FACTORY_LINES) {
    const current = finiteNonNegative(factory[id]);
    if (current === undefined || !Number.isSafeInteger(current))
      return undefined;
    lines.push(Object.freeze({ id, current }));
  }
  return Object.freeze({ maximum, lines: Object.freeze(lines) });
}

function totalAssigned(root: unknown): number | undefined {
  const factory = readProperty(readProperty(root, "city"), "factory");
  if (!isRecord(factory)) return undefined;
  let total = 0;
  for (const id of CAPTURED_FACTORY_LINES) {
    const value = finiteNonNegative(factory[id]);
    if (value === undefined) return undefined;
    total += value;
  }
  return total;
}

export function createCapturedFactoryAutomation({
  rootState,
  controls,
}: CapturedFactoryDependencies): {
  readonly run: () => CommandExecutionOutcome;
} {
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const root = rootState.readRoot();
      const input = readInput(root);
      if (root === undefined || input === undefined) return SUCCEEDED;
      const session: FactorySession = Object.freeze({ root, input });
      const adjustments = planCapturedFactoryTrim(session.input);
      if (adjustments.length === 0) return SUCCEEDED;
      const handle = controls.resolve(FACTORY_CONTROL);
      if (handle === undefined || !handle.methods.includes("subItem")) {
        return rejected(
          "captured-factory-control-missing",
          "no captured iFactory subItem control",
        );
      }
      for (const adjustment of adjustments) {
        const count = -adjustment.delta;
        for (let index = 0; index < count; index += 1) {
          if (rootState.readRoot() !== session.root) {
            return stale(
              "captured-factory-root-changed",
              "captured game root changed",
            );
          }
          const result = controls.invoke(handle, "subItem", [adjustment.id]);
          if (!result.ok) {
            return rejected(
              "captured-factory-control-failed",
              result.detail ?? result.reason,
            );
          }
        }
      }
      const remaining = totalAssigned(session.root);
      if (remaining === undefined || remaining > session.input.maximum) {
        return stale(
          "captured-factory-allocation-unchanged",
          "factory allocation did not reach captured capacity",
        );
      }
      return SUCCEEDED;
    },
  });
}
