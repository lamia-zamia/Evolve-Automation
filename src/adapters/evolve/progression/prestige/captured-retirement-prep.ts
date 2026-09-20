/**
 * The Tau build-out a Retirement run owes, read from the captured root.
 *
 * The legacy reader took these from the mutable building manager bag. The same three structures are
 * ordinary captured regional entries — `global.tauceti.fusion_generator`, `tau_factory` and
 * `infectious_disease_lab` — and the Graphene ledger is the resource port every other captured
 * reader already uses, so nothing here needs a manager.
 *
 * The shortfall is named by its captured binding rather than by a localized display name: the
 * captured root carries counts, not labels, and the binding is what a log reader can act on.
 */

import {
  assessRetirementPreparation,
  type RetirementShortfall,
  type RetirementThresholds,
} from "../../../../domain/progression/prestige/retirement-prep.ts";
import type { GameResourceSource } from "../../../../ports/game-world-state.ts";
import {
  finiteNonNegative,
  isRecord,
  readProperty,
} from "../../../validation.ts";

/** The captured binding of each structure the preparation counts, in shortfall order. */
const RETIREMENT_PREP_BUILDINGS = Object.freeze([
  ["fusionGenerators", "tauceti", "fusion_generator"],
  ["factories", "tauceti", "tau_factory"],
  ["scienceLabs", "tauceti", "infectious_disease_lab"],
] as const);

const GRAPHENE_ID = "Graphene";

function capturedCount(
  root: unknown,
  region: string,
  id: string,
): number | undefined {
  const entry = readProperty(readProperty(root, region), id);
  // A structure the run has not unlocked has no entry at all, which is a count of zero rather than
  // a malformed state: the preparation is precisely the thing that has not been built yet.
  if (entry === undefined) return 0;
  if (!isRecord(entry)) return undefined;
  return finiteNonNegative(readProperty(entry, "count"));
}

/**
 * `undefined` when the capture cannot describe the preparation. The caller fails closed on it,
 * because retiring is irreversible.
 */
export function readCapturedRetirementShortfalls(
  root: unknown,
  resources: GameResourceSource,
  thresholds: Readonly<RetirementThresholds>,
): readonly Readonly<RetirementShortfall>[] | undefined {
  const counts = {} as Record<
    (typeof RETIREMENT_PREP_BUILDINGS)[number][0],
    { readonly name: string; readonly count: number }
  >;
  for (const [key, region, id] of RETIREMENT_PREP_BUILDINGS) {
    const count = capturedCount(root, region, id);
    if (count === undefined) return undefined;
    counts[key] = Object.freeze({ name: `${region}-${id}`, count });
  }

  const sample = resources.readResources([GRAPHENE_ID]);
  if (sample === undefined) return undefined;
  const graphene = sample.resources.get(GRAPHENE_ID);
  const currentQuantity = finiteNonNegative(graphene?.amount);
  // The game stores an uncapped resource as -1. Graphene is always capped, so a negative ceiling is
  // a reading this module has no business acting on.
  const maxQuantity = finiteNonNegative(graphene?.max);
  if (currentQuantity === undefined || maxQuantity === undefined) {
    return undefined;
  }

  return assessRetirementPreparation({
    fusionGenerators: counts.fusionGenerators,
    factories: counts.factories,
    scienceLabs: counts.scienceLabs,
    graphene: Object.freeze({
      name: GRAPHENE_ID,
      currentQuantity,
      maxQuantity,
    }),
    thresholds,
  });
}
