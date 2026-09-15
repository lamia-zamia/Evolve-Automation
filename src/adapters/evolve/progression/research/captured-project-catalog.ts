/** A.R.P.A. availability and exact per-percent prices from the panel the game draws. */

import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameDrawnProjectsReader } from "../../../../ports/game-drawn-projects.ts";
import type {
  GameProjectCatalog,
  OfferedProject,
} from "../../../../ports/game-project-catalog.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { GameTabDiscovery } from "../../../../ports/game-tab-discovery.ts";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_SETTING,
} from "../../captured-tab-discovery.ts";
import { requireCount, requireNonArrayRecord } from "../../../validation.ts";

const ARPA_PANEL_SELECTOR = "#arpaPhysics";
const PROJECT_SELECTOR = "#arpaPhysics .arpaProject";
const ARPA_TAB_PATH = Object.freeze([
  Object.freeze({
    setting: MAIN_TAB_SETTING,
    control: MAIN_TAB_CONTROL,
    index: MAIN_TAB_INDEX.arpa,
  }),
]);

export interface CapturedProjectCatalogDependencies {
  readonly rootState: GameRootStateSource;
  readonly discovery: GameTabDiscovery;
  readonly drawnProjects: GameDrawnProjectsReader;
  readonly controls: GameControlRegistry;
  readonly onUnavailable?: (reason: string) => void;
  readonly onDiagnostic?: (reason: string) => void;
}

/** The half of a row that the draw supplies: everything but the live-state figures below. */
type DrawnProjectRow = Readonly<{
  elementId: string;
  projectId: string;
  cost: Readonly<Record<string, number>>;
}>;

/**
 * The live-state half of every row, in one place so the draw and a later restatement cannot drift.
 * Rank and progress are read from `game.arpa`, never from the popover, and the generation from the
 * control registry.
 */
function priceProjectRows(
  rows: readonly DrawnProjectRow[],
  arpa: Readonly<Record<string, unknown>>,
  controls: GameControlRegistry,
): readonly Readonly<OfferedProject>[] {
  return Object.freeze(
    rows.map((project) => {
      const state = requireNonArrayRecord(
        arpa[project.projectId],
        `game.arpa.${project.projectId}`,
      );
      return Object.freeze({
        elementId: project.elementId,
        projectId: project.projectId,
        cost: project.cost,
        rank: requireCount(
          state["rank"],
          `game.arpa.${project.projectId}.rank`,
        ),
        progress: requireCount(
          state["complete"],
          `game.arpa.${project.projectId}.complete`,
        ),
        generation: controls.resolve(project.elementId)?.generation ?? 0,
      });
    }),
  );
}

export function createCapturedProjectCatalog(
  dependencies: CapturedProjectCatalogDependencies,
): GameProjectCatalog {
  const { rootState, discovery, drawnProjects, controls } = dependencies;
  const reportUnavailable = dependencies.onUnavailable ?? (() => {});
  const reportDiagnostic = dependencies.onDiagnostic ?? (() => {});

  /** The `game.arpa` record, or `undefined` before the game has built one. */
  const readProjectState = ():
    Readonly<Record<string, unknown>> | undefined => {
    const root = rootState.readRoot();
    if (root === undefined) return undefined;
    const game = requireNonArrayRecord(root, "game root");
    return requireNonArrayRecord(game["arpa"], "game.arpa");
  };

  return Object.freeze({
    readProjects(): readonly Readonly<OfferedProject>[] | undefined {
      const root = rootState.readRoot();
      if (root === undefined) {
        reportUnavailable("the game root has not been captured yet");
        return undefined;
      }
      const game = requireNonArrayRecord(root, "game root");
      const resources = requireNonArrayRecord(
        game["resource"],
        "game.resource",
      );
      const arpa = requireNonArrayRecord(game["arpa"], "game.arpa");
      let projects: readonly Readonly<OfferedProject>[] | undefined;
      const result = discovery.discover(ARPA_TAB_PATH, {
        isPanelDrawn: () => drawnProjects.exists(ARPA_PANEL_SELECTOR),
        whileDrawn: () => {
          const drawn = drawnProjects.read(
            PROJECT_SELECTOR,
            Object.keys(resources),
          );
          if (drawn === undefined) return;
          projects = priceProjectRows(drawn, arpa, controls);
        },
      });
      if (result.outcome.status !== "succeeded") {
        reportDiagnostic(
          result.outcome.failure?.message ?? result.outcome.status,
        );
        return undefined;
      }
      if (projects === undefined) {
        reportUnavailable("the project panel could not supply exact costs");
        return undefined;
      }
      return projects;
    },
    restate(
      projects: readonly Readonly<OfferedProject>[],
    ): readonly Readonly<OfferedProject>[] | undefined {
      const arpa = readProjectState();
      if (arpa === undefined) {
        reportUnavailable("the game root has not been captured yet");
        return undefined;
      }
      // The cached price is the only part of a row the draw owns, so it is carried through
      // unchanged and everything else is taken from the game again.
      return priceProjectRows(projects, arpa, controls);
    },
  });
}
