import type {
  MarketToggleView,
  StorageToggleView,
} from "../domain/economy/resources/resource-toggles.ts";

export interface ResourceToggleReader {
  readMarket(): MarketToggleView;
  readStorage(): StorageToggleView;
}
