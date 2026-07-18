export type GeneticsToggle = "sequence" | "boost" | "auto";

export interface GeneticsAssemblyInput {
  readonly knowledgeCurrent: number;
  readonly knowledgeRate: number;
  readonly knowledgeMaximum: number;
  readonly knowledgeDemanded: boolean;
  readonly genesCurrent: number;
  readonly ticksPerSecond: number;
}

export interface GeneticsInput {
  readonly available: boolean;
  readonly technologyLevel: number;
  readonly mutationCount: number;
  readonly sequenceMode: string;
  readonly sequenceOn: boolean;
  readonly boostMode: string;
  readonly boostOn: boolean;
  readonly assembleMode: string;
  readonly autoOn: boolean;
  readonly assembly: GeneticsAssemblyInput | null;
}

export interface GeneticsToggleDecision {
  readonly kind: "set-genetics-toggle";
  readonly toggle: GeneticsToggle;
  readonly expected: boolean;
  readonly enabled: boolean;
}

export interface GeneticsAssemblyDecision {
  readonly kind: "assemble-genes";
  readonly count: number;
  readonly expectedKnowledge: number;
  readonly expectedGenes: number;
  readonly knowledgeAfter: number;
  readonly genesAfter: number;
}

export type GeneticsDecision =
  GeneticsToggleDecision | GeneticsAssemblyDecision;

function configuredTarget(mode: string): boolean | null {
  if (mode === "enabled") return true;
  if (mode === "disabled") return false;
  return null;
}

export function planGenetics(
  input: Readonly<GeneticsInput>,
): readonly Readonly<GeneticsDecision>[] {
  if (!input.available) return Object.freeze([]);
  const decisions: GeneticsDecision[] = [];

  const sequenceTarget =
    input.sequenceMode === "decode"
      ? input.mutationCount < 1
      : configuredTarget(input.sequenceMode);
  if (sequenceTarget !== null && sequenceTarget !== input.sequenceOn) {
    decisions.push(
      Object.freeze({
        kind: "set-genetics-toggle",
        toggle: "sequence",
        expected: input.sequenceOn,
        enabled: sequenceTarget,
      }),
    );
  }
  if (input.technologyLevel < 5) return Object.freeze(decisions);

  const boostTarget = configuredTarget(input.boostMode);
  if (boostTarget !== null && boostTarget !== input.boostOn) {
    decisions.push(
      Object.freeze({
        kind: "set-genetics-toggle",
        toggle: "boost",
        expected: input.boostOn,
        enabled: boostTarget,
      }),
    );
  }
  if (input.technologyLevel < 6) return Object.freeze(decisions);

  const autoTarget = configuredTarget(input.assembleMode);
  if (autoTarget !== null && autoTarget !== input.autoOn) {
    decisions.push(
      Object.freeze({
        kind: "set-genetics-toggle",
        toggle: "auto",
        expected: input.autoOn,
        enabled: autoTarget,
      }),
    );
  }

  const assembly = input.assembly;
  if (
    input.assembleMode !== "auto" ||
    assembly === null ||
    assembly.knowledgeCurrent < 200_000 ||
    assembly.knowledgeDemanded
  ) {
    return Object.freeze(decisions);
  }
  const nextTickKnowledge =
    assembly.knowledgeCurrent +
    assembly.knowledgeRate / assembly.ticksPerSecond;
  const overflowKnowledge = nextTickKnowledge - assembly.knowledgeMaximum;
  if (overflowKnowledge <= 0) return Object.freeze(decisions);

  const count = Math.ceil(overflowKnowledge / 200_000);
  decisions.push(
    Object.freeze({
      kind: "assemble-genes",
      count,
      expectedKnowledge: assembly.knowledgeCurrent,
      expectedGenes: assembly.genesCurrent,
      knowledgeAfter: assembly.knowledgeCurrent - 200_000 * count,
      genesAfter: assembly.genesCurrent + count,
    }),
  );
  return Object.freeze(decisions);
}
