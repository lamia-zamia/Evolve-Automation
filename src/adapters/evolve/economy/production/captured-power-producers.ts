/** Captured DeadSpace power-producer activation. */

import {
  planCapturedPowerProducers,
  type CapturedPowerInput,
} from "../../../../domain/economy/production/captured-power.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";

export const CAPTURED_POWER_PRODUCER_IDS = Object.freeze([
  "mill",
  "windmill",
  "coal_power",
  "oil_power",
  "fission_power",
] as const);

/**
 * DeadSpace's explicit generator pass also admits these regional structures. The
 * alien-space-station entry is intentionally absent: it has no ordinary power-grid
 * control and is switched by its own game event instead.
 */
const CAPTURED_REGIONAL_POWER_PRODUCERS = Object.freeze([
  ["space", "geothermal"],
  ["space", "e_reactor"],
  ["interstellar", "fusion"],
  ["tauceti", "fusion_generator"],
  ["tauceti", "antimatter_reactor"],
  ["underground", "under_coal_power"],
  ["underground", "under_oil_power"],
  ["underground", "core_tap"],
  ["surface", "crater_fission"],
  ["surface", "rocket_engine"],
] as const);

interface CapturedPowerProducerLocation {
  readonly region: string;
  readonly id: string;
}

export interface CapturedPowerProducerDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
}

interface PowerSession {
  readonly root: unknown;
  readonly input: Readonly<CapturedPowerInput>;
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
  for (const [region, id] of CAPTURED_REGIONAL_POWER_PRODUCERS) {
    const value = readProperty(readProperty(root, region), id);
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
  producer: Readonly<CapturedPowerProducerLocation>,
): { count: number; on: number } | undefined {
  const value = readProperty(readProperty(root, producer.region), producer.id);
  if (!isRecord(value)) return undefined;
  const count = finite(value["count"]);
  const on = finite(value["on"]);
  return count !== undefined && on !== undefined
    ? Object.freeze({ count, on })
    : undefined;
}

function producerLocation(
  id: string,
): CapturedPowerProducerLocation | undefined {
  if ((CAPTURED_POWER_PRODUCER_IDS as readonly string[]).includes(id)) {
    return Object.freeze({ region: "city", id });
  }
  const regional = CAPTURED_REGIONAL_POWER_PRODUCERS.find(
    ([, candidate]) => candidate === id,
  );
  return regional === undefined
    ? undefined
    : Object.freeze({ region: regional[0], id: regional[1] });
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
        const producer = producerLocation(decision.producerId);
        if (producer === undefined) {
          return stale(
            "captured-power-producer-missing",
            `captured producer ${decision.producerId} disappeared`,
          );
        }
        const elementId = `${producer.region}-${decision.producerId}`;
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
          const current = currentProducer(session.root, producer);
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
