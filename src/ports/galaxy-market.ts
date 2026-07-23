import type { GalaxyMarketInput } from "../domain/economy/market/galaxy-market.ts";

export interface GalaxyMarketReader {
  read(): GalaxyMarketInput;
}
