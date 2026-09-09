/** Captured DeadSpace power-producer activation. */

import {
  planCapturedPowerProducers,
  type CapturedPowerInput,
} from "../../../../domain/economy/production/captured-power.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isRecord, readProperty } from "../../../validation.ts";

export const CAPTURED_POWER_PRODUCER_IDS = Object.freeze([
  "mill",
  "windmill",
  "coal_power",
  "oil_power",
  "fission_power",
] as const);

export interface CapturedPowerProducerDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
}

interface PowerSession {
  readonly root: unknown;
  readonly input: Readonly<CapturedPowerInput>;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readInput(root: unknown): Readonly<CapturedPowerInput> | undefined {
  const city = readProperty(root, "city");
  if (!isRecord(city)) return undefined;
  const unlocked = readProperty(city, "powered");
  const surplus = finite(readProperty(city, "power"));
  if (typeof unlocked !== "boolean" || surplus === undefined) return undefined;

  const producers = [];
  for (const id of CAPTURED_POWER_PRODUCER_IDS) {
    const value = readProperty(city, id);
    if (value === undefined) continue;
    if (!isRecord(value)) return undefined;
    const count = finite(value["count"]);
    const on = finite(value["on"]);
    if (
      count === undefined ||
      on === undefined ||
      count < 0 ||
      on < 0 ||
      on > count
    ) {
      return undefined;
    }
    producers.push(Object.freeze({ id, count, on }));
  }
  return Object.freeze({
    unlocked,
    surplus,
    producers: Object.freeze(producers),
  });
}

function currentProducer(
  root: unknown,
  id: string,
): { count: number; on: number } | undefined {
  const value = readProperty(readProperty(root, "city"), id);
  if (!isRecord(value)) return undefined;
  const count = finite(value["count"]);
  const on = finite(value["on"]);
  return count !== undefined && on !== undefined
    ? Object.freeze({ count, on })
    : undefined;
}

export function createCapturedPowerProducerAutomation({
  rootState,
  controls,
}: CapturedPowerProducerDependencies): {
  readonly run: () => CommandExecutionOutcome;
} {
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const root = rootState.readRoot();
      const input = readInput(root);
      if (root === undefined || input === undefined) return SUCCEEDED;
      const session: PowerSession = Object.freeze({ root, input });
      for (const decision of planCapturedPowerProducers(session.input)) {
        const elementId = `city-${decision.producerId}`;
        const handle = controls.resolve(elementId);
        if (handle === undefined || !handle.methods.includes("power_on")) {
          return rejected(
            "captured-power-control-missing",
            `no captured power control for ${elementId}`,
          );
        }
        for (;;) {
          if (rootState.readRoot() !== session.root) {
            return stale(
              "captured-power-root-changed",
              "captured game root changed",
            );
          }
          const current = currentProducer(session.root, decision.producerId);
          const city = readProperty(session.root, "city");
          const surplus = finite(readProperty(city, "power"));
          if (current === undefined || surplus === undefined) {
            return stale(
              "captured-power-state-changed",
              "captured producer state changed",
            );
          }
          if (
            surplus >= 0 ||
            current.on >= Math.min(current.count, decision.maximumOn)
          ) {
            break;
          }
          const result = controls.invoke(handle, "power_on");
          if (!result.ok) {
            return rejected(
              "captured-power-control-failed",
              result.detail ?? result.reason,
            );
          }
        }
      }
      return SUCCEEDED;
    },
  });
}
