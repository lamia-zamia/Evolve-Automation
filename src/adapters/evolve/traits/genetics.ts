import type {
  GeneticsAssemblyDecision,
  GeneticsAssemblyInput,
  GeneticsDecision,
  GeneticsInput,
  GeneticsToggle,
  GeneticsToggleDecision,
} from "../../../domain/traits/genetics.ts";
import type { DecisionExecutor } from "../../../ports/decision-executor.ts";
import type {
  GeneticsControls,
  GeneticsReader,
} from "../../../ports/genetics.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import {
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  requireString,
  type UnknownRecord,
} from "../../validation.ts";

interface GeneticsSession {
  readonly sequence: UnknownRecord;
  readonly resources: UnknownRecord | null;
  readonly knowledge: UnknownRecord | null;
  readonly genes: UnknownRecord | null;
}

export interface GeneticsAdapterDependencies {
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
  readonly getResources: () => unknown;
  readonly getTicksPerSecond: () => unknown;
  readonly controls: GeneticsControls;
}

function readGlobal(gameValue: unknown): UnknownRecord {
  const game = requireRecord(gameValue, "game");
  return requireRecord(game["global"], "game.global");
}

function readTechnologyLevel(global: UnknownRecord): number {
  const tech = requireRecord(global["tech"], "game.global.tech");
  const value = tech["genetics"];
  if (value === undefined || value === null || value === 0) return 0;
  return requireNumber(value, "game.global.tech.genetics");
}

