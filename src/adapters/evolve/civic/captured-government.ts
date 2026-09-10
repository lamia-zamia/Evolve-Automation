/**
 * Captured governor appointment for the independent runtime.
 *
 * DeadSpace owns the candidate list and current appointment in `race.governor`; the only effect
 * this slice needs is the mounted candidates component's `appoint(index)` method. Government-type
 * selection stays out of this adapter until its unlock contract is captured from the game rather
 * than inferred from the compatibility GovernmentManager.
 */

import {
  planGovernment,
  type GovernmentDecision,
  type GovernmentInput,
} from "../../../domain/civic/government.ts";
import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import type { DecisionExecutor } from "../../../ports/decision-executor.ts";
import type { GovernmentReader } from "../../../ports/government.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { stale, SUCCEEDED } from "../../command-outcomes.ts";
import { isRecord, readProperty } from "../../validation.ts";

const CANDIDATES_CONTROL = "candidates";
const GOVERNMENT_CONTROL = "govType";
const GOVERNMENT_MODAL_CONTROL = "govModal";

export interface CapturedGovernmentAutomation {
  readonly reader: GovernmentReader;
  readonly executor: DecisionExecutor<GovernmentDecision>;
}

interface AppointmentSession {
  readonly root: unknown;
  readonly candidateBackgrounds: readonly string[];
}

