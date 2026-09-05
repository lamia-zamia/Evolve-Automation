import assert from "node:assert/strict";
import { createGameKeyboardHandlers } from "../src/adapters/browser/game-keyboard-handlers.ts";
import { createInfrastructureManagers } from "../src/game/infrastructure-managers.ts";

let game;
let settings;
let poly;
const trace = [];
const documentStub = {
  dispatchEvent: (event) => trace.push(["dispatch", event.type, event.key]),
};
class KeyboardEventStub {
  constructor(type, init) {
    this.type = type;
    Object.assign(this, init);
  }
}

const gameKeyboardHandlers = createGameKeyboardHandlers({
  getDocument: () => documentStub,
  getKeyboardEvent: () => KeyboardEventStub,
});

const { KeyManager, GameLog } = createInfrastructureManagers({
  getGame: () => game,
  getSettings: () => settings,
  getPoly: () => poly,
  getKeyboardHandlers: () => gameKeyboardHandlers,
});

game = {
  global: {
    settings: {
      mKeys: false,
      keyMap: { x100: "Shift", x25: "Control", x10: "Alt" },
    },
  },
};
settings = { logEnabled: false, log_special: true };
poly = { messageQueue: (...args) => trace.push(["message", ...args]) };
// Synthetic keyboard events with mKeys=false selects no modifier handling at all.
KeyManager.init();
KeyManager.reset();
assert.equal(KeyManager._mode, "none");
assert.deepEqual([...KeyManager.click(3)], [2, 1, 0]);

// Duplicate mappings select unset and clear keys before ordinary clicks.
game.global.settings.mKeys = true;
game.global.settings.keyMap = {
  x100: "Shift",
  x25: "Shift",
  x10: "Alt",
};
KeyManager.reset();
assert.equal(KeyManager._mode, "unset");
assert.deepEqual([...KeyManager.click(1)], [0]);
assert.deepEqual(trace.splice(0), [
  ["dispatch", "keyup", "Shift"],
  ["dispatch", "keyup", "Shift"],
  ["dispatch", "keyup", "Alt"],
]);

// The game exposes no combined modifier binding, so distinct mappings drive each key on its own.
KeyManager.init();
game.global.settings.keyMap = {
  x100: "Shift",
  x25: "Control",
  x10: "Alt",
};
KeyManager.reset();
assert.equal(KeyManager._mode, "each");
KeyManager.set(true, false, false);
assert.deepEqual(trace.splice(0), [
  ["dispatch", "keydown", "Shift"],
  ["dispatch", "keyup", "Control"],
  ["dispatch", "keyup", "Alt"],
]);

// Log settings and compatibility object resolve live on each call.
GameLog.logInfo("special", "hidden", []);
assert.deepEqual(trace, []);
settings = { logEnabled: true, log_special: true };
poly = { messageQueue: (...args) => trace.push(args) };
GameLog.logSuccess("special", "shown", ["x"]);
assert.deepEqual(trace, [["shown", "success", false, ["x"]]]);

console.log("Infrastructure manager tests passed");
