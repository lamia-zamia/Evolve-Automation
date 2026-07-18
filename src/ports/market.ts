import type {
  MarketBuyInput,
  MarketGateInput,
  MarketSellInput,
  MarketSessionInput,
} from "../domain/market.ts";

export interface MarketReader {
  readGate(): MarketGateInput;
  readSession(): MarketSessionInput;
  readSell(index: number, ignoreSellRatio: boolean): MarketSellInput | null;
  readBuy(index: number, minimumMoneyAllowed: number): MarketBuyInput;
}

export interface TradeRouteAdjuster {
  adjust(): void;
}
