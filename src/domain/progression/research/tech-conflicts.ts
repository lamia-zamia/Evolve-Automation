export interface TechConflictInput {
  readonly itemId: string;
  readonly soulGemCost: number | null;
  readonly settings: {
    readonly ignoredResearch: readonly string[];
    readonly prestigeType: string;
    readonly saveWhiteholeSoulGems: boolean;
    readonly vaccinationStrategy: string;
    readonly useDemonicBomb: boolean;
    readonly allowForeignUnification: boolean;
    readonly stabilizeBlackhole: boolean;
    readonly stabilizationCooldownSeconds: number;
    readonly theologyChoiceOne: string;
    readonly theologyChoiceTwo: string;
    readonly alienGiftKnowledge: number;
  };
  readonly resources: {
    readonly soulGems: number;
    readonly maximumKnowledge: number;
  };
  readonly stabilization: {
    readonly lastAtMs: number | null;
    readonly nowMs: number;
  };
  readonly race: {
    readonly species: string;
    readonly gods: string;
    readonly achievementLevel: number;
  };
  readonly guards: {
    readonly bananaRepublic: boolean;
    readonly cultOfPersonality: boolean;
    readonly pacifist: boolean;
    readonly secondEvolution: boolean;
    readonly retirementAssist: boolean;
    readonly retirementMissing: readonly string[];
  };
  readonly fanaticismAchievements: readonly {
    readonly race: string;
    readonly god: string;
    readonly unlocked: boolean;
  }[];
}

export type TechConflict =
  | { readonly code: "ignored-research" }
  | { readonly code: "reset-research" }
  | { readonly code: "saving-soul-gems" }
  | { readonly code: "retirement-fork" }
  | {
      readonly code: "retirement-preparation";
      readonly missing: readonly string[];
    }
  | { readonly code: "witch-demonic-fork" }
  | { readonly code: "matrix-fork" }
  | { readonly code: "apotheosis-fork" }
  | { readonly code: "vaccination-strategy" }
  | { readonly code: "dark-bomb-disabled" }
  | { readonly code: "prestige-unneeded" }
  | { readonly code: "maximum-knowledge"; readonly required: number }
  | { readonly code: "banana-republic-guard" }
  | { readonly code: "cult-of-personality-guard" }
  | { readonly code: "unification-disabled" }
  | { readonly code: "stabilization-disabled" }
  | { readonly code: "stabilization-during-whitehole" }
  | { readonly code: "stabilization-cooldown"; readonly seconds: number }
  | { readonly code: "second-evolution-guard" }
  | { readonly code: "theology-path" };

const RESET_RESEARCH = new Set([
  "tech-exotic_infusion",
  "tech-infusion_check",
  "tech-infusion_confirm",
  "tech-dial_it_to_11",
  "tech-limit_collider",
  "tech-demonic_infusion",
  "tech-protocol66",
  "tech-protocol66a",
  "tech-final_ingredient",
]);

const LONG_RUN_PRESTIGE = new Set([
  "ascension",
  "demonic",
  "apotheosis",
  "apocalypse",
  "terraform",
  "matrix",
  "retire",
  "eden",
]);

function conflict<T extends TechConflict>(value: T): Readonly<T> {
  return Object.freeze(value);
}

