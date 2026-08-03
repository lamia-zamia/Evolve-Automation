// TRANSITIONAL: the Vue 2 research tab renders each entry as its own element,
// gives an offered entry a `.button` child that is not the precognition
// preview, marks a completed one with an `.oldTech` child that stays mounted,
// and exposes the purchase as the element component's `action()`. Replace all
// three reads when the Vue 3 update exposes research state and activation
// directly.

import type { GameResearchControlsPort } from "../../ports/game-research-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

/** The subset of the page this adapter touches. */
interface ResearchDocument {
  querySelector(selector: string): unknown;
}

export interface GameResearchControlsDependencies {
  readonly getDocument: () => ResearchDocument;
  readonly getVueById: (elementId: string) => unknown;
}

/** The buy control of an offered entry. `.precog` is the preview of a future one. */
function buyControl(elementId: string): string {
  return `#${elementId} > .button:not(.precog)`;
}

/** A researched entry keeps this child; the game leaves the element mounted. */
function completedMarker(elementId: string): string {
  return `#${elementId} .oldTech`;
}

export function createGameResearchControls({
  getDocument,
  getVueById,
}: GameResearchControlsDependencies): GameResearchControlsPort {
  function hasChild(selector: string): boolean {
    const element = getDocument().querySelector(selector);
    return element !== null && element !== undefined;
  }

  return Object.freeze({
    isOffered(elementId: string): boolean {
      return hasChild(buyControl(elementId)) && isRecord(getVueById(elementId));
    },

    isCompleted(elementId: string): boolean {
      return hasChild(completedMarker(elementId));
    },

    start(elementId: string): boolean {
      const view = getVueById(elementId);
      if (!isRecord(view) || typeof view["action"] !== "function") {
        return false;
      }
      const action = requireFunction(
        view["action"],
        `${elementId} Vue view.action`,
      );
      Reflect.apply(action, view, []);
      return true;
    },
  });
}
