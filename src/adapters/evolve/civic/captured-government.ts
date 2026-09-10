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

function readGovernmentInput(
  root: unknown,
  settingsValue: unknown,
): Readonly<GovernmentInput> {
  const settings = isRecord(settingsValue) ? settingsValue : {};
  const technology = finiteGovernor(
    readProperty(readProperty(root, "tech"), "governor"),
  );
  const governorTarget = settings["govGovernor"];
  const input: GovernmentInput = {
    isEnabled: settings["autoGovernment"] === true,
    guardAnarchist: false,
    haveQFactory: false,
    haveGovernorTech: technology !== undefined && technology >= 1,
    currentGovernor: readCurrentGovernor(root),
    govSpace: "none",
    govFinal: "none",
    govInterim: "none",
    govGovernor: typeof governorTarget === "string" ? governorTarget : "none",
    govSpaceUnlocked: false,
    govFinalUnlocked: false,
    govInterimUnlocked: false,
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
        return stale(
          "government-selection-unavailable",
          "captured government type selection is not available",
        );
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
