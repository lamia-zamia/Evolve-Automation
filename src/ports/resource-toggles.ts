import type {
  MarketToggleView,
  StorageToggleView,
} from "../domain/economy/resources/resource-toggles.ts";

export interface ResourceToggleReader {
  readMarket(): MarketToggleView;
  readStorage(): StorageToggleView;
}

/** The storage half of the resource toggles, ported independently of the market half. */
export interface StorageToggleReader {
  readStorage(): StorageToggleView;
}