function finiteGovernor(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readCandidateBackgrounds(root: unknown): readonly string[] {
  const candidates = readProperty(
    readProperty(readProperty(root, "race"), "governor"),
    "candidates",
  );
  if (!Array.isArray(candidates)) return Object.freeze([]);
  return Object.freeze(
    candidates.map((candidate) => {
      const background = readProperty(candidate, "bg");
      return typeof background === "string" ? background : "";
    }),
  );
}

function readCurrentGovernor(root: unknown): string {
  const background = readProperty(
    readProperty(readProperty(readProperty(root, "race"), "governor"), "g"),
    "bg",
  );
  return typeof background === "string" ? background : "none";
}

function readCurrentGovernment(root: unknown): string {
  const government = readProperty(
    readProperty(readProperty(root, "civic"), "govern"),
    "type",
  );
  return typeof government === "string" ? government : "none";
}

function governmentUnlocked(root: unknown, government: string): boolean {
  const tech = readProperty(root, "tech");
  const race = readProperty(root, "race");
  const govern = finiteGovernor(readProperty(tech, "govern"));
  if (government === "dictator") {
    return (
      readProperty(race, "wish") === true &&
      isRecord(readProperty(race, "wishStats")) &&
      readProperty(readProperty(race, "wishStats"), "gov") === true
    );
  }
  if (government === "magocracy") {
    return (
      readProperty(tech, "gov_mage") === true ||
      (finiteGovernor(readProperty(tech, "gov_mage")) ?? 0) > 0
    );
  }
  if (readProperty(race, "warlord") === true || govern === undefined) {
    return false;
  }
  switch (government) {
    case "autocracy":
    case "democracy":
    case "oligarchy":
      return govern >= 1;
    case "theocracy":
      return Boolean(readProperty(tech, "gov_theo"));
    case "republic":
      return govern >= 2;
    case "socialist":
      return Boolean(readProperty(tech, "gov_soc"));
    case "corpocracy":
      return Boolean(readProperty(tech, "gov_corp"));
    case "technocracy":
      return govern >= 3;
    case "federation":
      return Boolean(readProperty(tech, "gov_fed"));
    default:
      return false;
  }
}

function readGovernmentInput(
  root: unknown,
  settingsValue: unknown,
): Readonly<GovernmentInput> {
  const settings = isRecord(settingsValue) ? settingsValue : {};
  const technology = finiteGovernor(
    readProperty(readProperty(root, "tech"), "governor"),
  );
  const currentGovernment = readCurrentGovernment(root);
  const prestigeType = settings["prestigeType"];
  const guardAnarchist =
    settings["achievementGuards"] !== false &&
    settings["guardAnarchist"] !== false &&
    prestigeType === "mad" &&
    currentGovernment === "anarchy";
  const configured = (key: string): string =>
    typeof settings[key] === "string" ? (settings[key] as string) : "none";
  const govSpace = configured("govSpace");
  const govFinal = configured("govFinal");
  const govInterim = configured("govInterim");
  const governorTarget = settings["govGovernor"];
  const input: GovernmentInput = {
    isEnabled: settings["autoGovernment"] === true,
    guardAnarchist,
    haveQFactory:
      (finiteGovernor(readProperty(readProperty(root, "tech"), "q_factory")) ??
        0) > 0,
    haveGovernorTech: technology !== undefined && technology >= 1,
    currentGovernor: readCurrentGovernor(root),
    govSpace,
    govFinal,
    govInterim,
    govGovernor: typeof governorTarget === "string" ? governorTarget : "none",
    govSpaceUnlocked: govSpace !== "none" && governmentUnlocked(root, govSpace),
    govFinalUnlocked: govFinal !== "none" && governmentUnlocked(root, govFinal),
    govInterimUnlocked:
      govInterim !== "none" && governmentUnlocked(root, govInterim),
    tradeFederationReady: false,
    candidateBackgrounds: readCandidateBackgrounds(root),
  };
  return Object.freeze(input);
}

export function createCapturedGovernmentAutomation(dependencies: {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
}): CapturedGovernmentAutomation {
  let session: AppointmentSession | null = null;

  const reader: GovernmentReader = Object.freeze({
    read(): Readonly<GovernmentInput> {
      const root = dependencies.rootState.readRoot();
      session =
        root === undefined
          ? null
          : Object.freeze({
              root,
              candidateBackgrounds: readCandidateBackgrounds(root),
            });
      return root === undefined
        ? Object.freeze({
            isEnabled: false,
            guardAnarchist: false,
            haveQFactory: false,
            haveGovernorTech: false,
            currentGovernor: "none",
            govSpace: "none",
            govFinal: "none",
            govInterim: "none",
            govGovernor: "none",
            govSpaceUnlocked: false,
            govFinalUnlocked: false,
            govInterimUnlocked: false,
            tradeFederationReady: false,
            candidateBackgrounds: Object.freeze([]),
          })
        : readGovernmentInput(root, dependencies.readSettings());
    },
  });

  const executor: DecisionExecutor<GovernmentDecision> = Object.freeze({
    execute(decision: Readonly<GovernmentDecision>): CommandExecutionOutcome {
      if (decision.government !== null) {
        const active = session;
        if (active === null) {
          return stale(
            "government-session-missing",
            "government state was not sampled",
          );
        }
        const root = dependencies.rootState.readRoot();
        if (root !== active.root) {
          return stale(
            "government-root-changed",
            "game root changed after sampling",
          );
        }
        if (readCurrentGovernment(root) === decision.government) {
          // The compatibility manager treats this as a successful no-op.
        } else {
          const revision = finiteGovernor(
            readProperty(
              readProperty(readProperty(root, "civic"), "govern"),
              "rev",
            ),
          );
          if (revision === undefined || revision > 0) {
            return stale(
              "government-revolution-pending",
              "government cannot change while its revolution is pending",
            );
          }
          if (!governmentUnlocked(root, decision.government)) {
            return stale(
              "government-locked",
              "planned government became locked",
              { government: decision.government },
            );
          }
          const modal = dependencies.controls.resolve(GOVERNMENT_MODAL_CONTROL);
          if (modal !== undefined) {
            const result = dependencies.controls.invoke(modal, "setGov", [
              decision.government,
            ]);
            if (!result.ok) {
              return stale(
                "government-controls-unavailable",
                `government modal control failed: ${result.reason}`,
              );
            }
          } else {
            const control = dependencies.controls.resolve(GOVERNMENT_CONTROL);
            if (control === undefined) {
              return stale(
                "government-controls-unavailable",
                "government selection controls are not captured",
              );
            }
            const result = dependencies.controls.invoke(control, "trigModal");
            if (!result.ok) {
              return stale(
                "government-controls-unavailable",
                `government modal opener failed: ${result.reason}`,
              );
            }
            // The modal component is mounted asynchronously; the next cycle will commit it.
            return SUCCEEDED;
          }
        }
      }
      if (decision.appointCandidate === null) return SUCCEEDED;
      const active = session;
      if (active === null) {
        return stale(
          "governor-session-missing",
          "governor state was not sampled",
        );
      }
      const root = dependencies.rootState.readRoot();
      if (root !== active.root) {
        return stale(
          "governor-root-changed",
          "game root changed after sampling",
        );
      }
      if (readCurrentGovernor(root) !== "none") {
        return stale("governor-appointed", "a governor was already appointed");
      }
      const backgrounds = readCandidateBackgrounds(root);
      if (
        backgrounds[decision.appointCandidate] !==
        decision.appointCandidateBackground
      ) {
        return stale(
          "stale-governor-candidate",
          "governor candidates changed",
          { candidateIndex: decision.appointCandidate },
        );
      }
      const handle = dependencies.controls.resolve(CANDIDATES_CONTROL);
      if (handle === undefined) {
        return stale(
          "governor-controls-unavailable",
          "governor appointment controls are not captured",
        );
      }
      const result = dependencies.controls.invoke(handle, "appoint", [
        decision.appointCandidate,
      ]);
      return result.ok
        ? SUCCEEDED
        : stale(
            "governor-controls-unavailable",
            `governor appointment control failed: ${result.reason}`,
          );
    },
  });

  return Object.freeze({ reader, executor });
}

export function runCapturedGovernmentAutomation(
  automation: CapturedGovernmentAutomation,
): CommandExecutionOutcome {
  return automation.executor.execute(planGovernment(automation.reader.read()));
}
