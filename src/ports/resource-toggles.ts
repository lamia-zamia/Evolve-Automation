import type {
  MarketToggleView,
  StorageToggleView,
} from "../domain/resource-toggles.ts";

export interface ResourceToggleReader {
  readMarket(): MarketToggleView;
  readStorage(): StorageToggleView;
}
