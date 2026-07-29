import {
  formatMechInfo,
  type MechInfoItem,
} from "../../../domain/combat/mech-info.ts";
import type {
  MechInfoObserver,
  MechInfoReader,
} from "../../../ports/mech-info.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  requireString,
} from "../../validation.ts";

export interface MechInfoEvolveDependencies {
  readonly getGame: () => unknown;
  readonly getMechManager: () => unknown;
  readonly getNiceNumber: (value: number) => string;
}

function call(
  target: Record<PropertyKey, unknown>,
  key: string,
  path: string,
  args: readonly unknown[] = [],
): unknown {
  return Reflect.apply(requireFunction(target[key], path), target, args);
}

/** Evolve adapter for Mech lab activation, stats, and observer ownership. */
export function createMechInfoEvolveAdapter({
  getGame,
  getMechManager,
  getNiceNumber,
}: MechInfoEvolveDependencies): {
  readonly reader: MechInfoReader;
  readonly observer: MechInfoObserver;
} {
  function readManager(): Record<PropertyKey, unknown> {
    return requireRecord(getMechManager(), "MechManager");
  }

  function ensureLabActive(): boolean {
    const manager = readManager();
    if (manager["isActive"]) return true;
    if (call(manager, "initLab", "MechManager.initLab")) return true;
    return false;
  }

  function readItems(count: number): readonly MechInfoItem[] {
    if (!Number.isInteger(count) || count < 0) {
      throw new TypeError("mech info count must be a non-negative integer");
    }
    const manager = readManager();
    const game = requireRecord(getGame(), "game");
    const global = requireRecord(game["global"], "game.global");
    const portal = requireRecord(global["portal"], "game.global.portal");
    const mechbay = requireRecord(
      portal["mechbay"],
      "game.global.portal.mechbay",
    );
    const mechs = mechbay["mechs"];
    if (!Array.isArray(mechs)) {
      throw new TypeError("game.global.portal.mechbay.mechs must be an array");
    }
    const bestMech = requireRecord(manager["bestMech"], "MechManager.bestMech");
    const items: MechInfoItem[] = [];
    for (let index = 0; index < count; index += 1) {
      const mech = requireRecord(
        mechs[index],
        `game.global.portal.mechbay.mechs[${index}]`,
      );
      const size = requireString(mech["size"], `mechs[${index}].size`);
      const stats = requireRecord(
        call(manager, "getMechStats", "MechManager.getMechStats", [mech]),
        `MechManager.getMechStats(${index})`,
      );
      const best = requireRecord(
        bestMech[size],
        `MechManager.bestMech.${size}`,
      );
      const input = {
        size,
        power: requireNumber(stats["power"], `mechStats[${index}].power`),
        efficiency: requireNumber(
          stats["efficiency"],
          `mechStats[${index}].efficiency`,
        ),
        bestPower: requireNumber(best["power"], `bestMech.${size}.power`),
        ...(size === "collector"
          ? {
              collectorValue: requireNumber(
                manager["collectorValue"],
                "MechManager.collectorValue",
              ),
            }
          : {}),
      };
      items.push(Object.freeze({ text: formatMechInfo(input, getNiceNumber) }));
    }
    return Object.freeze(items);
  }

  function getObserver(): Record<PropertyKey, unknown> {
    return requireRecord(
      readManager()["mechObserver"],
      "MechManager.mechObserver",
    );
  }

  const reader: MechInfoReader = Object.freeze({
    ensureLabActive,
    readItems,
  });
  const observer: MechInfoObserver = Object.freeze({
    disconnect(): void {
      const target = getObserver();
      call(target, "disconnect", "MechManager.mechObserver.disconnect");
    },
    observe(
      target: unknown,
      options: Readonly<{ readonly childList: true }>,
    ): void {
      const observerTarget = getObserver();
      call(observerTarget, "observe", "MechManager.mechObserver.observe", [
        target,
        options,
      ]);
    },
  });

  return Object.freeze({ reader, observer });
}
