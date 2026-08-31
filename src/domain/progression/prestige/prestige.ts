/**
 * Pure planner for the prestige automation slice. Given one immutable snapshot
 * of the selected prestige type, its eligibility, and the branch-specific act
 * facts, it produces the exact command sequence the legacy `autoPrestige`
 * factory performed. The one-tick reset delay legacy encoded through
 * `state.goal` is reproduced here: an eligible branch first commits the "Reset"
 * goal and only acts on the following cycle (when the sampled goal is already
 * "Reset").
 */

export type PrestigeGoal = "Reset" | "GameOverMan";

export type PrestigeCommand =
  | { readonly kind: "set-goal"; readonly goal: PrestigeGoal }
  | { readonly kind: "log-prestige" }
  | { readonly kind: "arm-mad" }
  | { readonly kind: "launch-mad" }
  | { readonly kind: "click-building"; readonly id: string }
  | { readonly kind: "cache-building-options"; readonly id: string }
  | { readonly kind: "click-tech"; readonly id: string }
  | { readonly kind: "reset-modifier-keys" }
  | { readonly kind: "absorption-chamber-action" }
  | { readonly kind: "load-queued-settings" }
  | { readonly kind: "mark-whitehole-reset-started" };

/**
 * Discriminated snapshot of the selected prestige branch. `noop` covers the
 * `none`/`vacuum`/`retire`/`eden` types (and any unknown type) that legacy
 * returned from without acting.
 */
export type PrestigeBranch =
  | { readonly type: "noop" }
  | {
      readonly type: "mad";
      readonly eligible: boolean;
      readonly armed: boolean;
      readonly waitForPopulation: boolean;
      readonly currentSoldiers: number;
      readonly maxSoldiers: number;
      readonly currentPopulation: number;
      readonly maxPopulation: number;
      readonly requiredPopulation: number;
    }
  | {
      readonly type: "bioseed";
      readonly eligible: boolean;
      readonly launchUnlocked: boolean;
      readonly prepUnlocked: boolean;
    }
  | {
      readonly type: "cataclysm";
      readonly eligible: boolean;
      readonly loadQueuedSettings: boolean;
      readonly dialClickable: boolean;
    }
  | {
      readonly type: "whitehole";
      readonly eligible: boolean;
      readonly exoticInfusionReady: boolean;
      /** Sampled `game.global.tech.whitehole`; 0 while the grant is absent. */
      readonly whiteholeLevel: number;
      /** `tech-infusion_confirm` is offered and affordable right now. */
      readonly confirmReady: boolean;
    }
  | { readonly type: "apocalypse"; readonly eligible: boolean }
  | {
      readonly type: "ascension";
      readonly witchHunter: boolean;
      readonly eligible: boolean;
    }
  | {
      readonly type: "demonic";
      readonly witchHunter: boolean;
      readonly fasting: boolean;
      readonly eligible: boolean;
    }
  | {
      readonly type: "building-reset";
      readonly building: string;
      readonly unlocked: boolean;
    };

export interface PrestigeInput {
  /** Sampled `state.goal`; only its equality with "Reset" is significant. */
  readonly goal: string;
  readonly branch: PrestigeBranch;
}

/** `tech.whitehole` once `tech-infusion_confirm` has committed the reset. */
export const WHITEHOLE_RESET_LEVEL = 4;

/** The witch-hunter ascension/demonic act is identical for both types. */
const WITCH_ASCENSION_ACT: readonly PrestigeCommand[] = [
  { kind: "reset-modifier-keys" },
  { kind: "log-prestige" },
  { kind: "absorption-chamber-action" },
  { kind: "set-goal", goal: "GameOverMan" },
];

/**
 * Legacy `tryReset`: nothing while ineligible; commit the reset goal for one
 * cycle; then run the branch act once the goal is already "Reset".
 */
function tryReset(
  goal: string,
  check: boolean,
  act: readonly PrestigeCommand[],
): readonly PrestigeCommand[] {
  if (!check) {
    return [];
  }
  if (goal !== "Reset") {
    return [{ kind: "set-goal", goal: "Reset" }];
  }
  return act;
}

