import type {
  MarketToggleItem,
  MarketToggleView,
  StorageToggleItem,
  StorageToggleView,
} from "../../domain/economy/resources/resource-toggles.ts";
import type { ResourceToggleReader } from "../../ports/resource-toggles.ts";

interface JQueryNode {
  readonly length: number;
  after(content: unknown): JQueryNode;
  append(...content: readonly unknown[]): JQueryNode;
  appendTo(target: JQueryNode): JQueryNode;
  remove(): JQueryNode;
  text(content: string): JQueryNode;
  width(value: string): JQueryNode;
}

type JQuery = (selector: unknown) => JQueryNode;

export interface ResourceToggleBrowserDependencies {
  readonly getJQuery: () => JQuery;
  readonly reader: ResourceToggleReader;
  readonly addToggleCallbacks: (
    node: JQueryNode,
    settingKey: string,
  ) => JQueryNode;
}

export interface ResourceToggleBrowserAdapter {
  createMarketToggles(): void;
  removeMarketToggles(): void;
  createStorageToggles(): void;
  removeStorageToggles(): void;
}

function createMarketHeader(view: MarketToggleView): string {
  return `
          <div class="market-item vb" id="script_market_top_row" style="overflow:hidden">
            <span style="margin-left: auto; margin-right: 0.2rem; float:right;">
              ${
                !view.noTrade
                  ? `
              <span class="has-text-success" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">Buy</span>
              <span class="has-text-danger" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">Sell</span>`
                  : ""
              }
              <span class="has-text-warning" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">In</span>
              <span class="has-text-warning" style="width: 2.75rem; display: inline-block; text-align: center;">Away</span>
            </span>
          </div>`;
}

function createMarketToggleMarkup(
  title: string,
  settingKey: string,
  enabled: boolean,
): string {
  return `<label tabindex="0" title="${title}" class="switch"><input class="script_${settingKey}" type="checkbox"${
    enabled ? " checked" : ""
  }><span class="check" style="height:5px;"></span><span class="state"></span></label>`;
}

function createStorageToggleMarkup(
  title: string,
  settingKey: string,
  enabled: boolean,
): string {
  return createMarketToggleMarkup(title, settingKey, enabled);
}

function createMarketRow(
  view: MarketToggleView,
  item: MarketToggleItem,
  jquery: JQuery,
  addToggleCallbacks: ResourceToggleBrowserDependencies["addToggleCallbacks"],
): JQueryNode {
  const marketRow = jquery(
    '<span class="ea-market-toggle" style="margin-left: auto; margin-right: 0.2rem; float:right;"></span>',
  );
  if (!view.noTrade) {
    marketRow.append(
      addToggleCallbacks(
        jquery(
          createMarketToggleMarkup(
            "Enable buying of this resource.",
            item.buyKey,
            item.buyEnabled,
          ),
        ),
        item.buyKey,
      ),
      addToggleCallbacks(
        jquery(
          createMarketToggleMarkup(
            "Enable selling of this resource.",
            item.sellKey,
            item.sellEnabled,
          ),
        ),
        item.sellKey,
      ),
    );
  }
  marketRow.append(
    addToggleCallbacks(
      jquery(
        createMarketToggleMarkup(
          "Enable trading for this resource.",
          item.tradeBuyKey,
          item.tradeBuyEnabled,
        ),
      ),
      item.tradeBuyKey,
    ),
    addToggleCallbacks(
      jquery(
        createMarketToggleMarkup(
          "Enable trading this resource away.",
          item.tradeSellKey,
          item.tradeSellEnabled,
        ),
      ),
      item.tradeSellKey,
    ),
  );
  return marketRow;
}

function createStorageRow(
  item: StorageToggleItem,
  jquery: JQuery,
  addToggleCallbacks: ResourceToggleBrowserDependencies["addToggleCallbacks"],
): JQueryNode {
  return jquery(
    '<span class="ea-storage-toggle" style="margin-left: auto; margin-right: 0.2rem; float:right;"></span>',
  ).append(
    addToggleCallbacks(
      jquery(
        createStorageToggleMarkup(
          "Enable storing of this resource.",
          item.storeKey,
          item.storeEnabled,
        ),
      ),
      item.storeKey,
    ),
    addToggleCallbacks(
      jquery(
        createStorageToggleMarkup(
          "Enable storing overflow of this resource.",
          item.overKey,
          item.overEnabled,
        ),
      ),
      item.overKey,
    ),
  );
}

export function createResourceToggleBrowserAdapter({
  getJQuery,
  reader,
  addToggleCallbacks,
}: ResourceToggleBrowserDependencies): ResourceToggleBrowserAdapter {
  function createMarketToggles(): void {
    removeMarketToggles();
    const jquery = getJQuery();
    const view = reader.readMarket();
    if (!view.noTrade) {
      jquery("#market .market-item[id] .res").width("5rem");
      jquery("#market .market-item[id] .buy span").text("B");
      jquery("#market .market-item[id] .sell span").text("S");
      jquery("#market .market-item[id] .trade > :first-child").text("R");
      jquery("#market .market-item[id] .trade .zero").text("×");
    }
    jquery("#market-qty").after(createMarketHeader(view));
    for (const item of view.items) {
      const marketElement = jquery(`#market-${item.resourceId}`);
      if (marketElement.length === 0) continue;
      createMarketRow(view, item, jquery, addToggleCallbacks).appendTo(
        marketElement,
      );
    }
  }

  function removeMarketToggles(): void {
    const jquery = getJQuery();
    const view = reader.readMarket();
    jquery("#market .ea-market-toggle").remove();
    jquery("#script_market_top_row").remove();
    if (!view.noTrade) {
      jquery("#market .market-item[id] .res").width("7.5rem");
      jquery("#market .market-item[id] .buy span").text(view.labels.buy);
      jquery("#market .market-item[id] .sell span").text(view.labels.sell);
      jquery("#market .market-item[id] .trade > :first-child").text(
        view.labels.routes,
      );
      jquery("#market .market-item[id] .trade .zero").text(
        view.labels.cancelRoutes,
      );
    }
  }

  function createStorageToggles(): void {
    removeStorageToggles();
    const jquery = getJQuery();
    const view = reader.readStorage();
    jquery("#createHead").after(`
          <div class="market-item vb" id="script_storage_top_row" style="overflow:hidden">
            <span style="margin-left: auto; margin-right: 0.2rem; float:right;">
              <span class="has-text-warning" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">Auto</span>
              <span class="has-text-warning" style="width: 2.75rem; display: inline-block; text-align: center;">Over</span>
            </span>
          </div>`);
    for (const item of view.items) {
      const storageElement = jquery(`#stack-${item.resourceId}`);
      if (storageElement.length === 0) continue;
      createStorageRow(item, jquery, addToggleCallbacks).appendTo(
        storageElement,
      );
    }
  }

  function removeStorageToggles(): void {
    const jquery = getJQuery();
    jquery("#resStorage .ea-storage-toggle").remove();
    jquery("#script_storage_top_row").remove();
  }

  return Object.freeze({
    createMarketToggles,
    removeMarketToggles,
    createStorageToggles,
    removeStorageToggles,
  });
}
