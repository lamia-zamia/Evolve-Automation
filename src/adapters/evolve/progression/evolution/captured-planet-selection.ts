/**
 * Captured planet selection.
 *
 * Two paths, and the difference matters. When the game drew exactly one planet row its id is the
 * complete answer and nothing has to be understood about it. When it drew several, the adapter
 * samples each row's game-rendered metadata (`captured-planet-metadata.ts`) and hands the pure
 * planner a full `PlanetSelectionInput`; the planner, not this module, does the scoring. If any
 * required fact is missing — an unparsable row, an unreadable achievement, a reveal count that
 * disagrees with the achievement state — the ranking input is withheld entirely and the sole-row
 * safe path is all that remains. A partial input would be scored as if it were complete.
 *
 * Selection is only reported as succeeded once the game has committed it: `race.chose` carries the
 * chosen row's id after `setPlanet`'s click handler runs. A dispatched click is not the outcome.
 */

import {
  isPlanetSelectionAvailable,
  planetSelectionAchievementIds,
  shouldSelectPlanet,
  type PlanetCandidate,
  type PlanetSelectionDecision,
  type PlanetSelectionGate,
  type PlanetSelectionInput,
} from "../../../../domain/progression/evolution/planet-selection.ts";
import { calculateAchievementStarLevel } from "../../../../domain/progression/prestige/achievement-guards.ts";
import { readAchievementStarLevelContext } from "../../progression/prestige/achievement-guards.ts";
import type {
  CapturedPlanetSelectionExecutor,
  CapturedPlanetSelectionReader,
} from "../../../../ports/captured-planet-selection.ts";
import type { GameDrawnActionsReader } from "../../../../ports/game-drawn-actions.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { PlanetMetadataReader } from "../../../../ports/planet-metadata.ts";
import type { PlanetSelectionControls } from "../../../../ports/progression-controls.ts";
import { stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isNonArrayRecord, readProperty } from "../../../validation.ts";
import { isCapturedAchievementUnlocked } from "../../captured-achievements.ts";
import {
  planetBiomeGenus,
  planetBiomes,
  planetTraits,
} from "../../runtime-catalogs.ts";
import { CAPTURED_EVOLUTION_RACES } from "./captured-evolution-catalog.ts";
import { readCapturedPlanetMetadata } from "./captured-planet-metadata.ts";

const PLANET_ACTION_SELECTOR = "#evolution > .action";

/** Race id to genus, for the `extinct_<race>` and `genus_<genus>` achievement counting. */
const CAPTURED_RACE_GENUS_BY_ID: Readonly<Record<string, string | null>> =
  Object.freeze(
    Object.fromEntries(
      CAPTURED_EVOLUTION_RACES.map((race) => [
        race.id,
        race.genus === "variable" ? null : race.genus,
      ]),
    ),
  );

export interface CapturedPlanetSelectionDependencies {
  readonly rootState: GameRootStateSource;
  readonly drawnActions: GameDrawnActionsReader;
  readonly readSettings: () => unknown;
  readonly controls: PlanetSelectionControls;
  /** Absent on a host with no document: ranking then stands down, selection still works. */
  readonly metadata?: PlanetMetadataReader;
}

function capturedPlanetRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return isNonArrayRecord(value) ? value : undefined;
}

function readRace(
  rootState: GameRootStateSource,
): Record<string, unknown> | undefined {
  return capturedPlanetRecord(
    readProperty(capturedPlanetRecord(rootState.readRoot()), "race"),
  );
}

function readGate(
  rootState: GameRootStateSource,
  readSettings: () => unknown,
): PlanetSelectionGate {
  const race = readRace(rootState);
  const settings = capturedPlanetRecord(readSettings());
  const targetName = settings?.["userPlanetTargetName"];
  const universe = race?.["universe"];
  return Object.freeze({
    universe: typeof universe === "string" ? universe : null,
    seeded: Boolean(race?.["seeded"]),
    chose: Boolean(race?.["chose"]),
    // Keep the game's lenient non-string comparison: only the literal "none"
    // disables selection, while other values use the sole-row safe path.
    targetName: typeof targetName === "string" ? targetName : null,
  });
}

/**
 * The game creates achievement entries lazily and a present entry can carry no level. `null` for
 * the absent entry and `NaN` for the level-less one are what the planner's own arithmetic expects.
 */
function achievementLevel(value: unknown): number | null {
  if (value === undefined || value === null || value === false) return null;
  if (!isNonArrayRecord(value)) return NaN;
  const level = value["l"];
  return typeof level === "number" ? level : NaN;
}

function settingNumber(
  settings: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = settings?.[key];
  return typeof value === "number" ? value : undefined;
}

/** The game's own reveal budget, the rule `planetGeology` applies before printing a percentage. */
function revealBudget(
  minersDreamLevel: number | null,
  lamentisLevel: number | null,
): number {
  let budget =
    minersDreamLevel !== null
      ? minersDreamLevel >= 4
        ? minersDreamLevel * 2 - 3
        : minersDreamLevel
      : 0;
  if ((lamentisLevel ?? NaN) >= 0) budget++;
  return budget;
}

