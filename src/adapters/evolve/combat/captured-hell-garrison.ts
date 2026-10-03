/**
 * The Hell fortress's displayed stationed soldiers, from DeadSpace `buildFortress`'s
 * `patrolling(f.garrison)`. The game owns the patrol, powered soul-forge, and guardpost
 * deductions. Planned assault and extra operating reserves belong to automation planning;
 * this condition deliberately reads the actual defenders instead of the compatibility reserve.
 */

import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { finite, isNonArrayRecord, readProperty } from "../../validation.ts";

export const HELL_FORTRESS_CONTROL = "fort";
export const HELL_GARRISON_CONTROLS = Object.freeze([
  HELL_FORTRESS_CONTROL,
  "gFort",
] as const);

export const HELL_ORDINARY_FORTRESS_METHODS = Object.freeze([
  "patrolling",
  "aNext",
  "aLast",
  "patInc",
  "patDec",
  "patSizeInc",
  "patSizeDec",
] as const);

export function resolveCapturedOrdinaryFortress(
  controls: GameControlRegistry,
  methods: readonly string[],
): GameControlHandle | undefined {
  return HELL_GARRISON_CONTROLS.map((id) => controls.resolve(id)).find(
    (candidate) =>
      candidate !== undefined &&
      candidate.methods.includes("patrolling") &&
      methods.every((method) => candidate.methods.includes(method)),
  );
}

export function readCapturedHellGarrison(
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
  expectedRoot: unknown = rootState.readRoot(),
): number | undefined {
  try {
    const root = rootState.readRoot();
    if (root !== expectedRoot) return undefined;
    const race = readProperty(root, "race");
    const portal = readProperty(root, "portal");
    if (
      !isNonArrayRecord(root) ||
      !isNonArrayRecord(race) ||
      !isNonArrayRecord(portal) ||
      // Warlord's `#fort` is `buildEnemyFortress`, a different component with no `patrolling`;
      // upstream skips `buildFortress` entirely for that trait, so neither id can answer here.
      readProperty(race, "warlord")
    ) {
      return undefined;
    }
    const fortress = readProperty(portal, "fortress");
    // The `fortifications` tech (`grant: ['portal',2]`) creates garrison, patrols, and patrol_size
    // in one literal, so an absent bag means the fortress is unbuilt and has no defenders.
    if (fortress === undefined) return 0;
    if (!isNonArrayRecord(fortress)) return undefined;
    const garrison = finite(readProperty(fortress, "garrison"));
    if (
      garrison === undefined ||
      finite(readProperty(fortress, "patrols")) === undefined ||
      finite(readProperty(fortress, "patrol_size")) === undefined
    ) {
      return undefined;
    }
    const control = resolveCapturedOrdinaryFortress(controls, ["patrolling"]);
    if (control === undefined) return undefined;
    const result = controls.invoke(control, "patrolling", [garrison]);
    if (
      !result.ok ||
      rootState.readRoot() !== expectedRoot ||
      controls.resolve(control.elementId)?.generation !== control.generation
    ) {
      return undefined;
    }
    return finite(result.value);
  } catch {
    return undefined;
  }
}
