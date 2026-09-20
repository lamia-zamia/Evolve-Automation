/**
 * Research exclusions over the captured page surface.
 *
 * The decision is the existing pure policy in `domain/progression/research/tech-conflicts.ts`; this
 * module samples its input from the captured root, the effective settings and the captured resource
 * source instead of the legacy manager bags the compatibility runtime hands it. The settings half is
 * the shared `readTechConflictSettings`, so the keys a conflict depends on are still stated once.
 *
 * Every fact is sampled for the candidate that needs it and nothing else: a technology that no rule
 * mentions costs one settings read. That is a correctness rule and not only a cost one — the game
 * creates much of `global.race` lazily, so validating a field an unrelated rule happens to name
 * would reject candidates over a fact their own rule never reads. Sample inside the branch that
 * needs it.
 *
 * Where the capture cannot answer a fact a rule genuinely needs, the candidate is **rejected before
 * invocation** rather than guessed at — not researching something is recoverable on the next cycle,
 * while taking the wrong side of a one-way fork is not.
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
import { readCapturedBananaProgress } from "../../civic/captured-banana-republic.ts";
import { readCapturedRetirementShortfalls } from "../prestige/captured-retirement-prep.ts";
import { isBananaRepublicReadyForUnification } from "../../../../domain/civic/banana-republic.ts";
import { RETIREMENT_PREP } from "../../../../domain/progression/build/building-weighting-rules.ts";
import { readTechConflictSettings } from "./tech-conflicts.ts";
import { finiteNonNegative, readProperty } from "../../../validation.ts";

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

/**
 * What the game itself stores for "no gods", and the value a lazily absent name reads as.
 *
 * `global.race.gods` is not guaranteed: upstream sets it at genesis but only carries it across a
 * race replacement conditionally (`if (global.race['gods'])` in `src/vars.js`), and `src/achieve.js`
 * tests `hasOwnProperty('gods')` before reading it. Demanding a string here would reject every
 * theology candidate on a state that never set one, where the rule's own answer is simply that no
 * fanaticism pairing matches. `species` is read the same way for the same comparison.
 */
const ABSENT_RACE_NAME = "none";

function raceName(value: unknown): string {
  return typeof value === "string" ? value : ABSENT_RACE_NAME;
}

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
      ? finiteNonNegative(sample.resources.get("Soul_Gem")?.amount)
      : 0;
    const maximumKnowledge = needsKnowledge
      ? finiteNonNegative(sample.resources.get("Knowledge")?.max)
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

      // The one rule whose facts are genuinely absent from the capture rather than merely unwired.
      // Both live in the legacy runtime's own session state (`adapters/evolve/runtime-state.ts`),
      // written by the legacy stabilization action and prestige path, and the captured runtime keeps
      // no equivalent:
      //
      //   `whiteholeLastStabilise`  — when THIS SCRIPT last stabilized, for the cooldown. Nothing in
      //                               `global` records it; the game keeps no stabilization history.
      //   `whiteholeResetStarted`   — whether this script began a whitehole reset. Its partner
      //                               `global.tech.whitehole` IS captured, but the flag is what
      //                               separates "reset in progress" from "reset grant interrupted",
      //                               and guessing it wrong takes a one-way fork.
      //
      // Closing this needs the captured runtime to own those two facts, not a new read of `global`.
      // Until then the candidate is rejected, which costs the interrupted-reset recovery.
      if (itemId === STABILIZE_ID) {
        return conflictUnavailable(
          "stabilization-state",
          "whiteholeLastStabilise",
        );
      }

      const root = rootState.readRoot();
      if (root === undefined) return conflictUnavailable("invalid-game-state");
      const race = readProperty(root, "race");

      const rawSoulGemCost = readProperty(tech.cost, "Soul_Gem");
      const soulGemCost =
        rawSoulGemCost === undefined ? null : finiteNonNegative(rawSoulGemCost);
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

      let bananaRepublic = false;
      let cultOfPersonality = false;
      let pacifist = false;
      if (UNIFICATION_IDS.has(itemId)) {
        // The Banana Republic guard is inactive outside a banana run, which the captured race
        // answers. Inside one it needs the objective progress, which the captured `stats.banana`
        // and the trade ledger do answer.
        if (readProperty(race, "banana") === true) {
          const progress = readCapturedBananaProgress(root);
          if (progress === undefined) {
            return conflictUnavailable(
              "banana-republic-progress",
              "stats.banana",
            );
          }
          bananaRepublic = !isBananaRepublicReadyForUnification(progress);
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

      let retirementAssist = false;
      let retirementMissing: readonly string[] = EMPTY_SHORTFALL;
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
            (finiteNonNegative(
              readProperty(readProperty(root, "tech"), "isolation"),
            ) ?? 0) >= 1,
        });
        if (isRetirementAssistActive(assistInput)) {
          // Assist is on, so the run owes its Tau build-out. The counts are ordinary captured
          // regional entries and the Graphene ledger is the resource port, so the shortfall is
          // read rather than assumed; only an unreadable one still rejects the candidate.
          const shortfalls = readCapturedRetirementShortfalls(
            root,
            resources,
            RETIREMENT_PREP,
          );
          if (shortfalls === undefined) {
            return conflictUnavailable(
              "retirement-preparation",
              "tauceti-fusion_generator",
            );
          }
          retirementAssist = true;
          retirementMissing = Object.freeze(
            shortfalls.map((shortfall) =>
              shortfall.kind === "building"
                ? shortfall.name
                : shortfall.resource,
            ),
          );
        }
      }

      let secondEvolution = false;
      let species = ABSENT_RACE_NAME;
      let gods = ABSENT_RACE_NAME;
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
        species = raceName(readProperty(race, "species"));
        gods = raceName(readProperty(race, "gods"));
        if (!secondEvolution) {
          const guardStarLevel = readCapturedAscensionLevel(root);
          if (guardStarLevel === undefined) {
            return conflictUnavailable("invalid-game-state", "race");
          }
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
        // Sampled by the theology branch alone; every other candidate leaves them absent, which is
        // what the one rule that reads them would conclude from them anyway.
        race: Object.freeze({ species, gods }),
        guards: Object.freeze({
          bananaRepublic,
          cultOfPersonality,
          pacifist,
          secondEvolution,
          retirementAssist,
          retirementMissing,
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
