import assert from "node:assert/strict";
import { createGameMarketControls } from "../src/adapters/browser/game-market-controls.ts";

let views = {};
const steps = [];
const calls = [];
const controls = createGameMarketControls({
  getVueById: (elementId) => views[elementId],
  clickSteps: (count) => {
    steps.push(count);
    return Array.from({ length: Math.max(count, 0) }, (_, index) => index);
  },
});

function row(elementId) {
  return {
    _id: elementId,
    purchase(...args) {
      calls.push(["purchase", args, this === views[this._id]]);
    },
    sell(...args) {
      calls.push(["sell", args, this === views[this._id]]);
    },
    zero(...args) {
      calls.push(["zero", args, this === views[this._id]]);
    },
    autoBuy(...args) {
      calls.push(["autoBuy", args, this === views[this._id]]);
    },
    autoSell(...args) {
      calls.push(["autoSell", args, this === views[this._id]]);
    },
  };
}

// A row the game has not rendered answers nothing, performs no calls, and
// never touches the click-multiplier keys.
assert.equal(controls.isRowRendered("market-Iron"), false);
const missing = { elementId: "market-Iron", id: "Iron" };
assert.equal(controls.buy(missing), false);
assert.equal(controls.sell(missing), false);
assert.equal(controls.clearTradeRoutes(missing), false);
assert.equal(controls.addTradeRoutes({ ...missing, count: 2 }), false);
assert.equal(controls.removeTradeRoutes({ ...missing, count: 2 }), false);
assert.deepEqual(steps, []);
assert.deepEqual(calls, []);

// A mounted component missing the row's method is just as unusable.
views["market-Iron"] = { purchase: row("market-Iron").purchase };
assert.equal(controls.isRowRendered("market-Iron"), true);
assert.equal(controls.sell(missing), false);
assert.equal(controls.addTradeRoutes({ ...missing, count: 2 }), false);
assert.deepEqual(steps, []);
assert.deepEqual(calls, []);

// A trade calls the row's method once, passing the resource id as the only
// argument, with the component as the receiver.
views["market-Iron"] = row("market-Iron");
calls.length = 0;
assert.equal(controls.buy(missing), true);
assert.equal(controls.sell(missing), true);
assert.equal(controls.clearTradeRoutes(missing), true);
assert.deepEqual(calls, [
  ["purchase", ["Iron"], true],
  ["sell", ["Iron"], true],
  ["zero", ["Iron"], true],
]);
// Trading never runs the click-multiplier sequence: one call is one trade of
// the shared quantity, not one click per unit.
assert.deepEqual(steps, []);

// Routes call the row's method once per click step.
calls.length = 0;
assert.equal(controls.addTradeRoutes({ ...missing, count: 2 }), true);
assert.equal(controls.removeTradeRoutes({ ...missing, count: 1 }), true);
assert.deepEqual(calls, [
  ["autoBuy", ["Iron"], true],
  ["autoBuy", ["Iron"], true],
  ["autoSell", ["Iron"], true],
]);
assert.deepEqual(steps, [2, 1]);

// A count of zero or less is the step sequence's business, so the port still
// asks it and simply performs no call.
steps.length = 0;
calls.length = 0;
assert.equal(controls.addTradeRoutes({ ...missing, count: 0 }), true);
assert.deepEqual(calls, []);
assert.deepEqual(steps, [0]);

// Rows stay distinct: one resource's row never answers another's.
views["market-Copper"] = row("market-Copper");
calls.length = 0;
assert.equal(controls.buy({ elementId: "market-Copper", id: "Copper" }), true);
assert.deepEqual(calls, [["purchase", ["Copper"], true]]);

// ---------- the shared trade quantity ----------

// Without the control the game trades the smallest quantity, and there is
// nothing to set.
delete views["market-qty"];
assert.equal(controls.maxMultiplier(), 1);
assert.equal(controls.setMultiplier(100), false);

// A control that reports no usable ceiling is treated the same way.
views["market-qty"] = { qty: 0 };
assert.equal(controls.maxMultiplier(), 1);
views["market-qty"] = { qty: 0, limit: () => Number.NaN };
assert.equal(controls.maxMultiplier(), 1);

// A mounted control reports its ceiling and takes the quantity.
let limitReceiver;
views["market-qty"] = {
  qty: 0,
  limit() {
    limitReceiver = this;
    return 1000;
  },
};
assert.equal(controls.maxMultiplier(), 1000);
assert.equal(limitReceiver, views["market-qty"]);
assert.equal(controls.setMultiplier(250), true);
assert.equal(views["market-qty"].qty, 250);

console.log("Game market controls tests passed");
