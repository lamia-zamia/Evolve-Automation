// TRANSITIONAL: the Vue 2 ascension lab mounts as `celestialLab`, holds the
// design being built on its component's `g`, and recosts it only when its
// `geneEdit()` runs. Which traits the lab offers is not on the component at
// all — it is whichever `.t<trait>` buttons the panel rendered. Replace all
// three when the Vue 3 update exposes the lab's design as state.

import type {
  CustomRaceLabDesign,
  GameCustomRaceLabPort,
} from "../../ports/game-custom-race-lab.ts";
import {
  callVoid,
  coerceNumber,
  isRecord,
  requireRecord,
} from "../validation.ts";

/** The element id the game gives the lab. */
const LAB_PANEL = "celestialLab";

/** The trait ids the lab's own class names can express. */
const TRAIT_ID = /^[a-z0-9_]+$/;

/** The subset of a page element this adapter touches. */
interface LabElement {
  readonly nodeType?: number;
}

interface LabDocument {
  querySelector(selector: string): LabElement | null;
}

export interface GameCustomRaceLabDependencies {
  readonly getVueById: (elementId: string) => unknown;
  readonly getDocument: () => LabDocument;
}

export function createGameCustomRaceLab({
  getVueById,
  getDocument,
}: GameCustomRaceLabDependencies): GameCustomRaceLabPort {
  /** The lab's live design, or undefined while no lab holds one. */
  function design(): Record<PropertyKey, unknown> | undefined {
    const view = getVueById(LAB_PANEL);
    if (!isRecord(view)) {
      return undefined;
    }
    const held = view["g"];
    return isRecord(held) ? held : undefined;
  }

  return Object.freeze({
    currentGenus(): string | null {
      const genus = design()?.["genus"];
      return typeof genus === "string" ? genus : null;
    },

    offersTrait(traitId: string): boolean {
      if (!TRAIT_ID.test(traitId)) {
        return false;
      }
      return getDocument().querySelector(`#${LAB_PANEL} .t${traitId}`) != null;
    },

    applyDesign(wanted: CustomRaceLabDesign): number | null {
      const view = getVueById(LAB_PANEL);
      const held = design();
      if (!isRecord(view) || held === undefined) {
        return null;
      }

      for (const [key, value] of Object.entries(wanted.text)) {
        held[key] = value;
      }
      held["genus"] = wanted.genus;
      held["traitlist"] = [...wanted.traits];
      held["fanaticism"] = wanted.fanaticism;
      // The lab's own rank map is kept and refilled, not replaced, so the
      // component keeps the object it made reactive.
      held["ranks"] ??= {};
      const ranks = requireRecord(held["ranks"], `${LAB_PANEL} design.ranks`);
      for (const trait of Object.keys(ranks)) {
        delete ranks[trait];
      }
      Object.assign(ranks, wanted.ranks);

      callVoid(view, "geneEdit", `${LAB_PANEL} Vue view`);
      return coerceNumber(held["genes"]);
    },
  });
}
