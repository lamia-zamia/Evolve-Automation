import type { GovernmentDecision } from "../../../domain/civic/government.ts";
import type { DecisionExecutor } from "../../../ports/decision-executor.ts";
import type { GovernmentControls } from "../../../ports/government-controls.ts";
import type { GovernmentReader } from "../../../ports/government.ts";
import { stale, SUCCEEDED } from "../../command-outcomes.ts";
import {
  requireFunction,
  requireRecord,
  requireString,
  type UnknownRecord,
} from "../../validation.ts";

export interface GovernmentReaderDependencies {
  readonly getGovernmentManager: () => unknown;
  readonly getSettings: () => unknown;
  readonly getGame: () => unknown;
  readonly guardActive: (setting: string) => boolean;
  readonly haveTech: (tech: string) => boolean;
  readonly getGovernor: () => string;
  readonly isTradeFederationAchievementUnlocked: () => boolean;
}

function readTradeRouteCount(game: UnknownRecord, path: string): number | null {
  const global = game["global"];
  if (typeof global !== "object" || global === null) return null;
  const root = global as UnknownRecord;
  const pathParts = path.split(".");
  let value: unknown = root;
  for (const part of pathParts.slice(1)) {
    if (typeof value !== "object" || value === null) return null;
    value = (value as UnknownRecord)[part];
  }
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasTradeFederationRoutes(game: UnknownRecord): boolean {
  // These counters are absent before their game systems initialize; absent is
  // the legacy-equivalent "not ready" state for an achievement target.
  const cityRoutes = readTradeRouteCount(game, "global.city.market.trade");
  const galaxyRoutes = readTradeRouteCount(game, "global.galaxy.trade.cur");
  return cityRoutes !== null && galaxyRoutes !== null
    ? cityRoutes >= 750 && galaxyRoutes >= 50
    : false;
}

/** `GovernmentManager.Types[type].isUnlocked()`, sampled only for a configured type. */
function governmentUnlocked(
  types: unknown,
  type: string,
  path: string,
): boolean {
  if (type === "none") {
    return false;
  }
  const typesRecord = requireRecord(types, `${path}.Types`);
  const entry = requireRecord(typesRecord[type], `${path}.Types.${type}`);
  const isUnlocked = requireFunction(
    entry["isUnlocked"],
    `${path}.Types.${type}.isUnlocked`,
  );
  return Boolean(Reflect.apply(isUnlocked, entry, []));
}

function readCandidateBackgrounds(
  game: Record<PropertyKey, unknown>,
): string[] {
  const global = requireRecord(game["global"], "game.global");
  const race = requireRecord(global["race"], "game.global.race");
  const governor = race["governor"];
  if (typeof governor !== "object" || governor === null) {
    return [];
  }
  const candidates = (governor as Record<PropertyKey, unknown>)["candidates"];
  if (!Array.isArray(candidates)) {
    return [];
  }
  return candidates.map((candidate, index) => {
    const record = requireRecord(
      candidate,
      `game.global.race.governor.candidates[${index}]`,
    );
    const bg = record["bg"];
    return typeof bg === "string" ? bg : "";
  });
}

export function readGovernmentInput(
  dependencies: GovernmentReaderDependencies,
): ReturnType<GovernmentReader["read"]> {
  const manager = requireRecord(
    dependencies.getGovernmentManager(),
    "GovernmentManager",
  );
  const settings = requireRecord(dependencies.getSettings(), "settings");
  const game = requireRecord(dependencies.getGame(), "game");

  const isEnabled = requireFunction(
    manager["isEnabled"],
    "GovernmentManager.isEnabled",
  );

  const govSpace = requireString(settings["govSpace"], "settings.govSpace");
  const govFinal = requireString(settings["govFinal"], "settings.govFinal");
  const govInterim = requireString(
    settings["govInterim"],
    "settings.govInterim",
  );
  const govGovernor = requireString(
    settings["govGovernor"],
    "settings.govGovernor",
  );

  const enabled = Boolean(Reflect.apply(isEnabled, manager, []));
  let guardAnarchist = false;
  let tradeFederationReady = false;
  let haveQFactory = false;
  let govSpaceUnlocked = false;
  let govFinalUnlocked = false;
  let govInterimUnlocked = false;

  if (enabled) {
    guardAnarchist = dependencies.guardActive("guardAnarchist");
    if (!guardAnarchist) {
      const tradeFederationEnabled =
        settings["achievementGuards"] !== false &&
        settings["guardTradeFederation"] !== false;
      if (
        tradeFederationEnabled &&
        !dependencies.isTradeFederationAchievementUnlocked() &&
        hasTradeFederationRoutes(game)
      ) {
        tradeFederationReady = governmentUnlocked(
          manager["Types"],
          "federation",
          "GovernmentManager",
        );
      }
      if (govSpace !== "none") {
        haveQFactory = dependencies.haveTech("q_factory");
        if (haveQFactory) {
          govSpaceUnlocked = governmentUnlocked(
            manager["Types"],
            govSpace,
            "GovernmentManager",
          );
        }
      }
      if (!govSpaceUnlocked && govFinal !== "none") {
        govFinalUnlocked = governmentUnlocked(
          manager["Types"],
          govFinal,
          "GovernmentManager",
        );
      }
      if (!govSpaceUnlocked && !govFinalUnlocked && govInterim !== "none") {
        govInterimUnlocked = governmentUnlocked(
          manager["Types"],
          govInterim,
          "GovernmentManager",
        );
      }
    }
  }

  let haveGovernorTech = false;
  let currentGovernor = "none";
  let candidateBackgrounds: readonly string[] = Object.freeze([]);
  if (dependencies.haveTech("governor")) {
    haveGovernorTech = true;
    if (govGovernor !== "none") {
      currentGovernor = dependencies.getGovernor();
      if (currentGovernor === "none") {
        candidateBackgrounds = Object.freeze(readCandidateBackgrounds(game));
      }
    }
  }

  return Object.freeze({
    isEnabled: enabled,
    guardAnarchist,
    haveQFactory,
    haveGovernorTech,
    currentGovernor,
    govSpace,
    govFinal,
    govInterim,
    govGovernor,
    govSpaceUnlocked,
    govFinalUnlocked,
    govInterimUnlocked,
    tradeFederationReady,
    candidateBackgrounds,
  });
}

export function createGovernmentCommandExecutor(dependencies: {
  readonly getGovernmentManager: () => unknown;
  readonly getGame: () => unknown;
  readonly getGovernor: () => string;
  readonly controls: GovernmentControls;
}): DecisionExecutor<GovernmentDecision> {
  function execute(decision: Readonly<GovernmentDecision>) {
    if (decision.government === null && decision.appointCandidate === null) {
      return SUCCEEDED;
    }
    const manager = requireRecord(
      dependencies.getGovernmentManager(),
      "GovernmentManager",
    );
    let setGovernment: ((government: string) => unknown) | undefined;
    if (decision.government !== null) {
      const isEnabled = requireFunction(
        manager["isEnabled"],
        "GovernmentManager.isEnabled",
      );
      if (!Reflect.apply(isEnabled, manager, [])) {
        return stale(
          "government-disabled",
          "government automation became unavailable",
        );
      }
      if (
        !governmentUnlocked(
          manager["Types"],
          decision.government,
          "GovernmentManager",
        )
      ) {
        return stale("government-locked", "planned government became locked", {
          government: decision.government,
        });
      }
      setGovernment = requireFunction(
        manager["setGovernment"],
        "GovernmentManager.setGovernment",
      ) as (government: string) => unknown;
    }

    if (decision.appointCandidate !== null) {
      if (dependencies.getGovernor() !== "none") {
        return stale("governor-appointed", "a governor was already appointed");
      }
      const backgrounds = readCandidateBackgrounds(
        requireRecord(dependencies.getGame(), "game"),
      );
      if (
        backgrounds[decision.appointCandidate] !==
        decision.appointCandidateBackground
      ) {
        return stale(
          "stale-governor-candidate",
          "governor candidates changed",
          {
            candidateIndex: decision.appointCandidate,
          },
        );
      }
      if (!dependencies.controls.isCandidateAppointmentAvailable()) {
        return stale(
          "governor-controls-unavailable",
          "governor appointment controls became unavailable",
        );
      }
    }

    if (decision.government !== null && setGovernment !== undefined) {
      Reflect.apply(setGovernment, manager, [decision.government]);
    }
    if (
      decision.appointCandidate !== null &&
      !dependencies.controls.appointCandidate(decision.appointCandidate)
    ) {
      return stale(
        "governor-controls-unavailable",
        "governor appointment controls became unavailable",
      );
    }
    return SUCCEEDED;
  }

  return Object.freeze({ execute });
}
