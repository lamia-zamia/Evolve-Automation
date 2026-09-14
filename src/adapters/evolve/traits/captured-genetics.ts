/**
 * Sequencer, booster, auto-sequencer and gene assembly through the game's own `#arpaSequence`
 * component.
 *
 * `genetics()` (DeadSpace `src/arpa.js`) binds that component with `toggle`, `booster`, `novo` and
 * `auto_seq`. Each of the three toggles flips one flag on `global.arpa.sequence` and repaints its
 * own button; `novo` charges 200 000 Knowledge for one Gene, up to the game's own key multiplier,
 * and declines when the balance is short. All four methods exist on the binding whatever
 * `tech.genetics` is — the level only decides which buttons the panel draws — so the level gates
 * stay in the pure policy, which is the script's own rule about what it is willing to manage.
 *
 * The flags are read from the captured root rather than from the component's binding data: the two
 * are the same object upstream, and the root is the reader every other captured feature uses.
 */

import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import type {
  GeneticsAssemblyDecision,
  GeneticsDecision,
  GeneticsInput,
  GeneticsToggle,
  GeneticsToggleDecision,
} from "../../../domain/traits/genetics.ts";
import type { DecisionExecutor } from "../../../ports/decision-executor.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type {
  GeneticsControls,
  GeneticsReader,
} from "../../../ports/genetics.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import { finite, isRecord, readProperty } from "../../validation.ts";
import { readScriptCyclesPerSecond } from "../captured-tick-rate.ts";
import type { CapturedDemandSample } from "../economy/resources/captured-resource-demand.ts";

/** The element id `genetics()` binds the sequencer panel to. */
export const GENETICS_CONTROL = "arpaSequence";

/** The Knowledge one Gene costs, straight from the `novo` method's own constant. */
const GENE_KNOWLEDGE_COST = 200_000;

/** The `global.arpa.sequence` flag each toggle owns, and the method that flips it. */
const TOGGLE_FLAG: Readonly<Record<GeneticsToggle, string>> = Object.freeze({
  sequence: "on",
  boost: "boost",
  auto: "auto",
});

const TOGGLE_METHOD: Readonly<Record<GeneticsToggle, string>> = Object.freeze({
  sequence: "toggle",
  boost: "booster",
  auto: "auto_seq",
});

export interface CapturedGeneticsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  /** The cycle's shared demand sample; Knowledge being saved for stands assembly down. */
  readonly readDemand: () => CapturedDemandSample;
}

/** What the reader captured, so the executor can refuse to act on a moved target. */
interface GeneticsSession {
  readonly root: unknown;
  readonly sequence: Record<PropertyKey, unknown>;
  readonly knowledge: Record<PropertyKey, unknown> | undefined;
  readonly genes: Record<PropertyKey, unknown> | undefined;
  readonly handle: GameControlHandle;
}

export interface CapturedGenetics {
  readonly reader: GeneticsReader;
  readonly executor: DecisionExecutor<GeneticsDecision>;
  readonly controls: GeneticsControls;
}

function lockedInput(level: number): GeneticsInput {
  return Object.freeze({
    available: false,
    technologyLevel: level,
    mutationCount: 0,
    sequenceMode: "none",
    sequenceOn: false,
    boostMode: "none",
    boostOn: false,
    assembleMode: "none",
    autoOn: false,
    assembly: null,
  });
}

function settingMode(settings: unknown, key: string): string {
  const value = readProperty(settings, key);
  return typeof value === "string" ? value : "none";
}

function sequenceFlag(
  sequence: Record<PropertyKey, unknown>,
  key: string,
): boolean {
  return readProperty(sequence, key) === true;
}