function emptyInput(level: number): GeneticsInput {
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

function readAssembly(dependencies: GeneticsAdapterDependencies): {
  readonly input: GeneticsAssemblyInput;
  readonly resources: UnknownRecord;
  readonly knowledge: UnknownRecord;
  readonly genes: UnknownRecord | null;
} {
  const resources = requireRecord(dependencies.getResources(), "resources");
  const knowledge = requireRecord(
    resources["Knowledge"],
    "resources.Knowledge",
  );
  const knowledgeCurrent = requireNumber(
    knowledge["currentQuantity"],
    "resources.Knowledge.currentQuantity",
  );
  if (knowledgeCurrent < 200_000) {
    return {
      input: Object.freeze({
        knowledgeCurrent,
        knowledgeRate: 0,
        knowledgeMaximum: 0,
        knowledgeDemanded: false,
        genesCurrent: 0,
        ticksPerSecond: 1,
      }),
      resources,
      knowledge,
      genes: null,
    };
  }
  const isDemanded = requireFunction(
    knowledge["isDemanded"],
    "resources.Knowledge.isDemanded",
  );
  const knowledgeDemanded = Boolean(Reflect.apply(isDemanded, knowledge, []));
  if (knowledgeDemanded) {
    return {
      input: Object.freeze({
        knowledgeCurrent,
        knowledgeRate: 0,
        knowledgeMaximum: 0,
        knowledgeDemanded: true,
        genesCurrent: 0,
        ticksPerSecond: 1,
      }),
      resources,
      knowledge,
      genes: null,
    };
  }
  const genes = requireRecord(resources["Genes"], "resources.Genes");
  const ticksPerSecond = requireNumber(
    dependencies.getTicksPerSecond(),
    "ticksPerSecond",
  );
  if (ticksPerSecond <= 0) {
    throw new TypeError("ticksPerSecond must be greater than zero");
  }
  return {
    input: Object.freeze({
      knowledgeCurrent,
      knowledgeRate: requireNumber(
        knowledge["rateOfChange"],
        "resources.Knowledge.rateOfChange",
      ),
      knowledgeMaximum: requireNumber(
        knowledge["maxQuantity"],
        "resources.Knowledge.maxQuantity",
      ),
      knowledgeDemanded: false,
      genesCurrent: requireNumber(
        genes["currentQuantity"],
        "resources.Genes.currentQuantity",
      ),
      ticksPerSecond,
    }),
    resources,
    knowledge,
    genes,
  };
}

export function createGeneticsAdapter(
  dependencies: GeneticsAdapterDependencies,
): {
  readonly reader: GeneticsReader;
  readonly executor: DecisionExecutor<GeneticsDecision>;
} {
  let session: GeneticsSession | null = null;
  const reader: GeneticsReader = Object.freeze({
    readGate() {
      const level = readTechnologyLevel(readGlobal(dependencies.getGame()));
      if (level === 0) session = null;
      return Object.freeze({ unlocked: level !== 0 });
    },

    readPlan(): GeneticsInput {
      const global = readGlobal(dependencies.getGame());
      const level = readTechnologyLevel(global);
      if (level === 0) {
        session = null;
        return emptyInput(level);
      }
      const arpa = requireRecord(global["arpa"], "game.global.arpa");
      const rawSequence = arpa["sequence"];
      if (typeof rawSequence !== "object" || rawSequence === null) {
        session = null;
        return emptyInput(level);
      }
      const sequence = requireRecord(rawSequence, "game.global.arpa.sequence");
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const sequenceMode = requireString(
        settings["geneticsSequence"],
        "settings.geneticsSequence",
      );
      const sequenceOn = requireBoolean(
        sequence["on"],
        "game.global.arpa.sequence.on",
      );
      let mutationCount = 0;
      if (sequenceMode === "decode") {
        const race = requireRecord(global["race"], "game.global.race");
        mutationCount = requireNumber(
          race["mutation"],
          "game.global.race.mutation",
        );
      }
      const boostMode =
        level >= 5
          ? requireString(settings["geneticsBoost"], "settings.geneticsBoost")
          : "none";
      const boostOn =
        level >= 5
          ? requireBoolean(sequence["boost"], "game.global.arpa.sequence.boost")
          : false;
      const assembleMode =
        level >= 6
          ? requireString(
              settings["geneticsAssemble"],
              "settings.geneticsAssemble",
            )
          : "none";
      const autoOn =
        level >= 6
          ? requireBoolean(sequence["auto"], "game.global.arpa.sequence.auto")
          : false;
      const assemblyData =
        level >= 6 && assembleMode === "auto"
          ? readAssembly(dependencies)
          : null;
      session = Object.freeze({
        sequence,
        resources: assemblyData?.resources ?? null,
        knowledge: assemblyData?.knowledge ?? null,
        genes: assemblyData?.genes ?? null,
      });
      return Object.freeze({
        available: true,
        technologyLevel: level,
        mutationCount,
        sequenceMode,
        sequenceOn,
        boostMode,
        boostOn,
        assembleMode,
        autoOn,
        assembly: assemblyData?.input ?? null,
      });
    },
  });

  const executeToggle = (
    decision: Readonly<GeneticsToggleDecision>,
    active: GeneticsSession,
  ) => {
    const propertyByToggle: Readonly<Record<GeneticsToggle, string>> = {
      sequence: "on",
      boost: "boost",
      auto: "auto",
    };
    const property = propertyByToggle[decision.toggle];
    const actual = requireBoolean(
      active.sequence[property],
      `game.global.arpa.sequence.${property}`,
    );
    if (actual !== decision.expected) {
      return stale("genetics-toggle-changed", "genetics toggle changed", {
        toggle: decision.toggle,
        expected: decision.expected,
        actual,
      });
    }
    if (actual === decision.enabled) return SUCCEEDED;
    return dependencies.controls.toggle(decision.toggle)
      ? SUCCEEDED
      : stale(
          "genetics-toggle-unavailable",
          `genetics ${decision.toggle} control became unavailable`,
        );
  };

  const executeAssembly = (
    decision: Readonly<GeneticsAssemblyDecision>,
    active: GeneticsSession,
  ) => {
    if (
      !Number.isSafeInteger(decision.count) ||
      decision.count <= 0 ||
      !Number.isFinite(decision.knowledgeAfter) ||
      !Number.isFinite(decision.genesAfter)
    ) {
      return rejected(
        "invalid-genetics-assembly",
        "genetics assembly must have a positive safe count and finite balances",
      );
    }
    if (
      active.resources === null ||
      active.knowledge === null ||
      active.genes === null ||
      dependencies.getResources() !== active.resources
    ) {
      return stale("genetics-resources-changed", "genetics resources changed");
    }
    const actualKnowledge = requireNumber(
      active.knowledge["currentQuantity"],
      "resources.Knowledge.currentQuantity",
    );
    const actualGenes = requireNumber(
      active.genes["currentQuantity"],
      "resources.Genes.currentQuantity",
    );
    if (
      actualKnowledge !== decision.expectedKnowledge ||
      actualGenes !== decision.expectedGenes
    ) {
      return stale("genetics-balances-changed", "genetics balances changed", {
        expectedKnowledge: decision.expectedKnowledge,
        actualKnowledge,
        expectedGenes: decision.expectedGenes,
        actualGenes,
      });
    }
    active.knowledge["currentQuantity"] = decision.knowledgeAfter;
    active.genes["currentQuantity"] = decision.genesAfter;
    if (!dependencies.controls.assemble(decision.count)) {
      return stale(
        "genetics-assembly-unavailable",
        "genetics assembly control became unavailable",
      );
    }
    return SUCCEEDED;
  };

  const executor: DecisionExecutor<GeneticsDecision> = Object.freeze({
    execute(decision: Readonly<GeneticsDecision>) {
      const active = session;
      if (active === null) {
        return stale("genetics-session-missing", "genetics session is missing");
      }
      const global = readGlobal(dependencies.getGame());
      if (readTechnologyLevel(global) === 0) {
        return stale("genetics-locked", "genetics became unavailable");
      }
      const arpa = requireRecord(global["arpa"], "game.global.arpa");
      if (arpa["sequence"] !== active.sequence) {
        return stale("genetics-sequence-changed", "genetics sequence changed");
      }
      if (decision.kind === "set-genetics-toggle") {
        if (
          !["sequence", "boost", "auto"].includes(decision.toggle) ||
          typeof decision.expected !== "boolean" ||
          typeof decision.enabled !== "boolean"
        ) {
          return rejected(
            "invalid-genetics-toggle",
            "genetics toggle decision is invalid",
          );
        }
        return executeToggle(decision, active);
      }
      if (decision.kind === "assemble-genes") {
        return executeAssembly(decision, active);
      }
      return rejected(
        "invalid-genetics-decision",
        "genetics decision is invalid",
      );
    },
  });

  return Object.freeze({ reader, executor });
}
