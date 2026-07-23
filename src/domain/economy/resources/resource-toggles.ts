export interface MarketToggleItem {
  readonly resourceId: string;
  readonly buyKey: string;
  readonly sellKey: string;
  readonly tradeBuyKey: string;
  readonly tradeSellKey: string;
  readonly buyEnabled: boolean;
  readonly sellEnabled: boolean;
  readonly tradeBuyEnabled: boolean;
  readonly tradeSellEnabled: boolean;
}

export interface MarketToggleView {
  readonly noTrade: boolean;
  readonly labels: Readonly<{
    buy: string;
    sell: string;
    routes: string;
    cancelRoutes: string;
  }>;
  readonly items: readonly MarketToggleItem[];
}

export interface StorageToggleItem {
  readonly resourceId: string;
  readonly storeKey: string;
  readonly overKey: string;
  readonly storeEnabled: boolean;
  readonly overEnabled: boolean;
}

export interface StorageToggleView {
  readonly items: readonly StorageToggleItem[];
}