export function createCapturedGenetics(
  dependencies: CapturedGeneticsDependencies,
): CapturedGenetics {
  let session: GeneticsSession | null = null;
  let handle: GameControlHandle | undefined;

  const readLevel = (root: unknown): number =>
    finite(readProperty(readProperty(root, "tech"), "genetics")) ?? 0;

  const reader: GeneticsReader = Object.freeze({
    readGate() {
      const level = readLevel(dependencies.rootState.readRoot());
      if (level === 0) session = null;
      return Object.freeze({ unlocked: level !== 0 });
    },

    readPlan(): GeneticsInput {
      const root = dependencies.rootState.readRoot();
      const level = readLevel(root);
      const sequence = readProperty(readProperty(root, "arpa"), "sequence");
      if (level === 0 || !isRecord(sequence) || handle === undefined) {
        session = null;
        return lockedInput(level);
      }
      const settings = dependencies.readSettings();
      const assembleMode =
        level >= 6 ? settingMode(settings, "geneticsAssemble") : "none";
      const resources = readProperty(root, "resource");
      const knowledge = readProperty(resources, "Knowledge");
      const genes = readProperty(resources, "Genes");
      const knowledgeCurrent = finite(readProperty(knowledge, "amount"));
      const knowledgeMaximum = finite(readProperty(knowledge, "max"));
      // The policy assembles only out of Knowledge that would otherwise overflow, so a balance the
      // capture cannot read is no assembly rather than a guess — and neither is a negative maximum,
      // the game's "no limit" sentinel, which `captured-affordability` reads as `cap >= 0` for the
      // question it asks: a resource with no ceiling has nothing to spill over it.
      const assembly =
        assembleMode === "auto" &&
        isRecord(knowledge) &&
        isRecord(genes) &&
        knowledgeCurrent !== undefined &&
        knowledgeMaximum !== undefined &&
        knowledgeMaximum >= 0
          ? Object.freeze({
              knowledgeCurrent,
              knowledgeRate: finite(readProperty(knowledge, "diff")) ?? 0,
              knowledgeMaximum,
              knowledgeDemanded: dependencies
                .readDemand()
                .isDemanded("Knowledge"),
              genesCurrent: finite(readProperty(genes, "amount")) ?? 0,
              // One working cycle is what the next press has to get ahead of, which is the same
              // conversion the gate itself counts in.
              ticksPerSecond: readScriptCyclesPerSecond(settings),
            })
          : null;
      session = Object.freeze({
        root,
        sequence,
        knowledge: isRecord(knowledge) ? knowledge : undefined,
        genes: isRecord(genes) ? genes : undefined,
        handle,
      });
      return Object.freeze({
        available: true,
        technologyLevel: level,
        mutationCount:
          finite(readProperty(readProperty(root, "race"), "mutation")) ?? 0,
        sequenceMode: settingMode(settings, "geneticsSequence"),
        sequenceOn: sequenceFlag(sequence, "on"),
        boostMode: level >= 5 ? settingMode(settings, "geneticsBoost") : "none",
        boostOn: level >= 5 && sequenceFlag(sequence, "boost"),
        assembleMode,
        autoOn: level >= 6 && sequenceFlag(sequence, "auto"),
        assembly,
      });
    },
  });

  /**
   * The control capture the application runs between the gate and the plan. The executor drives the
   * captured handle itself, so the port's command methods have nothing left to do here; the plan
   * reads the same handle and refuses to describe a panel nothing was captured for.
   */
  const controls: GeneticsControls = Object.freeze({
    capture(): boolean {
      handle = dependencies.controls.resolve(GENETICS_CONTROL);
      return handle !== undefined;
    },
    toggle(): boolean {
      return handle !== undefined;
    },
    assemble(): boolean {
      return handle !== undefined;
    },
  });

  /** Everything that must still hold before any method is invoked. */
  const openSession = ():
    | { readonly active: GeneticsSession }
    | { readonly outcome: CommandExecutionOutcome } => {
    const active = session;
    if (active === null) {
      return {
        outcome: stale(
          "genetics-session-missing",
          "genetics session is missing",
        ),
      };
    }
    const root = dependencies.rootState.readRoot();
    if (root !== active.root) {
      return {
        outcome: stale("genetics-root-changed", "captured game root changed"),
      };
    }
    if (readLevel(root) === 0) {
      return {
        outcome: stale("genetics-locked", "genetics became unavailable"),
      };
    }
    if (
      readProperty(readProperty(root, "arpa"), "sequence") !== active.sequence
    ) {
      return {
        outcome: stale(
          "genetics-sequence-changed",
          "genetics sequence changed",
        ),
      };
    }
    const current = dependencies.controls.resolve(GENETICS_CONTROL);
    if (
      current === undefined ||
      current.generation !== active.handle.generation
    ) {
      return {
        outcome: stale(
          "genetics-control-stale",
          "captured genetics control was rebound",
        ),
      };
    }
    return { active };
  };

  const executeToggle = (
    decision: Readonly<GeneticsToggleDecision>,
    active: GeneticsSession,
  ): CommandExecutionOutcome => {
    const property = TOGGLE_FLAG[decision.toggle];
    const method = TOGGLE_METHOD[decision.toggle];
    if (property === undefined || method === undefined) {
      return rejected(
        "invalid-genetics-toggle",
        "genetics toggle decision is invalid",
      );
    }
    const actual = sequenceFlag(active.sequence, property);
    if (actual !== decision.expected) {
      return stale("genetics-toggle-changed", "genetics toggle changed", {
        toggle: decision.toggle,
        expected: decision.expected,
        actual,
      });
    }
    if (actual === decision.enabled) return SUCCEEDED;
    const result = dependencies.controls.invoke(active.handle, method);
    return result.ok
      ? SUCCEEDED
      : rejected("genetics-toggle-failed", result.detail ?? result.reason);
  };

  const executeAssembly = (
    decision: Readonly<GeneticsAssemblyDecision>,
    active: GeneticsSession,
  ): CommandExecutionOutcome => {
    if (!Number.isSafeInteger(decision.count) || decision.count <= 0) {
      return rejected(
        "invalid-genetics-assembly",
        "genetics assembly must have a positive safe count",
      );
    }
    const { knowledge, genes } = active;
    if (knowledge === undefined || genes === undefined) {
      return stale(
        "genetics-resources-missing",
        "genetics resources are missing",
      );
    }
    if (
      finite(readProperty(knowledge, "amount")) !==
        decision.expectedKnowledge ||
      finite(readProperty(genes, "amount")) !== decision.expectedGenes
    ) {
      return stale("genetics-balances-changed", "genetics balances changed");
    }
    // `novo` buys `min(keyMultiplier(), affordable)` per call and charges the game's own balances,
    // so the loop counts Genes rather than presses: a player holding a multiplier key covers the
    // count in fewer calls, and a press the game declines ends it instead of repeating.
    for (let bought = 0; bought < decision.count;) {
      const before = finite(readProperty(genes, "amount"));
      const funds = finite(readProperty(knowledge, "amount"));
      if (before === undefined || funds === undefined) {
        return stale("genetics-balances-changed", "genetics balances changed");
      }
      if (funds < GENE_KNOWLEDGE_COST) break;
      const result = dependencies.controls.invoke(active.handle, "novo");
      if (!result.ok) {
        return rejected(
          "genetics-assembly-failed",
          result.detail ?? result.reason,
        );
      }
      const after = finite(readProperty(genes, "amount"));
      if (after === undefined || after <= before) {
        return stale(
          "genetics-assembly-declined",
          "genetics assembly bought no genes",
        );
      }
      bought += after - before;
    }
    return SUCCEEDED;
  };

  const executor: DecisionExecutor<GeneticsDecision> = Object.freeze({
    execute(decision: Readonly<GeneticsDecision>): CommandExecutionOutcome {
      const opened = openSession();
      if ("outcome" in opened) return opened.outcome;
      if (decision.kind === "set-genetics-toggle") {
        return executeToggle(decision, opened.active);
      }
      if (decision.kind === "assemble-genes") {
        return executeAssembly(decision, opened.active);
      }
      return rejected(
        "invalid-genetics-decision",
        "genetics decision is invalid",
      );
    },
  });

  return Object.freeze({ reader, executor, controls });
}
