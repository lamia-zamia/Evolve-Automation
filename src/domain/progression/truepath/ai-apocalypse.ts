/** Technologies whose resource costs must be reserved before they are affordable. */
const AI_RESOURCE_RESEARCH_IDS: ReadonlySet<string> = new Set([
  "tech-ai_optimizations",
  "tech-synthetic_life",
  "tech-protocol66",
  "tech-protocol66a",
]);

export type TruepathAiBuildingTarget =
  "TitanDecoder" | "TitanAIColonist" | "ErisTrooper" | "ErisTank";

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
  /** Current next-build Money prices, when the live building wrappers expose them. */
  readonly decoderMoneyCost?: number | null;
  readonly colonistMoneyCost?: number | null;
  readonly trooperMoneyCost?: number | null;
  readonly tankMoneyCost?: number | null;
}

export interface TruepathAiApocalypsePlan {
  readonly progress: number;
  readonly target: TruepathAiBuildingTarget | null;
  readonly targetColonistCount: number;
  /** Power draw for Colonists still needed to reach the progress gate. */
  readonly additionalColonistPower: number;
}

/** AI research stages whose costs must be reserved before the next gate. */
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
 *
 * When current Money prices are available, choose the next action by its
 * immediate Money cost per point of progress (or per Colonist requirement it
 * removes). This prevents the controller from committing to a long run of
 * exponentially more expensive Colonists when a Decoder or Eris unit is the
 * cheaper next step. Compatibility fixtures without prices retain the simple
 * Colonist plan.
 */
export function planTruepathAiApocalypse(
  input: Readonly<TruepathAiApocalypseInput>,
): TruepathAiApocalypsePlan {
  const progress = readTruepathAiProgress(input);
  if (!input.enabled || input.aiCoreLevel < 3 || progress >= 100) {
    return Object.freeze({
      progress,
      target: null,
      targetColonistCount: 0,
      additionalColonistPower: 0,
    });
  }

  if (input.decoderOnCount < 1) {
    return Object.freeze({
      progress,
      target: input.decoderCount < 1 ? "TitanDecoder" : null,
      targetColonistCount: 0,
      additionalColonistPower: 0,
    });
  }

  const baseProgress = input.trooperOnCount * 2 + input.tankOnCount * 2;
  const targetColonistCount = Math.ceil(
    Math.max(0, 100 - baseProgress) / (input.decoderOnCount * 0.35),
  );
  const additionalColonistPower =
    Math.max(0, targetColonistCount - input.colonistCount) * 10;
  const prices = [
    input.decoderMoneyCost,
    input.colonistMoneyCost,
    input.trooperMoneyCost,
    input.tankMoneyCost,
  ];
  const hasPrices = prices.some(
    (price) => typeof price === "number" && Number.isFinite(price),
  );
  if (hasPrices) {
    const progressPerColonist = input.decoderOnCount * 0.35;
    const colonistPrice = input.colonistMoneyCost;
    const candidates: Array<{
      target: TruepathAiBuildingTarget;
      score: number;
    }> = [];
    if (
      typeof colonistPrice === "number" &&
      Number.isFinite(colonistPrice) &&
      input.colonistCount < targetColonistCount &&
      progressPerColonist > 0
    ) {
      candidates.push({
        target: "TitanAIColonist",
        score: colonistPrice / progressPerColonist,
      });
    }
    const addDirectProgressCandidate = (
      target: "ErisTrooper" | "ErisTank",
      price: number | null | undefined,
    ): void => {
      if (typeof price === "number" && Number.isFinite(price)) {
        candidates.push({ target, score: price / 2 });
      }
    };
    addDirectProgressCandidate("ErisTrooper", input.trooperMoneyCost);
    addDirectProgressCandidate("ErisTank", input.tankMoneyCost);

    const decoderPrice = input.decoderMoneyCost;
    const nextDecoderCount = input.decoderOnCount + 1;
    const targetWithNextDecoder = Math.ceil(
      Math.max(0, 100 - baseProgress) / (nextDecoderCount * 0.35),
    );
    const colonistsRemoved = targetColonistCount - targetWithNextDecoder;
    if (
      typeof decoderPrice === "number" &&
      Number.isFinite(decoderPrice) &&
      colonistsRemoved > 0
    ) {
      candidates.push({
        target: "TitanDecoder",
        score: decoderPrice / colonistsRemoved,
      });
    }
    candidates.sort((left, right) => left.score - right.score);
    const best = candidates[0];
    if (best !== undefined) {
      return Object.freeze({
        progress,
        target: best.target,
        targetColonistCount,
        additionalColonistPower,
      });
    }
  }
  return Object.freeze({
    progress,
    target:
      input.colonistCount < targetColonistCount ? "TitanAIColonist" : null,
    targetColonistCount,
    additionalColonistPower,
  });
}
