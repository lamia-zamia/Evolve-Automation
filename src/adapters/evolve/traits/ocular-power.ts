import type {
  OcularPowerDecision,
  OcularPowerInput,
  OcularPowerSetting,
} from "../../../domain/traits/ocular-power.ts";
import type { DecisionExecutor } from "../../../ports/decision-executor.ts";
import type {
  OcularPowerControls,
  OcularPowerReader,
} from "../../../ports/ocular-power.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import {
  requireFunction,
  requireNonEmptyString,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../../validation.ts";

interface OcularPowerIdentity {
  readonly key: string;
  readonly id: string;
}

interface OcularPowerSession {
  readonly powers: readonly OcularPowerIdentity[];
  readonly byKey: ReadonlyMap<string, OcularPowerIdentity>;
}

export interface OcularPowerAdapterDependencies {
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
  readonly getPowerData: () => unknown;
  readonly controls: OcularPowerControls;
}

function readRace(gameValue: unknown): UnknownRecord {
  const game = requireRecord(gameValue, "game");
  const global = requireRecord(game["global"], "game.global");
  return requireRecord(global["race"], "game.global.race");
}

function isUnlocked(race: UnknownRecord): boolean {
  return Boolean(race["ocular_power"] && race["ocularPowerConfig"]);
}

function readCatalog(value: unknown): readonly OcularPowerIdentity[] {
  if (!Array.isArray(value)) {
    throw new TypeError("ocularPowerData must be an array");
  }
  const keys = new Set<string>();
  const ids = new Set<string>();
  return Object.freeze(
    value.map((raw, index) => {
      const path = `ocularPowerData[${index}]`;
      const power = requireRecord(raw, path);
      const key = requireNonEmptyString(power["key"], `${path}.key`);
      const id = requireNonEmptyString(power["id"], `${path}.id`);
      if (keys.has(key) || ids.has(id)) {
        throw new TypeError("ocularPowerData keys and ids must be unique");
      }
      keys.add(key);
      ids.add(id);
      return Object.freeze({ key, id });
    }),
  );
}

function readCapacity(gameValue: unknown): number {
  const game = requireRecord(gameValue, "game");
  const traits = requireRecord(game["traits"], "game.traits");
  const trait = requireRecord(
    traits["ocular_power"],
    "game.traits.ocular_power",
  );
  const vars = requireFunction(trait["vars"], "game.traits.ocular_power.vars");
  const values = Reflect.apply(vars, trait, []);
  if (!Array.isArray(values)) {
    throw new TypeError("game.traits.ocular_power.vars() must return an array");
  }
  return requireNumber(values[0], "game.traits.ocular_power.vars()[0]");
}

function normalizePriority(value: unknown, path: string): number {
  const priority = Number(value);
  return requireNumber(priority, path);
}

export function createOcularPowerAdapter(
  dependencies: OcularPowerAdapterDependencies,
): {
  readonly reader: OcularPowerReader;
  readonly executor: DecisionExecutor<OcularPowerDecision>;
} {
  let session: OcularPowerSession | null = null;

  const reader: OcularPowerReader = Object.freeze({
    readGate() {
      const unlocked = isUnlocked(readRace(dependencies.getGame()));
      if (!unlocked) session = null;
      return Object.freeze({ unlocked });
    },

    readPlan(): OcularPowerInput {
      const game = dependencies.getGame();
      const race = readRace(game);
      if (!isUnlocked(race)) {
        session = null;
        return Object.freeze({ capacity: 0, powers: Object.freeze([]) });
      }
      const capacity = readCapacity(game);
      if (capacity < 1) {
        session = null;
        return Object.freeze({ capacity, powers: Object.freeze([]) });
      }
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const catalog = readCatalog(dependencies.getPowerData());
      const powers: OcularPowerSetting[] = catalog.map((power) =>
        Object.freeze({
          key: power.key,
          id: power.id,
          enabled: Boolean(settings[`ocularPower_${power.id}`]),
          priority: normalizePriority(
            settings[`ocularPower_p_${power.id}`],
            `settings.ocularPower_p_${power.id}`,
          ),
        }),
      );
      session = Object.freeze({
        powers: catalog,
        byKey: new Map(catalog.map((power) => [power.key, power])),
      });
      return Object.freeze({ capacity, powers: Object.freeze(powers) });
    },
  });

  const executor: DecisionExecutor<OcularPowerDecision> = Object.freeze({
    execute(decision: Readonly<OcularPowerDecision>) {
      if (
        typeof decision.key !== "string" ||
        decision.key.length === 0 ||
        typeof decision.id !== "string" ||
        decision.id.length === 0 ||
        typeof decision.enabled !== "boolean"
      ) {
        return rejected(
          "invalid-ocular-power-decision",
          "ocular power decisions require a key, id, and boolean state",
        );
      }
      const active = session;
      const identity = active?.byKey.get(decision.key);
      if (
        active === null ||
        identity === undefined ||
        identity.id !== decision.id
      ) {
        return stale(
          "ocular-power-catalog-changed",
          "ocular power catalog changed",
        );
      }
      if (!isUnlocked(readRace(dependencies.getGame()))) {
        return stale("ocular-power-locked", "ocular powers became unavailable");
      }
      const current = dependencies.controls.current(decision.key);
      if (current === null) {
        return stale(
          "ocular-controls-unavailable",
          "ocular power controls became unavailable",
        );
      }
      if (current === decision.enabled) return SUCCEEDED;
      if (!dependencies.controls.toggle(decision.id)) {
        return stale(
          "ocular-toggle-unavailable",
          `ocular power ${decision.id} control became unavailable`,
        );
      }
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
