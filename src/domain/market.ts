export interface MarketGateInput {
  readonly unlocked: boolean;
  readonly noTrade: boolean;
}

export interface MarketSessionInput {
  readonly originalMultiplier: number;
  readonly maximumMultiplier: number;
  readonly minimumMoneyAllowed: number;
}

interface MarketCandidateBase {
  readonly index: number;
  readonly resourceId: string;
  readonly eligible: boolean;
}

export interface MarketSellInput extends MarketCandidateBase {
  readonly autoSellEnabled: boolean;
  readonly ignoreSellRatio: boolean;
  readonly storageRatio: number;
  readonly autoSellRatio: number;
  readonly moneyMaximum: number;
  readonly moneyCurrent: number;
  readonly unitPrice: number;
  readonly currentQuantity: number;
  readonly maxQuantity: number;
  readonly income: number;
  readonly ticksPerSecond: number;
  readonly maximumMultiplier: number;
}

export interface MarketBuyInput extends MarketCandidateBase {
  readonly autoBuyEnabled: boolean;
  readonly storageRatio: number;
  readonly autoBuyRatio: number;
  readonly moneyDemanded: boolean;
  readonly moneyCurrent: number;
  readonly minimumMoneyAllowed: number;
  readonly unitPrice: number;
  readonly currentQuantity: number;
  readonly maxQuantity: number;
  readonly maximumMultiplier: number;
}

export interface MarketTradeDecision {
  readonly kind: "trade";
  readonly side: "buy" | "sell";
  readonly index: number;
  readonly resourceId: string;
  readonly expectedMoneyCurrent: number;
  readonly expectedResourceCurrent: number;
  readonly expectedUnitPrice: number;
  readonly multiplier: number;
  readonly repetitions: number;
}

export interface MarketRestoreMultiplierDecision {
  readonly kind: "restore-multiplier";
  readonly multiplier: number;
}

export type MarketDecision =
  MarketTradeDecision | MarketRestoreMultiplierDecision;

function batchTrade(
  side: "buy" | "sell",
  input: Readonly<MarketSellInput | MarketBuyInput>,
  maximumUnits: number,
): MarketTradeDecision {
  if (maximumUnits <= input.maximumMultiplier) {
    return Object.freeze({
      kind: "trade",
      side,
      index: input.index,
      resourceId: input.resourceId,
      expectedMoneyCurrent: input.moneyCurrent,
      expectedResourceCurrent: input.currentQuantity,
      expectedUnitPrice: input.unitPrice,
      multiplier: maximumUnits,
      repetitions: 1,
    });
  }
  return Object.freeze({
    kind: "trade",
    side,
    index: input.index,
    resourceId: input.resourceId,
    expectedMoneyCurrent: input.moneyCurrent,
    expectedResourceCurrent: input.currentQuantity,
    expectedUnitPrice: input.unitPrice,
    multiplier: input.maximumMultiplier,
    repetitions: Math.min(
      5,
      Math.floor(maximumUnits / input.maximumMultiplier),
    ),
  });
}

export function planMarketSell(
  input: Readonly<MarketSellInput>,
): MarketTradeDecision | null {
  if (
    !input.eligible ||
    !input.autoSellEnabled ||
    (!input.ignoreSellRatio && input.storageRatio < input.autoSellRatio)
  ) {
    return null;
  }
  let maximumUnits = Math.floor(
    (input.moneyMaximum - input.moneyCurrent) / input.unitPrice,
  );
  maximumUnits = Math.min(
    maximumUnits,
    input.storageRatio > input.autoSellRatio
      ? Math.floor(
          input.currentQuantity - input.autoSellRatio * input.maxQuantity,
        )
      : Math.floor((input.income * 2) / input.ticksPerSecond),
  );
  // Legacy issues one sell even for zero/negative calculated units. The
  // manager clamps its multiplier, so preserve the observable command path.
  return batchTrade("sell", input, maximumUnits);
}

export function planMarketBuy(
  input: Readonly<MarketBuyInput>,
): MarketTradeDecision | null {
  if (
    !input.eligible ||
    !input.autoBuyEnabled ||
    input.storageRatio >= input.autoBuyRatio ||
    input.moneyDemanded
  ) {
    return null;
  }
  const storableAmount = Math.floor(
    (input.autoBuyRatio - input.storageRatio) * input.maxQuantity,
  );
  const affordableAmount = Math.floor(
    (input.moneyCurrent - input.minimumMoneyAllowed) / input.unitPrice,
  );
  const maximumUnits = Math.min(storableAmount, affordableAmount);
  return maximumUnits > 0 ? batchTrade("buy", input, maximumUnits) : null;
}