export function planPrestige(input: PrestigeInput): readonly PrestigeCommand[] {
  const { goal, branch } = input;
  switch (branch.type) {
    case "noop":
      return [];

    case "mad": {
      const act: PrestigeCommand[] = [];
      if (branch.armed) {
        act.push({ kind: "arm-mad" });
      }
      if (
        !branch.waitForPopulation ||
        (branch.currentSoldiers >= branch.maxSoldiers &&
          branch.currentPopulation >= branch.maxPopulation &&
          branch.currentSoldiers + branch.currentPopulation >=
            branch.requiredPopulation)
      ) {
        act.push(
          { kind: "set-goal", goal: "GameOverMan" },
          { kind: "log-prestige" },
          { kind: "launch-mad" },
        );
      }
      return tryReset(goal, branch.eligible, act);
    }

    case "bioseed": {
      const act: readonly PrestigeCommand[] = branch.launchUnlocked
        ? [{ kind: "click-building", id: "GasSpaceDockLaunch" }]
        : branch.prepUnlocked
          ? [{ kind: "click-building", id: "GasSpaceDockPrepForLaunch" }]
          : [{ kind: "cache-building-options", id: "GasSpaceDock" }];
      return tryReset(goal, branch.eligible, act);
    }

    case "cataclysm": {
      const act: PrestigeCommand[] = [];
      if (branch.loadQueuedSettings) {
        act.push({ kind: "load-queued-settings" });
      }
      if (branch.dialClickable) {
        act.push(
          { kind: "log-prestige" },
          { kind: "click-tech", id: "tech-dial_it_to_11" },
        );
      }
      return tryReset(goal, branch.eligible, act);
    }

    case "whitehole": {
      // `tech-infusion_confirm` is the only thing that raises whitehole to
      // WHITEHOLE_RESET_LEVEL, and it does so from an action that deliberately
      // reports failure: the game keeps the entry mounted and resets the page
      // from a four-second animation timer instead. The entry therefore stays
      // offered and affordable after a successful buy, so an unguarded branch
      // buys it again on the next cycle and pays its Knowledge and Soul Gems
      // for nothing. Stop as soon as the grant lands.
      //
      // A page reload inside that animation window leaves the grant applied
      // with no reset. Every infusion entry is then already granted, so none is
      // offered and whitehole eligibility goes false for the rest of the run.
      // Nothing here can undo that: the exposed `game.global` is a copy the
      // game rebuilds each loop, so the script can only recover through the
      // game's own controls. The research slice takes it from here by allowing
      // `tech-stabilize_blackhole`, which clears the grant and lets the
      // blackhole rebuild into a fresh infusion chain.
      if (branch.whiteholeLevel >= WHITEHOLE_RESET_LEVEL) {
        return [];
      }
      const act: PrestigeCommand[] = [];
      if (branch.exoticInfusionReady) {
        act.push({ kind: "log-prestige" });
      }
      for (const id of [
        "tech-infusion_confirm",
        "tech-infusion_check",
        "tech-exotic_infusion",
      ]) {
        act.push({ kind: "click-tech", id });
      }
      if (branch.confirmReady) {
        act.push({ kind: "mark-whitehole-reset-started" });
      }
      return tryReset(goal, branch.eligible, act);
    }

    case "apocalypse":
      return tryReset(goal, branch.eligible, [
        { kind: "log-prestige" },
        { kind: "click-tech", id: "tech-protocol66" },
        { kind: "click-tech", id: "tech-protocol66a" },
      ]);

    case "ascension":
      return branch.witchHunter
        ? tryReset(goal, branch.eligible, WITCH_ASCENSION_ACT)
        : tryReset(goal, branch.eligible, [
            { kind: "reset-modifier-keys" },
            { kind: "click-building", id: "SiriusAscend" },
          ]);

    case "demonic":
      return branch.witchHunter
        ? tryReset(goal, branch.eligible, WITCH_ASCENSION_ACT)
        : tryReset(goal, branch.eligible, [
            { kind: "log-prestige" },
            {
              kind: "click-tech",
              id: branch.fasting
                ? "tech-final_ingredient"
                : "tech-demonic_infusion",
            },
          ]);

    case "building-reset":
      return tryReset(goal, branch.unlocked, [
        { kind: "reset-modifier-keys" },
        { kind: "click-building", id: branch.building },
      ]);
  }
}