export function createCapturedPlanetSelection({
  rootState,
  drawnActions,
  readSettings,
  controls,
  metadata,
}: CapturedPlanetSelectionDependencies): Readonly<{
  readonly reader: CapturedPlanetSelectionReader;
  readonly executor: CapturedPlanetSelectionExecutor;
}> {
  function readRanking(
    gate: PlanetSelectionGate,
    candidateIds: readonly string[],
  ): PlanetSelectionInput | undefined {
    // One row needs no ordering, and hovering it would cost a popover for nothing.
    if (metadata === undefined || candidateIds.length < 2) return undefined;
    if (!shouldSelectPlanet(gate)) return undefined;
    const root = capturedPlanetRecord(rootState.readRoot());
    if (root === undefined) return undefined;
    const settings = capturedPlanetRecord(readSettings());
    if (settings === undefined) return undefined;

    const achieve = capturedPlanetRecord(
      readProperty(capturedPlanetRecord(root["stats"]), "achieve"),
    );
    if (achieve === undefined) return undefined;
    const minersDreamLevel = achievementLevel(achieve["miners_dream"]);
    const lamentisLevel = achievementLevel(achieve["lamentis"]);
    const budget = revealBudget(minersDreamLevel, lamentisLevel);

    const planets: PlanetCandidate[] = [];
    for (const elementId of candidateIds) {
      const detail = metadata.readPlanetDetail(elementId);
      if (detail === undefined) return undefined;
      const parsed = readCapturedPlanetMetadata(detail);
      if (parsed === undefined) return undefined;
      const deposits = Object.keys(parsed.candidate.geology).length;
      // The game revealed as many deposits as its budget allowed. Anything else means the
      // achievement state this adapter read is not the one the popover was rendered with, and
      // the planner would spend its budget on the wrong deposits.
      if (parsed.revealedDeposits !== Math.min(budget, deposits)) {
        return undefined;
      }
      planets.push(parsed.candidate);
    }

    const starContext = readAchievementStarLevelContext(settings);
    if (starContext.status !== "ready") return undefined;
    const starLevel = calculateAchievementStarLevel(starContext.context);

    const achievementUnlocked: Record<string, boolean> = {};
    for (const id of planetSelectionAchievementIds(
      planets,
      CAPTURED_RACE_GENUS_BY_ID,
      planetBiomeGenus,
    )) {
      const unlocked = isCapturedAchievementUnlocked(root, id, starLevel);
      if (unlocked === undefined) return undefined;
      achievementUnlocked[id] = unlocked;
    }

    const biomeWeights: Record<string, number | undefined> = {};
    const traitWeights: Record<string, number | undefined> = {};
    const geologyWeights: Record<string, number | undefined> = {};
    for (const planet of planets) {
      biomeWeights[planet.biome] = settingNumber(
        settings,
        `biome_w_${planet.biome}`,
      );
      for (const trait of planet.traits) {
        traitWeights[trait] = settingNumber(settings, `trait_w_${trait}`);
      }
      for (const id of Object.keys(planet.geology)) {
        geologyWeights[id] = settingNumber(settings, `extra_w_${id}`);
      }
    }

    const gods = readProperty(readRace(rootState), "gods");
    return Object.freeze({
      planets: Object.freeze(planets),
      targetName: gate.targetName,
      gods: typeof gods === "string" ? gods : null,
      raceGenusById: CAPTURED_RACE_GENUS_BY_ID,
      biomeGenus: planetBiomeGenus,
      achievementUnlocked: Object.freeze(achievementUnlocked),
      minersDreamLevel,
      lamentisLevel,
      biomeWeights: Object.freeze(biomeWeights),
      traitWeights: Object.freeze(traitWeights),
      achievementWeight: settingNumber(settings, "extra_w_Achievement"),
      orbitWeight: settingNumber(settings, "extra_w_Orbit"),
      geologyWeights: Object.freeze(geologyWeights),
      biomeOrder: planetBiomes,
      planetTraitOrder: planetTraits,
    });
  }

  const reader: CapturedPlanetSelectionReader = Object.freeze({
    sample() {
      const candidateIds = Object.freeze(
        drawnActions.read(PLANET_ACTION_SELECTOR).map((action) => action.id),
      );
      const gate = readGate(rootState, readSettings);
      const ranking = readRanking(gate, candidateIds);
      return Object.freeze({
        gate,
        candidateIds,
        ...(ranking === undefined ? {} : { ranking }),
      });
    },
  });

  const executor: CapturedPlanetSelectionExecutor = Object.freeze({
    execute(decision: Readonly<PlanetSelectionDecision>) {
      const gate = readGate(rootState, readSettings);
      if (!isPlanetSelectionAvailable(gate)) {
        return stale(
          "planet-selection-unavailable",
          "planet selection became unavailable",
        );
      }
      if (!controls.selectPlanet(decision.elementId)) {
        return stale(
          "planet-control-unavailable",
          "planet selection control became unavailable",
        );
      }
      // `setPlanet`'s click handler writes the chosen row's id to `race.chose` and copies the
      // planet into `city`. Without that the click reached a G.E.C.K. reroll, a stale row, or
      // nothing at all — none of which is a selection.
      const chose = readProperty(readRace(rootState), "chose");
      if (chose !== decision.elementId) {
        return stale(
          "planet-selection-uncommitted",
          `planet ${decision.elementId} was clicked but the game committed ${String(chose)}`,
        );
      }
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
