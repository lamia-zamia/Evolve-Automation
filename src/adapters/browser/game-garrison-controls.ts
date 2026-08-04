// TRANSITIONAL: the Vue 2 page renders the city garrison (`garrison`) and the
// underworld fortress (`fort`) as tracked elements. The garrison's component
// exposes `campaign(govIndex)`/`hire()`, the `next()`/`last()` tactic pair around
// a `tactics` name that may live on the component or on its `$options.filters`,
// and `aNext()`/`aLast()` battalion steps; the fortress exposes `aNext()`/`aLast()`,
// `patInc()`/`patDec()`, `patSizeInc()`/`patSizeDec()`, and `attack(enemyIndex)`,
// and each of its methods moves one soldier, patrol, or patrol-size step so the
// game's own click-multiplier keys decide how far a count moves the pace.
// Replace all of it when the Vue 3 update exposes garrison and underworld
// controls directly.

import type {
  GameGarrisonCampaignRequest,
  GameGarrisonControlsPort,
  GameGarrisonCountRequest,
  GameGarrisonFortressRequest,
  GameGarrisonTacticRequest,
} from "../../ports/game-garrison-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

export interface GameGarrisonControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;

  /**
   * One element per component call the game needs to move `count` steps. The
   * sequence holds the game's click-multiplier keys, so it is iterated only
   * once a step family's control is known to be actionable.
   */
  readonly clickSteps: (count: number) => Iterable<unknown>;

  /** The live game, whose garrison tactic the tactic navigation reads. */
  readonly getGame: () => unknown;

  /** Clears the game's click-multiplier keys before a single-shot hire. */
  readonly clearClickMultipliers: () => void;

  /**
   * The Vue method caller used for the garrison's `tactics` name read, which
   * resolves a method or the `$options.filters` fallback exactly as the rest of
   * the runtime does.
   */
  readonly callVueMethod: (
    view: unknown,
    methodName: string,
    args: readonly unknown[],
    legacyFilterName?: string,
  ) => unknown;
}

/** The garrison panel's current tactic, so the port can move toward a target. */
function currentGarrisonTactic(getGame: () => unknown): number | null {
  const game = getGame();
  const global = isRecord(game) ? game["global"] : undefined;
  const civic = isRecord(global) ? global["civic"] : undefined;
  const garrison = isRecord(civic) ? civic["garrison"] : undefined;
  const tactic = isRecord(garrison) ? garrison["tactic"] : undefined;
  return typeof tactic === "number" && Number.isFinite(tactic) ? tactic : null;
}

export function createGameGarrisonControls({
  getVueById,
  clickSteps,
  getGame,
  clearClickMultipliers,
  callVueMethod,
}: GameGarrisonControlsDependencies): GameGarrisonControlsPort {
  /** One component call, no pacing, for the single-shot garrison commands. */
  function single(
    elementId: string,
    method: string,
    args: readonly unknown[],
  ): boolean {
    const view = getVueById(elementId);
    if (!isRecord(view) || typeof view[method] !== "function") {
      return false;
    }
    const call = requireFunction(
      view[method],
      `${elementId} Vue view.${method}`,
    );
    Reflect.apply(call, view, args);
    return true;
  }

  /** One component call per `count` click step for the paced step families. */
  function step(elementId: string, method: string, count: number): boolean {
    const view = getVueById(elementId);
    if (!isRecord(view) || typeof view[method] !== "function") {
      return false;
    }
    const call = requireFunction(
      view[method],
      `${elementId} Vue view.${method}`,
    );
    for (const _step of clickSteps(count)) {
      Reflect.apply(call, view, []);
    }
    return true;
  }

  return Object.freeze({
    isRendered(elementId: string): boolean {
      return isRecord(getVueById(elementId));
    },

    launchCampaign(request: GameGarrisonCampaignRequest): boolean {
      return single(request.elementId, "campaign", [request.govIndex]);
    },

    hire(elementId: string): boolean {
      const view = getVueById(elementId);
      if (!isRecord(view) || typeof view.hire !== "function") {
        return false;
      }
      // The game multiplies a hire by the active click-multiplier keys unless
      // they are cleared first, exactly as the mercenary flow did before this
      // port existed.
      clearClickMultipliers();
      const hire = requireFunction(view.hire, `${elementId} Vue view.hire`);
      Reflect.apply(hire, view, []);
      return true;
    },

    setTactic(request: GameGarrisonTacticRequest): boolean {
      const view = getVueById(request.elementId);
      if (
        !isRecord(view) ||
        typeof view.next !== "function" ||
        typeof view.last !== "function"
      ) {
        return false;
      }
      const next = requireFunction(
        view.next,
        `${request.elementId} Vue view.next`,
      );
      const last = requireFunction(
        view.last,
        `${request.elementId} Vue view.last`,
      );
      const current = currentGarrisonTactic(getGame);
      if (current === null) {
        return false;
      }
      for (let tactic = current; tactic < request.tactic; tactic++) {
        Reflect.apply(next, view, []);
      }
      for (let tactic = current; tactic > request.tactic; tactic--) {
        Reflect.apply(last, view, []);
      }
      return true;
    },

    campaignTitle(request: GameGarrisonTacticRequest): string | null {
      const view = getVueById(request.elementId);
      if (!isRecord(view)) {
        return null;
      }
      const result = callVueMethod(view, "tactics", [request.tactic]);
      return typeof result === "string" ? result : null;
    },

    addBattalions(request: GameGarrisonCountRequest): boolean {
      return step(request.elementId, "aNext", request.count);
    },

    removeBattalions(request: GameGarrisonCountRequest): boolean {
      return step(request.elementId, "aLast", request.count);
    },

    addHellSoldiers(request: GameGarrisonCountRequest): boolean {
      return step(request.elementId, "aNext", request.count);
    },

    removeHellSoldiers(request: GameGarrisonCountRequest): boolean {
      return step(request.elementId, "aLast", request.count);
    },

    addHellPatrols(request: GameGarrisonCountRequest): boolean {
      return step(request.elementId, "patInc", request.count);
    },

    removeHellPatrols(request: GameGarrisonCountRequest): boolean {
      return step(request.elementId, "patDec", request.count);
    },

    addHellPatrolSize(request: GameGarrisonCountRequest): boolean {
      return step(request.elementId, "patSizeInc", request.count);
    },

    removeHellPatrolSize(request: GameGarrisonCountRequest): boolean {
      return step(request.elementId, "patSizeDec", request.count);
    },

    attackFortress(request: GameGarrisonFortressRequest): boolean {
      return single(request.elementId, "attack", [request.enemyIndex]);
    },
  });
}
