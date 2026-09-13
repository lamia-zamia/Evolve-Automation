/**
 * Reads exact A.R.P.A. costs through the hover popovers the game installs on every project button.
 * The row itself carries no price: `arpaProjectCosts` writes exact `data-<Resource>` attributes
 * only when that popover opens. A player's existing popover is never displaced for a sample.
 */

import type {
  DrawnProject,
  GameDrawnProjectsReader,
} from "../../ports/game-drawn-projects.ts";
import { GAME_TOOLTIP_SELECTOR } from "./game-tooltip-element.ts";

interface ProjectElement {
  readonly id?: unknown;
  readonly attributes?: ArrayLike<{
    readonly name: string;
    readonly value: string;
  }>;
  querySelector?(selector: string): ProjectElement | null;
  querySelectorAll?(selector: string): ArrayLike<ProjectElement>;
  dispatchEvent?(event: unknown): boolean;
}

interface ProjectDocument {
  querySelectorAll(selector: string): ArrayLike<ProjectElement>;
}

export interface GameDrawnProjectsDependencies {
  readonly getDocument: () => ProjectDocument;
  readonly createMouseEvent: (type: "mouseover" | "mouseout") => unknown;
}

/** The game's single hover-popover element, rewritten per control. */
const POPPER_SELECTOR = GAME_TOOLTIP_SELECTOR;

function collectCost(
  popper: ProjectElement,
  resources: ReadonlyMap<string, string>,
): Record<string, number> {
  const cost: Record<string, number> = {};
  const elements = [
    popper,
    ...Array.from(popper.querySelectorAll?.("*") ?? []),
  ];
  for (const element of elements) {
    for (const attribute of Array.from(element.attributes ?? [])) {
      if (!attribute.name.startsWith("data-")) continue;
      const resource = resources.get(attribute.name.slice(5).toLowerCase());
      const amount = Number(attribute.value);
      if (resource !== undefined && Number.isFinite(amount) && amount > 0) {
        cost[resource] = amount;
      }
    }
  }
  return cost;
}

export function createGameDrawnProjectsReader({
  getDocument,
  createMouseEvent,
}: GameDrawnProjectsDependencies): GameDrawnProjectsReader {
  return Object.freeze({
    read(
      selector: string,
      resourceNames: readonly string[],
    ): readonly Readonly<DrawnProject>[] | undefined {
      const document = getDocument();
      if (document.querySelectorAll(POPPER_SELECTOR).length > 0)
        return undefined;
      const resources = new Map(
        resourceNames.map((name) => [name.toLowerCase(), name]),
      );
      const projects: DrawnProject[] = [];

      for (const row of Array.from(document.querySelectorAll(selector))) {
        const elementId = row.id;
        const button = row.querySelector?.(".buy .x1") ?? null;
        if (
          typeof elementId !== "string" ||
          !elementId.startsWith("arpa") ||
          elementId.length === 4 ||
          button === null ||
          typeof button.dispatchEvent !== "function"
        ) {
          return undefined;
        }

        button.dispatchEvent(createMouseEvent("mouseover"));
        try {
          const poppers = Array.from(
            document.querySelectorAll(POPPER_SELECTOR),
          );
          if (poppers.length !== 1) return undefined;
          const cost = collectCost(poppers[0] as ProjectElement, resources);
          if (Object.keys(cost).length === 0) return undefined;
          projects.push(
            Object.freeze({
              elementId,
              projectId: elementId.slice(4),
              cost: Object.freeze(cost),
            }),
          );
        } finally {
          button.dispatchEvent(createMouseEvent("mouseout"));
        }
        if (document.querySelectorAll(POPPER_SELECTOR).length > 0)
          return undefined;
      }
      return Object.freeze(projects);
    },
    exists(selector: string): boolean {
      return getDocument().querySelectorAll(selector).length > 0;
    },
  });
}
