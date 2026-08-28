// TRANSITIONAL: Reaches the game's live settings and one live resource through the current Vue 2
// component data. Replace the two lookups when the upstream Vue 3 component contracts stabilize;
// the gate's decision is pure and stays as it is.

import {
  consumePeriodGate,
  initialPeriodGateState,
  pulsePeriodGate,
  type PeriodGateState,
} from "../../domain/period-gate.ts";
import type { PeriodGate } from "../../ports/period-gate.ts";
import { readProperty } from "../validation.ts";

export interface PeriodGateDependencies {
  /** The game's main-column view, whose `s` is the live settings record. */
  readonly getMainVue: () => unknown;
  readonly getVueById: (elementId: string) => unknown;
}

/**
 * Candidate pulse resources, tried in order. The game skips its per-period rate update for a
 * resource whose `rate` is 0 unless the resource is uncapped, so a candidate has to qualify before
 * it can be trusted to pulse. Exactly one is wrapped: two would advance the period counter twice.
 */
const pulseResources: readonly string[] = Object.freeze([
  "Money",
  "Knowledge",
  "Food",
]);

interface BaseAccessors {
  readonly read: () => unknown;
  readonly write: (value: unknown) => void;
}

interface Accessors {
  readonly get: () => unknown;
  readonly set: (value: unknown) => void;
}

/**
 * Replaces one property with a wrapper that delegates to whatever was there before, and returns the
 * undo. Delegating rather than replacing is what preserves Vue's reactivity: both properties are
 * already reactive accessors, and their dependency tracking runs inside the original functions.
 * Returns undefined when the property cannot be wrapped, which the caller treats as "no gate".
 */
function overrideProperty(
  owner: object,
  key: string,
  makeAccessors: (base: BaseAccessors) => Accessors,
): (() => void) | undefined {
  const original = Object.getOwnPropertyDescriptor(owner, key);
  if (original === undefined || original.configurable !== true) {
    return undefined;
  }
  const getter = original.get;
  const setter = original.set;
  let stored: unknown = original.value;
  const base: BaseAccessors = {
    read: () =>
      getter === undefined ? stored : Reflect.apply(getter, owner, []),
    write: (value) => {
      if (setter === undefined) {
        stored = value;
      } else {
        Reflect.apply(setter, owner, [value]);
      }
    },
  };
  const accessors = makeAccessors(base);
  Object.defineProperty(owner, key, {
    configurable: true,
    enumerable: original.enumerable === true,
    get: accessors.get,
    set: accessors.set,
  });
  return () => {
    Object.defineProperty(
      owner,
      key,
      getter === undefined && setter === undefined
        ? {
            configurable: true,
            enumerable: original.enumerable === true,
            writable: original.writable === true,
            value: stored,
          }
        : original,
    );
  };
}

export function createPeriodGate({
  getMainVue,
  getVueById,
}: PeriodGateDependencies): PeriodGate {
  let state: PeriodGateState = initialPeriodGateState;
  let rate = 0;
  let suspended = false;
  let pulses = 0;
  let pulsesAtLastSync = -1;
  let restore: (() => void) | undefined;

  function findPulseResource(): object | undefined {
    for (const name of pulseResources) {
      const data = readProperty(getVueById(`res${name}`), "$data");
      if (typeof data !== "object" || data === null || !("diff" in data)) {
        continue;
      }
      const resourceRate = readProperty(data, "rate");
      if (typeof resourceRate !== "number") {
        continue;
      }
      if (resourceRate > 0 || readProperty(data, "max") === -1) {
        return data;
      }
    }
    return undefined;
  }

  /**
   * `settings.expose` is part of the save. A closed read is consumed by the game's own gate check in
   * the same statement that produced it, so an autosave cannot observe one - but persisting a false
   * here would leave the next load with no debug data and no script at all, so the save is made to
   * read the player's value outright rather than by that argument.
   */
  function defineSaveGuard(settings: object): () => void {
    const original = Object.getOwnPropertyDescriptor(settings, "toJSON");
    Object.defineProperty(settings, "toJSON", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: function toJSON(this: object): object {
        const previous = suspended;
        suspended = true;
        try {
          return { ...this };
        } finally {
          suspended = previous;
        }
      },
    });
    return () => {
      if (original === undefined) {
        Reflect.deleteProperty(settings, "toJSON");
      } else {
        Object.defineProperty(settings, "toJSON", original);
      }
    };
  }

  function uninstall(): void {
    restore?.();
    restore = undefined;
    pulsesAtLastSync = -1;
  }

  function install(): boolean {
    const settings = readProperty(getMainVue(), "s");
    if (typeof settings !== "object" || settings === null) {
      return false;
    }
    const resource = findPulseResource();
    if (resource === undefined) {
      return false;
    }

    const restoreExpose = overrideProperty(
      settings,
      "expose",
      ({ read, write }) => ({
        get: () => {
          const player = read();
          // Never turn the player's debug mode on, and never gate a read the save or the script's
          // own forced refreshes are making.
          if (suspended || player !== true) {
            return player;
          }
          const consumed = consumePeriodGate(state);
          state = consumed.state;
          return consumed.exposed;
        },
        set: write,
      }),
    );
    if (restoreExpose === undefined) {
      return false;
    }

    const restoreDiff = overrideProperty(
      resource,
      "diff",
      ({ read, write }) => ({
        get: read,
        set: (value) => {
          write(value);
          pulses += 1;
          state = pulsePeriodGate(state, rate);
        },
      }),
    );
    if (restoreDiff === undefined) {
      restoreExpose();
      return false;
    }

    const restoreSaveGuard = defineSaveGuard(settings);
    state = initialPeriodGateState;
    pulses = 0;
    restore = () => {
      restoreSaveGuard();
      restoreDiff();
      restoreExpose();
      state = initialPeriodGateState;
    };
    return true;
  }

  return Object.freeze({
    sync(nextRate: number): boolean {
      if (!Number.isFinite(nextRate) || nextRate < 2) {
        uninstall();
        return false;
      }
      rate = nextRate;
      if (restore !== undefined && pulses === pulsesAtLastSync) {
        // No pulse since the previous working tick: a prestige or reset replaced the resource the
        // gate is wrapped around, leaving it inert while it is still believed to own throttling.
        uninstall();
      }
      if (restore === undefined && !install()) {
        return false;
      }
      pulsesAtLastSync = pulses;
      return true;
    },
  });
}
