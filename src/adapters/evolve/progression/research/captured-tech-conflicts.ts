/**
 * Research exclusions over the captured page surface.
 *
 * The decision is the existing pure policy in `domain/progression/research/tech-conflicts.ts`; this
 * module samples its input from the captured root, the effective settings and the captured resource
 * source instead of the legacy manager bags the compatibility runtime hands it. The settings half is
 * the shared `readTechConflictSettings`, so the keys a conflict depends on are still stated once.
 *
 * Every fact is sampled for the candidate that needs it and nothing else: a technology that no rule
 * mentions costs one settings read. Where the capture cannot answer a fact a rule needs, the
 * candidate is **rejected before invocation** rather than guessed at — not researching something is
 * recoverable on the next cycle, while taking the wrong side of a one-way fork is not.
 */

import {
  findTechConflict,
  type TechConflict,
  type TechConflictInput,
} from "../../../../domain/progression/research/tech-conflicts.ts";
import {
  isRetirementAssistActive,
  type RetirementAssistInput,
} from "../../../../domain/progression/prestige/retirement-prep.ts";
import type { GameResourceSource } from "../../../../ports/game-world-state.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { OfferedTech } from "../../../../ports/game-tech-catalog.ts";
import { readCapturedAscensionLevel } from "../../ascension-level.ts";
import { isCapturedAchievementUnlocked } from "../../captured-achievements.ts";
import { readCapturedAchievementGuard } from "../prestige/captured-achievement-guards.ts";
import { fanatAchievements } from "../../runtime-catalogs.ts";
import { readTechConflictSettings } from "./tech-conflicts.ts";
import { readProperty } from "../../../validation.ts";

/** Why the capture could not decide, in the caller's log. */
export type CapturedTechConflictUnavailableReason =
  | "invalid-settings"
  | "invalid-game-state"
  | "invalid-resource"
  | "banana-republic-progress"
  | "retirement-preparation"
  | "stabilization-state"
  | "achievement-guard";

export type CapturedTechConflictDecision =
  | { readonly status: "none" }
  | { readonly status: "conflict"; readonly conflict: Readonly<TechConflict> }
  | {
      readonly status: "unavailable";
      readonly reason: CapturedTechConflictUnavailableReason;
      readonly field?: string;
    };

export interface CapturedTechConflictReader {
  /** Decides one offered technology. `unavailable` is a rejection, never a permission. */
  evaluate(tech: Readonly<OfferedTech>): CapturedTechConflictDecision;
}

export interface CapturedTechConflictDependencies {
  readonly rootState: GameRootStateSource;
  /** The effective settings the rest of the tick reads. */
  readonly readSettings: () => unknown;
  readonly resources: GameResourceSource;
}

/** The technologies whose rules need the current Soul Gem holding. */
const SOUL_GEM_SENSITIVE = "tech-virtual_reality";
/** The one technology gated on a Knowledge ceiling. */
const KNOWLEDGE_GATED = "tech-xeno_gift";
const UNIFICATION_IDS: ReadonlySet<string> = new Set([
  "tech-unification2",
  "tech-unite",
]);
const THEOLOGY_IDS: ReadonlySet<string> = new Set([
  "tech-anthropology",
  "tech-fanaticism",
]);
const ISOLATION_ID = "tech-isolation_protocol";
const STABILIZE_ID = "tech-stabilize_blackhole";

const NO_CONFLICT: CapturedTechConflictDecision = Object.freeze({
  status: "none",
});
const EMPTY_SHORTFALL: readonly string[] = Object.freeze([]);

function conflictUnavailable(
  reason: CapturedTechConflictUnavailableReason,
  field?: string,
): CapturedTechConflictDecision {
  return Object.freeze(
    field === undefined
      ? { status: "unavailable", reason }
      : { status: "unavailable", reason, field },
  );
}

function finiteAmount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

