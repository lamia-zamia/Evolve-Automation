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
}

export function createCapturedProjectCatalog(
  dependencies: CapturedProjectCatalogDependencies,
): GameProjectCatalog {
  const { rootState, discovery, drawnProjects, controls } = dependencies;
  const reportUnavailable = dependencies.onUnavailable ?? (() => {});

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
          projects = Object.freeze(
            drawn.map((project) => {
              const state = requireNonArrayRecord(
                arpa[project.projectId],
                `game.arpa.${project.projectId}`,
              );
              return Object.freeze({
                ...project,
                rank: requireCount(
                  state["rank"],
                  `game.arpa.${project.projectId}.rank`,
                ),
                progress: requireCount(
                  state["complete"],
                  `game.arpa.${project.projectId}.complete`,
                ),
                generation:
                  controls.resolve(project.elementId)?.generation ?? 0,
              });
            }),
          );
        },
      });
      if (result.outcome.status !== "succeeded" || projects === undefined) {
        reportUnavailable(
          result.outcome.status === "succeeded"
            ? "the project panel could not supply exact costs"
            : (result.outcome.failure?.message ?? result.outcome.status),
        );
        return undefined;
      }
      return projects;
    },
  });
}
