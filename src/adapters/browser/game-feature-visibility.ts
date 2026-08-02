// TRANSITIONAL: the current Vue 2 shell withholds a feature in two ways, and
// which one it uses is per-control rather than uniform. `v-show` writes an
// inline `display: none`, while the evolution actions toggle Bulma's
// `is-hidden` class. Replace both reads when the Vue 3 update exposes feature
// availability as state instead of as rendered style.

import type { GameFeatureVisibilityPort } from "../../ports/game-feature-visibility.ts";

/** The subset of a page element this adapter touches. */
interface VisibilityElement {
  readonly style?: { readonly display?: string };
  readonly classList?: { contains(token: string): boolean };
}

interface VisibilityDocument {
  querySelector(selector: string): VisibilityElement | null;
}

export interface GameFeatureVisibilityDependencies {
  readonly getDocument: () => VisibilityDocument;
}

export function createGameFeatureVisibility({
  getDocument,
}: GameFeatureVisibilityDependencies): GameFeatureVisibilityPort {
  return Object.freeze({
    isVisible(selector: string): boolean {
      const element = getDocument().querySelector(selector);
      if (element === null || element === undefined) {
        return false;
      }

      return (
        element.style?.display !== "none" &&
        element.classList?.contains("is-hidden") !== true
      );
    },
  });
}