export function createCapturedTechConflictReader(
  dependencies: CapturedTechConflictDependencies,
): CapturedTechConflictReader {
  const { rootState, readSettings, resources } = dependencies;

  /**
   * Soul Gems and the Knowledge ceiling, read only for the two technologies whose rules mention
   * them. Every other candidate gets zeros its rules can never reach.
   */
  function readResourceFacts(
    itemId: string,
    needsSoulGems: boolean,
  ): TechConflictInput["resources"] | undefined {
    const needsKnowledge = itemId === KNOWLEDGE_GATED;
    if (!needsSoulGems && !needsKnowledge) {
      return Object.freeze({ soulGems: 0, maximumKnowledge: 0 });
    }
    const ids: string[] = [];
    if (needsSoulGems) ids.push("Soul_Gem");
    if (needsKnowledge) ids.push("Knowledge");
    const sample = resources.readResources(ids);
    if (sample === undefined) return undefined;
    const soulGems = needsSoulGems
      ? finiteAmount(sample.resources.get("Soul_Gem")?.amount)
      : 0;
    const maximumKnowledge = needsKnowledge
      ? finiteAmount(sample.resources.get("Knowledge")?.max)
      : 0;
    if (soulGems === undefined || maximumKnowledge === undefined) {
      return undefined;
    }
    return Object.freeze({ soulGems, maximumKnowledge });
  }

  return Object.freeze({
    evaluate(tech: Readonly<OfferedTech>): CapturedTechConflictDecision {
      const itemId = tech.elementId;
      const settingsRead = readTechConflictSettings(readSettings());
      if (settingsRead.status !== "ready") {
        return conflictUnavailable("invalid-settings", settingsRead.field);
      }
      const settings = settingsRead.settings;

      // Stabilizing the blackhole is the one rule that depends on script state the captured runtime
      // does not keep — when the last stabilization happened, and whether a whitehole reset was
      // started and interrupted. Both outcomes of the readable half of the rule are a rejection, so
      // failing closed loses only the interrupted-reset recovery, which nothing here can detect.
      if (itemId === STABILIZE_ID) {
        return conflictUnavailable(
          "stabilization-state",
          "whiteholeLastStabilise",
        );
      }

      const root = rootState.readRoot();
      if (root === undefined) return conflictUnavailable("invalid-game-state");
      const race = readProperty(root, "race");
      const species = readProperty(race, "species");
      const gods = readProperty(race, "gods");
      if (typeof species !== "string" || typeof gods !== "string") {
        return conflictUnavailable("invalid-game-state", "race.species");
      }
      const guardStarLevel = readCapturedAscensionLevel(root);
      if (guardStarLevel === undefined) {
        return conflictUnavailable("invalid-game-state", "race");
      }

      const rawSoulGemCost = readProperty(tech.cost, "Soul_Gem");
      const soulGemCost =
        rawSoulGemCost === undefined ? null : finiteAmount(rawSoulGemCost);
      if (soulGemCost === undefined) {
        return conflictUnavailable("invalid-resource", "cost.Soul_Gem");
      }
      const needsSoulGems =
        settings.prestigeType === "whitehole" &&
        settings.saveWhiteholeSoulGems &&
        itemId !== SOUL_GEM_SENSITIVE &&
        soulGemCost !== null;
      const resourceFacts = readResourceFacts(itemId, needsSoulGems);
      if (resourceFacts === undefined) {
        return conflictUnavailable("invalid-resource");
      }

      let cultOfPersonality = false;
      let pacifist = false;
      if (UNIFICATION_IDS.has(itemId)) {
        // The Banana Republic guard is inactive outside a banana run, which the captured race
        // answers. Inside one it needs the objective progress, which the capture cannot read.
        if (readProperty(race, "banana") === true) {
          return conflictUnavailable("banana-republic-progress", "race.banana");
        }
        for (const [guard, assign] of [
          [
            "guardCultOfPersonality",
            (value: boolean) => {
              cultOfPersonality = value;
            },
          ],
          [
            "guardPacifist",
            (value: boolean) => {
              pacifist = value;
            },
          ],
        ] as const) {
          const result = readCapturedAchievementGuard(
            root,
            readSettings(),
            guard,
          );
          if (result.status === "unavailable") {
            return conflictUnavailable("achievement-guard", result.field);
          }
          assign(result.status === "active");
        }
      }

      if (itemId === ISOLATION_ID && settings.prestigeType === "retire") {
        const rawAssist = readProperty(
          readSettings(),
          "retirementChallengeAssist",
        );
        if (rawAssist !== undefined && typeof rawAssist !== "boolean") {
          return conflictUnavailable(
            "invalid-settings",
            "retirementChallengeAssist",
          );
        }
        const assistInput: Readonly<RetirementAssistInput> = Object.freeze({
          assistEnabled: rawAssist === true,
          truepath: readProperty(race, "truepath") === true,
          retirePrestige: true,
          isolationResearched:
            (finiteAmount(
              readProperty(readProperty(root, "tech"), "isolation"),
            ) ?? 0) >= 1,
        });
        if (isRetirementAssistActive(assistInput)) {
          // Assist is on and the run still owes its Tau build-out, but the shortfall list needs Tau
          // building counts and the Graphene ledger the capture does not sample. Retiring is
          // irreversible, so the candidate is rejected rather than taken on an unread plan.
          return conflictUnavailable(
            "retirement-preparation",
            "TauFusionGenerator",
          );
        }
      }

      let secondEvolution = false;
      const fanaticismAchievements: TechConflictInput["fanaticismAchievements"][number][] =
        [];
      if (THEOLOGY_IDS.has(itemId)) {
        const guard = readCapturedAchievementGuard(
          root,
          readSettings(),
          "guardSecondEvolution",
        );
        if (guard.status === "unavailable") {
          return conflictUnavailable("achievement-guard", guard.field);
        }
        secondEvolution = guard.status === "active";
        if (!secondEvolution) {
          for (const combination of fanatAchievements) {
            const unlocked = isCapturedAchievementUnlocked(
              root,
              combination.achieve,
              guardStarLevel,
            );
            if (unlocked === undefined) {
              return conflictUnavailable(
                "invalid-game-state",
                `stats.achieve.${combination.achieve}`,
              );
            }
            fanaticismAchievements.push(
              Object.freeze({
                race: combination.race,
                god: combination.god,
                unlocked,
              }),
            );
          }
        }
      }

      const input: TechConflictInput = Object.freeze({
        itemId,
        soulGemCost,
        settings,
        resources: resourceFacts,
        // Reached only by the stabilization rule, which returned above.
        stabilization: Object.freeze({
          lastAtMs: null,
          nowMs: 0,
          whiteholeResetInterrupted: false,
        }),
        race: Object.freeze({
          species,
          gods,
          achievementLevel: guardStarLevel,
        }),
        guards: Object.freeze({
          // A banana run rejected the candidate above, so the policy only ever sees this guard off.
          bananaRepublic: false,
          cultOfPersonality,
          pacifist,
          secondEvolution,
          // An active assist rejected the candidate above, so the policy only ever sees it off and
          // its shortfall list empty.
          retirementAssist: false,
          retirementMissing: EMPTY_SHORTFALL,
        }),
        fanaticismAchievements: Object.freeze(fanaticismAchievements),
      });
      const exclusion = findTechConflict(input);
      return exclusion === null
        ? NO_CONFLICT
        : Object.freeze({ status: "conflict", conflict: exclusion });
    },
  });
}
