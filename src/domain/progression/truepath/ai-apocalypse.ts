/** Technologies whose resource costs must be reserved before they are affordable. */
const AI_RESOURCE_RESEARCH_IDS: ReadonlySet<string> = new Set([
  "tech-ai_optimizations",
  "tech-synthetic_life",
]);

export type TruepathAiBuildingTarget = "TitanDecoder" | "TitanAIColonist";

export interface TruepathAiApocalypseInput {
  readonly enabled: boolean;
  readonly aiCoreLevel: number;
  /** AI progress uses powered-on counts, matching Evolve's `Ro()` calculation. */
  readonly decoderCount: number;
  readonly decoderOnCount: number;
  readonly colonistCount: number;
  readonly colonistOnCount: number;
  readonly trooperOnCount: number;
  readonly tankOnCount: number;
}

export interface TruepathAiApocalypsePlan {
  readonly progress: number;
  readonly target: TruepathAiBuildingTarget | null;
  readonly targetColonistCount: number;
}

/** The research stages that must be funded before Protocol 66 can appear. */
export function isTruepathAiResourceResearch(id: string | null): boolean {
  return id !== null && AI_RESOURCE_RESEARCH_IDS.has(id);
}

/**
 * Evolve's AI progress calculation: Colonists × Decoders × .35, plus two
 * points per powered Android Trooper and Tank, capped at 100.
 */
export function readTruepathAiProgress(
  input: Readonly<TruepathAiApocalypseInput>,
): number {
  const progress =
    input.colonistOnCount * input.decoderOnCount * 0.35 +
    input.trooperOnCount * 2 +
    input.tankOnCount * 2;
  return Math.min(100, Math.max(0, progress));
}

/**
 * Selects the one True Path AI building that can move the apocalypse forward.
 * Core levels below three are research-gated; the research controller handles
 * those stages and this planner only handles the hardware stage afterward.
 */
export function planTruepathAiApocalypse(
  input: Readonly<TruepathAiApocalypseInput>,
): TruepathAiApocalypsePlan {
  const progress = readTruepathAiProgress(input);
  if (!input.enabled || input.aiCoreLevel < 3 || progress >= 100) {
    return Object.freeze({ progress, target: null, targetColonistCount: 0 });
  }

  if (input.decoderOnCount < 1) {
    return Object.freeze({
      progress,
      target: input.decoderCount < 1 ? "TitanDecoder" : null,
      targetColonistCount: 0,
    });
  }

  const baseProgress = input.trooperOnCount * 2 + input.tankOnCount * 2;
  const targetColonistCount = Math.ceil(
    Math.max(0, 100 - baseProgress) / (input.decoderOnCount * 0.35),
  );
  return Object.freeze({
    progress,
    target:
      input.colonistCount < targetColonistCount ? "TitanAIColonist" : null,
    targetColonistCount,
  });
}
