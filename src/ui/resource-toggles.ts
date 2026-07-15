type AnyRecord = Record<string, any>;

export interface ResourceToggleDependencies {
  getJQuery: () => any;
  getGame: () => AnyRecord;
  getSettingsRaw: () => AnyRecord;
  getResources: () => AnyRecord;
  getMarketManager: () => AnyRecord;
  getStorageManager: () => AnyRecord;
  addToggleCallbacks: (node: any, settingKey: string) => any;
}

export function createResourceToggleUI({
  getJQuery,
  getGame,
  getSettingsRaw,
  getResources,
  getMarketManager,
  getStorageManager,
  addToggleCallbacks,
}: ResourceToggleDependencies) {
  const dependencies = {
    getJQuery,
    getGame,
    getSettingsRaw,
    getResources,
    getMarketManager,
    getStorageManager,
    addToggleCallbacks,
  };
  function createMarketToggles() {
    const $ = dependencies.getJQuery();
    const game = dependencies.getGame();
    const settingsRaw = dependencies.getSettingsRaw();
    const resources = dependencies.getResources();
    removeMarketToggles();

    if (!game.global.race["no_trade"]) {
      $("#market .market-item[id] .res").width("5rem");
      $("#market .market-item[id] .buy span").text("B");
      $("#market .market-item[id] .sell span").text("S");
      $("#market .market-item[id] .trade > :first-child").text("R");
      $("#market .market-item[id] .trade .zero").text("×");
    }

    $("#market-qty").after(`
          <div class="market-item vb" id="script_market_top_row" style="overflow:hidden">
            <span style="margin-left: auto; margin-right: 0.2rem; float:right;">
              ${
                !game.global.race["no_trade"]
                  ? `
              <span class="has-text-success" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">Buy</span>
              <span class="has-text-danger" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">Sell</span>`
                  : ""
              }
              <span class="has-text-warning" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">In</span>
              <span class="has-text-warning" style="width: 2.75rem; display: inline-block; text-align: center;">Away</span>
            </span>
          </div>`);

    for (const resource of dependencies.getMarketManager().priorityList) {
      if (
        resource === resources.Food &&
        (game.global.race["artifical"] || game.global.race["fasting"])
      ) {
        continue;
      }
      const marketElement = $("#market-" + resource.id);
      if (marketElement.length > 0) {
        const marketRow = $(
          '<span class="ea-market-toggle" style="margin-left: auto; margin-right: 0.2rem; float:right;"></span>',
        );

        if (!game.global.race["no_trade"]) {
          const buyKey = "buy" + resource.id;
          const sellKey = "sell" + resource.id;
          marketRow.append(
            dependencies.addToggleCallbacks(
              $(
                `<label tabindex="0" title="Enable buying of this resource." class="switch"><input class="script_${buyKey}" type="checkbox"${
                  settingsRaw[buyKey] ? " checked" : ""
                }><span class="check" style="height:5px;"></span><span class="state"></span></label>`,
              ),
              buyKey,
            ),
            dependencies.addToggleCallbacks(
              $(
                `<label tabindex="0" title="Enable selling of this resource." class="switch"><input class="script_${sellKey}" type="checkbox"${
                  settingsRaw[sellKey] ? " checked" : ""
                }><span class="check" style="height:5px;"></span><span class="state"></span></label>`,
              ),
              sellKey,
            ),
          );
        }

        const tradeBuyKey = "res_trade_buy_" + resource.id;
        const tradeSellKey = "res_trade_sell_" + resource.id;
        marketRow.append(
          dependencies.addToggleCallbacks(
            $(
              `<label tabindex="0" title="Enable trading for this resource." class="switch"><input class="script_${tradeBuyKey}" type="checkbox"${
                settingsRaw[tradeBuyKey] ? " checked" : ""
              }><span class="check" style="height:5px;"></span><span class="state"></span></label>`,
            ),
            tradeBuyKey,
          ),
          dependencies.addToggleCallbacks(
            $(
              `<label tabindex="0" title="Enable trading this resource away." class="switch"><input class="script_${tradeSellKey}" type="checkbox"${
                settingsRaw[tradeSellKey] ? " checked" : ""
              }><span class="check" style="height:5px;"></span><span class="state"></span></label>`,
            ),
            tradeSellKey,
          ),
        );

        marketRow.appendTo(marketElement);
      }
    }
  }

  function removeMarketToggles() {
    const $ = dependencies.getJQuery();
    const game = dependencies.getGame();
    $("#market .ea-market-toggle").remove();
    $("#script_market_top_row").remove();

    if (!game.global.race["no_trade"]) {
      $("#market .market-item[id] .res").width("7.5rem");
      $("#market .market-item[id] .buy span").text(
        game.loc("resource_market_buy"),
      );
      $("#market .market-item[id] .sell span").text(
        game.loc("resource_market_sell"),
      );
      $("#market .market-item[id] .trade > :first-child").text(
        game.loc("resource_market_routes"),
      );
      $("#market .market-item[id] .trade .zero").text(
        game.loc("cancel_routes"),
      );
    }
  }

  function createStorageToggles() {
    const $ = dependencies.getJQuery();
    const settingsRaw = dependencies.getSettingsRaw();
    removeStorageToggles();

    $("#createHead").after(`
          <div class="market-item vb" id="script_storage_top_row" style="overflow:hidden">
            <span style="margin-left: auto; margin-right: 0.2rem; float:right;">
              <span class="has-text-warning" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">Auto</span>
              <span class="has-text-warning" style="width: 2.75rem; display: inline-block; text-align: center;">Over</span>
            </span>
          </div>`);

    for (const resource of dependencies.getStorageManager().priorityList) {
      const storageElement = $("#stack-" + resource.id);
      if (storageElement.length > 0) {
        const storeKey = "res_storage" + resource.id;
        const overKey = "res_storage_o_" + resource.id;
        $(
          `<span class="ea-storage-toggle" style="margin-left: auto; margin-right: 0.2rem; float:right;"></span>`,
        )
          .append(
            dependencies.addToggleCallbacks(
              $(
                `<label tabindex="0" title="Enable storing of this resource." class="switch"><input class="script_${storeKey}" type="checkbox"${
                  settingsRaw[storeKey] ? " checked" : ""
                }><span class="check" style="height:5px;"></span><span class="state"></span></label>`,
              ),
              storeKey,
            ),
            dependencies.addToggleCallbacks(
              $(
                `<label tabindex="0" title="Enable storing overflow of this resource." class="switch"><input class="script_${overKey}" type="checkbox"${
                  settingsRaw[overKey] ? " checked" : ""
                }><span class="check" style="height:5px;"></span><span class="state"></span></label>`,
              ),
              overKey,
            ),
          )
          .appendTo(storageElement);
      }
    }
  }

  function removeStorageToggles() {
    const $ = dependencies.getJQuery();
    $("#resStorage .ea-storage-toggle").remove();
    $("#script_storage_top_row").remove();
  }

  return {
    createMarketToggles,
    removeMarketToggles,
    createStorageToggles,
    removeStorageToggles,
  };
}
