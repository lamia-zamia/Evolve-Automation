import assert from "node:assert/strict";

import { createPage } from "../../support/fixtures/settings-panel-fixture.mjs";
import { element } from "../../support/fixtures/dom-fixture.mjs";

function appendMarketPanel(page) {
  const quantity = element("div", { id: "market-qty" });
  const market = element("div", { id: "market" });
  const row = element("div", { id: "market-Food" });
  row.classList.add("market-item");

  const resourceName = element("span");
  resourceName.classList.add("res");
  row.appendChild(resourceName);

  for (const [className, label] of [
    ["buy", "Buy"],
    ["sell", "Sell"],
  ]) {
    const action = element("span");
    action.classList.add(className);
    const actionLabel = element("span");
    actionLabel.textContent = label;
    action.appendChild(actionLabel);
    row.appendChild(action);
  }

  const trade = element("span");
  trade.classList.add("trade");
  const routeLabel = element("span");
  routeLabel.textContent = "Route";
  const cancelLabel = element("span");
  cancelLabel.classList.add("zero");
  cancelLabel.textContent = "Cancel";
  trade.appendChild(routeLabel);
  trade.appendChild(cancelLabel);
  row.appendChild(trade);
  market.appendChild(row);

  page.root.appendChild(quantity);
  page.root.appendChild(market);
  return market;
}

function readMarketLabels(page) {
  return [
    page.root.querySelector("#market .buy span").textContent,
    page.root.querySelector("#market .sell span").textContent,
    page.root.querySelector("#market .trade > :first-child").textContent,
    page.root.querySelector("#market .trade .zero").textContent,
  ];
}

{
  let gameRootReads = 0;
  const page = createPage(
    JSON.stringify({ showSettings: true, autoMarket: false }),
    {
      allSections: true,
      onGameRootRead: () => gameRootReads++,
    },
  );
  appendMarketPanel(page);
  page.panel.ensurePanel();

  const afterInitialReconciliation = gameRootReads;
  page.panel.ensurePanel();
  page.panel.ensurePanel();
  page.panel.ensurePanel();
  assert.equal(
    gameRootReads,
    afterInitialReconciliation,
    "disabled Market cleanup must not reread the model on steady-state ticks",
  );

  const marketToggle = page.root.querySelector(".script_autoMarket");
  marketToggle.checked = true;
  marketToggle.dispatch("change");
  assert.ok(
    gameRootReads > afterInitialReconciliation,
    "enabling Market reconciles its captured model once",
  );
  assert.deepEqual(readMarketLabels(page), ["B", "S", "R", "×"]);
  const afterEnable = gameRootReads;
  page.panel.ensurePanel();
  page.panel.ensurePanel();
  assert.equal(gameRootReads, afterEnable);

  marketToggle.checked = false;
  marketToggle.dispatch("change");
  assert.deepEqual(readMarketLabels(page), ["Buy", "Sell", "Route", "Cancel"]);
  const afterDisable = gameRootReads;
  page.panel.ensurePanel();
  page.panel.ensurePanel();
  assert.equal(
    gameRootReads,
    afterDisable,
    "Market restore runs on the enabled-to-disabled transition only",
  );
}

// A captured redraw dirties only the Market reconciliation and restores the clean native panel.
{
  let gameRootReads = 0;
  const page = createPage(
    JSON.stringify({ showSettings: true, autoMarket: true }),
    {
      allSections: true,
      onGameRootRead: () => gameRootReads++,
    },
  );
  let market = appendMarketPanel(page);
  page.panel.ensurePanel();
  assert.equal(page.root.querySelectorAll("#script_market_top_row").length, 1);

  market.remove();
  market = appendMarketPanel(page);
  page.notifyGameBinding("market-qty");
  const beforeRedrawRecovery = gameRootReads;
  page.panel.ensurePanel();
  assert.equal(gameRootReads, beforeRedrawRecovery + 1);
  assert.equal(page.root.querySelectorAll("#script_market_top_row").length, 1);

  // The panel can be absent at the disabled transition. Its later native draw wakes the pending
  // cleanup, which completes without reading Market state because the recreated panel is clean.
  const marketToggle = page.root.querySelector(".script_autoMarket");
  market.remove();
  marketToggle.checked = false;
  marketToggle.dispatch("change");
  const whileMarketAbsent = gameRootReads;
  page.panel.ensurePanel();
  page.panel.ensurePanel();
  assert.equal(gameRootReads, whileMarketAbsent);

  appendMarketPanel(page);
  page.notifyGameBinding("market-qty");
  page.panel.ensurePanel();
  assert.equal(page.root.querySelectorAll("#script_market_top_row").length, 0);
  assert.deepEqual(readMarketLabels(page), ["Buy", "Sell", "Route", "Cancel"]);
  const afterDisabledRedraw = gameRootReads;
  page.panel.ensurePanel();
  page.panel.ensurePanel();
  assert.equal(gameRootReads, afterDisabledRedraw);
}

// Import replaces the raw record and invalidates settings reconciliation before the next draw.
{
  let gameRootReads = 0;
  const page = createPage(
    JSON.stringify({ showSettings: true, autoMarket: false }),
    {
      allSections: true,
      onGameRootRead: () => gameRootReads++,
    },
  );
  appendMarketPanel(page);
  page.panel.ensurePanel();
  const beforeImport = gameRootReads;
  page.saveText.value = JSON.stringify({
    showSettings: true,
    autoMarket: true,
  });
  page.root.querySelector("#script_settingsImport").dispatch("click");
  assert.equal(page.settings.readRaw().autoMarket, true);
  page.panel.ensurePanel();
  assert.ok(gameRootReads > beforeImport);
  assert.equal(page.root.querySelectorAll("#script_market_top_row").length, 1);
  const afterImportReconciliation = gameRootReads;
  page.panel.ensurePanel();
  page.panel.ensurePanel();
  assert.equal(gameRootReads, afterImportReconciliation);
}

console.log("captured-settings-panel-reconciliation passed");
