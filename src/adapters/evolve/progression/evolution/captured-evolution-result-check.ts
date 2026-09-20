import { decideEvolutionResult } from "../../../../domain/progression/evolution/evolution-result.ts";
import type { EvolutionReader } from "../../../../ports/evolution.ts";
import type { GameActivitySink } from "../../../../ports/game-message-log.ts";

export interface CapturedSoftResetControl {
  /** Invokes the game's rendered soft-reset button once when it is actionable. */
  issueSoftReset(): boolean;
}

export interface CapturedEvolutionResultCheckDependencies {
  readonly reader: Pick<EvolutionReader, "sampleEvolutionResult">;
  readonly softReset: CapturedSoftResetControl;
  readonly restoreEvolutionAfterResult: () => void;
  readonly onActivity?: GameActivitySink;
}

export type CapturedEvolutionResultCheckOutcome =
  | { readonly status: "idle" | "checked"; readonly stopCycle: false }
  | {
      readonly status: "reset-issued" | "reset-unavailable" | "unavailable";
      readonly stopCycle: true;
    };

type ResultLifecycleState = "watching" | "pending" | "reset-issued";

function eventMessage(
  event: ReturnType<typeof decideEvolutionResult>["logs"][number],
): { readonly message: string; readonly color: string } {
  switch (event.code) {
    case "backup-no-achievements":
      return {
        message: `Evolution backup rejected ${event.raceName}: no Auto Achievement progress.`,
        color: "danger",
      };
    case "backup-no-race":
      return {
        message: `Evolution backup found no higher-weighted race than ${event.raceName}.`,
        color: "warning",
      };
    case "wrong-race":
      return {
        message: "Evolution backup rejected the wrong race.",
        color: "danger",
      };
    case "gained-trait":
      return {
        message: `Evolution backup rejected gained trait ${event.traitName}.`,
        color: "danger",
      };
    case "auto-goals":
      return {
        message: `Auto Evolution goals: ${event.goals.join(", ")}.`,
        color: "info",
      };
    case "auto-goals-none":
      return {
        message: "Auto Evolution completed with no remaining goals.",
        color: "info",
      };
  }
}

/**
 * Watches the explicit protoplasm → evolved-species transition and consumes one result exactly
 * once. A failed reset control leaves the lifecycle in `watching`, so a stale species cannot cause
 * an unbounded click loop; the next genuine evolution transition is the only retry opportunity.
 */
export function createCapturedEvolutionResultCheck({
  reader,
  softReset,
  restoreEvolutionAfterResult,
  onActivity = () => {},
}: CapturedEvolutionResultCheckDependencies) {
  let state: ResultLifecycleState = "watching";
  let previousSpecies: string | undefined;

  const report = (
    event: ReturnType<typeof decideEvolutionResult>["logs"][number],
  ) => {
    const formatted = eventMessage(event);
    onActivity({
      message: formatted.message,
      color: formatted.color,
      tags: Object.freeze(["progress", "achievements"]),
    });
  };

  return Object.freeze({
    observeSpecies(species: string): void {
      if (state === "reset-issued") {
        if (species === "protoplasm") state = "watching";
        previousSpecies = species;
        return;
      }
      if (previousSpecies === "protoplasm" && species !== "protoplasm") {
        state = "pending";
      }
      previousSpecies = species;
    },

    check(): CapturedEvolutionResultCheckOutcome {
      if (state !== "pending") {
        return Object.freeze({ status: "idle", stopCycle: false });
      }
      state = "watching";
      const sample = reader.sampleEvolutionResult();
      if (sample.status !== "ready") {
        return Object.freeze({ status: "unavailable", stopCycle: true });
      }
      const decision = decideEvolutionResult(sample.input);
      for (const event of decision.logs) report(event);
      if (!decision.needReset) {
        return Object.freeze({ status: "checked", stopCycle: false });
      }

      if (sample.input.autoEvolution && sample.input.evolutionBackup) {
        restoreEvolutionAfterResult();
      }
      if (!softReset.issueSoftReset()) {
        return Object.freeze({ status: "reset-unavailable", stopCycle: true });
      }
      state = "reset-issued";
      return Object.freeze({ status: "reset-issued", stopCycle: true });
    },
  });
}

export interface CapturedSoftResetDocument {
  querySelector(selector: string): {
    readonly disabled?: boolean;
    click?(): void;
  } | null;
}

/** The upstream settings tab's left reset button; the right sibling is hard reset. */
export const CAPTURED_SOFT_RESET_SELECTOR = ".reset .button:not(.right)";

export function createCapturedSoftResetControl(
  getDocument: () => unknown,
): CapturedSoftResetControl {
  return Object.freeze({
    issueSoftReset(): boolean {
      const document = getDocument() as CapturedSoftResetDocument;
      const button = document.querySelector(CAPTURED_SOFT_RESET_SELECTOR);
      if (
        button === null ||
        button.disabled === true ||
        typeof button.click !== "function"
      ) {
        return false;
      }
      button.click();
      return true;
    },
  });
}
