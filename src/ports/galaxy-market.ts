import type { GalaxyMarketInput } from "../domain/galaxy-market.ts";

export interface GalaxyMarketReader {
  read(): GalaxyMarketInput;
}