/** Applies research exclusions to one immutable, time-stamped decision input. */
export function findTechConflict(
  input: Readonly<TechConflictInput>,
): Readonly<TechConflict> | null {
  const { itemId, settings } = input;

  if (settings.ignoredResearch.includes(itemId)) {
    return conflict({ code: "ignored-research" });
  }
  if (RESET_RESEARCH.has(itemId)) {
    return conflict({ code: "reset-research" });
  }
  if (
    settings.prestigeType === "whitehole" &&
    settings.saveWhiteholeSoulGems &&
    itemId !== "tech-virtual_reality" &&
    input.soulGemCost !== null &&
    input.soulGemCost > input.resources.soulGems - 10
  ) {
    return conflict({ code: "saving-soul-gems" });
  }

  if (itemId === "tech-isolation_protocol") {
    if (settings.prestigeType !== "retire") {
      return conflict({ code: "retirement-fork" });
    }
    if (
      input.guards.retirementAssist &&
      input.guards.retirementMissing.length > 0
    ) {
      return conflict({
        code: "retirement-preparation",
        missing: Object.freeze([...input.guards.retirementMissing]),
      });
    }
  }

  if (
    itemId === "tech-outerplane_summon" &&
    settings.prestigeType !== "demonic"
  ) {
    return conflict({ code: "witch-demonic-fork" });
  }
  if (itemId === "tech-focus_cure" && settings.prestigeType !== "matrix") {
    return conflict({ code: "matrix-fork" });
  }
  if (
    itemId === "tech-purify_essence" &&
    settings.prestigeType !== "apotheosis"
  ) {
    return conflict({ code: "apotheosis-fork" });
  }
  if (
    /^tech-vax_strat[1-4]$/.test(itemId) &&
    !itemId.includes(settings.vaccinationStrategy)
  ) {
    return conflict({ code: "vaccination-strategy" });
  }
  if (
    itemId === "tech-dark_bomb" &&
    (!settings.useDemonicBomb || settings.prestigeType !== "demonic")
  ) {
    return conflict({ code: "dark-bomb-disabled" });
  }
  if (
    (itemId === "tech-incorporeal" || itemId === "tech-tech_ascension") &&
    settings.prestigeType !== "ascension" &&
    settings.prestigeType !== "apotheosis"
  ) {
    return conflict({ code: "prestige-unneeded" });
  }
  if (
    itemId === "tech-xeno_gift" &&
    input.resources.maximumKnowledge < settings.alienGiftKnowledge
  ) {
    return conflict({
      code: "maximum-knowledge",
      required: settings.alienGiftKnowledge,
    });
  }

  if (itemId === "tech-unification2" || itemId === "tech-unite") {
    if (input.guards.bananaRepublic) {
      return conflict({ code: "banana-republic-guard" });
    }
    if (input.guards.cultOfPersonality) {
      return conflict({ code: "cult-of-personality-guard" });
    }
    if (!settings.allowForeignUnification && !input.guards.pacifist) {
      return conflict({ code: "unification-disabled" });
    }
  }

  if (itemId === "tech-stabilize_blackhole") {
    if (!settings.stabilizeBlackhole) {
      return conflict({ code: "stabilization-disabled" });
    }
    if (settings.prestigeType === "whitehole") {
      return conflict({ code: "stabilization-during-whitehole" });
    }
    if (
      settings.stabilizationCooldownSeconds > 0 &&
      input.stabilization.lastAtMs !== null
    ) {
      const elapsedSeconds =
        (input.stabilization.nowMs - input.stabilization.lastAtMs) / 1000;
      if (elapsedSeconds < settings.stabilizationCooldownSeconds) {
        return conflict({
          code: "stabilization-cooldown",
          seconds: Math.ceil(
            settings.stabilizationCooldownSeconds - elapsedSeconds,
          ),
        });
      }
    }
  }

  if (itemId === "tech-anthropology" || itemId === "tech-fanaticism") {
    if (input.guards.secondEvolution) {
      if (itemId === "tech-anthropology") {
        return conflict({ code: "second-evolution-guard" });
      }
    } else if (itemId !== settings.theologyChoiceOne) {
      const isFanaticismRace = input.fanaticismAchievements.some(
        (combination) =>
          input.race.species === combination.race &&
          input.race.gods === combination.god &&
          !combination.unlocked,
      );
      if (
        itemId === "tech-anthropology" &&
        !(
          settings.theologyChoiceOne === "auto" &&
          settings.prestigeType === "mad" &&
          !isFanaticismRace
        )
      ) {
        return conflict({ code: "theology-path" });
      }
      if (
        itemId === "tech-fanaticism" &&
        !(
          settings.theologyChoiceOne === "auto" &&
          (settings.prestigeType !== "mad" || isFanaticismRace)
        )
      ) {
        return conflict({ code: "theology-path" });
      }
    }
  }

  if (
    itemId !== settings.theologyChoiceTwo &&
    (itemId === "tech-deify" || itemId === "tech-study")
  ) {
    const longRun = LONG_RUN_PRESTIGE.has(settings.prestigeType);
    if (
      itemId === "tech-deify" &&
      !(settings.theologyChoiceTwo === "auto" && longRun)
    ) {
      return conflict({ code: "theology-path" });
    }
    if (
      itemId === "tech-study" &&
      !(settings.theologyChoiceTwo === "auto" && !longRun)
    ) {
      return conflict({ code: "theology-path" });
    }
  }

  return null;
}
