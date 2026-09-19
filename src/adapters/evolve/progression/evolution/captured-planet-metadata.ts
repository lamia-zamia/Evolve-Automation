/**
 * Turns one drawn planet row back into the `PlanetCandidate` the planner scores.
 *
 * What the game leaves reachable, and how each field is recovered:
 *
 * - **biome** — from the element id, which `setPlanet` builds by capitalizing `biome + num`. The
 *   leading letters are the biome id and the trailing digits are the generated number. No label
 *   table is involved, which makes this the one language-independent field.
 * - **traits** — from the row title, `${traitLabels}${biomeLabel} ${num}`. The biome label and the
 *   number are already known from the id, so what remains is the trait labels.
 * - **orbit** — from the popover's `set_planet` line, which begins with the title; the one number
 *   after it is the orbital period.
 * - **geology** — from the popover's `.pGeo` rows: the sign from the row's class, and the exact
 *   percentage from the rows the game chose to reveal under its own `miners_dream`/`lamentis`
 *   budget.
 *
 * Every step fails closed. A title that does not end in the expected biome label and number, an
 * unknown trait or resource label, or a reveal count that disagrees with the achievement state all
 * return `undefined`, and the caller falls back to the sole-row safe path rather than ranking on a
 * guess. Non-English pages land there too: the trait and resource labels below are the English
 * strings at the port reference commit, which is the same limit every other captured catalog has.
 */

import type { PlanetCandidate } from "../../../../domain/progression/evolution/planet-selection.ts";
import type { DrawnPlanetDetail } from "../../../../ports/planet-metadata.ts";
import {
  extraList,
  planetBiomes,
  planetTraits,
} from "../../runtime-catalogs.ts";
import { capturedPlanetLabel } from "./captured-planet-labels.ts";

const TRAIT_BY_LABEL = new Map(
  planetTraits
    .filter((trait) => trait !== "none")
    .map((trait) => [capturedPlanetLabel(trait), trait] as const),
);
// `extraList` also carries the two pseudo-deposits the weighting settings use, `Achievement` and
// `Orbit`, which are never printed as geology rows.
const GEOLOGY_BY_LABEL = new Map(
  extraList
    .filter((id) => id !== "Achievement" && id !== "Orbit")
    .map((id) => [id, id] as const),
);

/** The trait list the planner expects: the script's weighting table has a `none` entry. */
const NO_TRAITS: readonly string[] = Object.freeze(["none"]);

export interface CapturedPlanetMetadata {
  readonly candidate: PlanetCandidate;
  /** How many deposits the game revealed a percentage for, used to cross-check the reveal rule. */
  readonly revealedDeposits: number;
}

function splitElementId(
  elementId: string,
): { readonly biome: string; readonly num: string } | undefined {
  const match = /^([A-Za-z]+)(\d+)$/.exec(elementId);
  if (match === null) return undefined;
  const biome = match[1]!.toLowerCase();
  return planetBiomes.includes(biome) ? { biome, num: match[2]! } : undefined;
}

function readTraits(
  title: string,
  biome: string,
  num: string,
): readonly string[] | undefined {
  const suffix = ` ${capturedPlanetLabel(biome)} ${num}`;
  const exact = `${capturedPlanetLabel(biome)} ${num}`;
  const head = title.endsWith(suffix)
    ? title.slice(0, title.length - suffix.length)
    : title === exact
      ? ""
      : undefined;
  if (head === undefined) return undefined;
  const labels = head.split(/\s+/).filter((token) => token !== "");
  if (labels.length === 0) return NO_TRAITS;
  const traits: string[] = [];
  for (const label of labels) {
    const trait = TRAIT_BY_LABEL.get(label);
    if (trait === undefined) return undefined;
    traits.push(trait);
  }
  return Object.freeze(traits);
}

function readOrbit(summary: string, title: string): number | undefined {
  if (!summary.startsWith(title)) return undefined;
  const numbers = summary.slice(title.length).match(/-?\d+/g);
  // The sentence names exactly one number once the title is out of the way. Anything else means
  // this is not the line we think it is.
  if (numbers === null || numbers.length !== 1) return undefined;
  const orbit = Number(numbers[0]);
  return Number.isFinite(orbit) ? orbit : undefined;
}

/**
 * Deposits in reveal order: the ones the game printed a percentage for first.
 *
 * The planner spends its reveal budget over `Object.keys(geology)` in order, and the game spent
 * the same budget over its own insertion order while rendering bonuses before maluses. Ordering
 * the revealed deposits first makes the two land on the same entries; the caller's count check is
 * what proves the budgets agree.
 */
function readGeology(
  detail: Readonly<DrawnPlanetDetail>,
): { geology: Record<string, number>; revealed: number } | undefined {
  const revealedEntries: [string, number][] = [];
  const hiddenEntries: [string, number][] = [];
  for (const row of detail.geology) {
    const id = GEOLOGY_BY_LABEL.get(row.label);
    if (id === undefined) return undefined;
    if (row.percent === undefined) {
      // Only the sign reaches the planner on an unrevealed deposit, which is exactly what the
      // game's own Bonus/Malus word says.
      hiddenEntries.push([id, row.beneficial ? 0.01 : -0.01]);
    } else {
      if (row.percent === 0) return undefined;
      if (row.percent > 0 !== row.beneficial) return undefined;
      revealedEntries.push([id, row.percent / 100]);
    }
  }
  const geology: Record<string, number> = {};
  for (const [id, value] of [...revealedEntries, ...hiddenEntries]) {
    if (Object.prototype.hasOwnProperty.call(geology, id)) return undefined;
    geology[id] = value;
  }
  return { geology, revealed: revealedEntries.length };
}

export function readCapturedPlanetMetadata(
  detail: Readonly<DrawnPlanetDetail>,
): CapturedPlanetMetadata | undefined {
  const parts = splitElementId(detail.elementId);
  if (parts === undefined) return undefined;
  const traits = readTraits(detail.title, parts.biome, parts.num);
  if (traits === undefined) return undefined;
  const orbit = readOrbit(detail.summary, detail.title);
  if (orbit === undefined) return undefined;
  const geology = readGeology(detail);
  if (geology === undefined) return undefined;
  return Object.freeze({
    candidate: Object.freeze({
      id: detail.elementId,
      biome: parts.biome,
      traits,
      orbit,
      geology: Object.freeze(geology.geology),
    }),
    revealedDeposits: geology.revealed,
  });
}
