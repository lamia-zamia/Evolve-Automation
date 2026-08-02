import assert from "node:assert/strict";
import { createInfrastructureManagers } from "../src/game/infrastructure-managers.ts";

let game;
let settings;
let poly;
let win;
let needSandboxBypass = false;
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

const { KeyManager, GameLog } = createInfrastructureManagers({
  getDocument: () => documentStub,
  getGame: () => game,
  getSettings: () => settings,
  getPoly: () => poly,
  getWin: () => win,
  getNeedSandboxBypass: () => needSandboxBypass,
  getKeyboardEvent: () => KeyboardEventStub,
  cloneIntoPage: (value) => {
    trace.push(["clone", value.key ?? "all"]);
    return value;
  },
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
win = { document: documentStub, $: { _data: () => ({ events: {} }) } };

// No jQuery handlers uses synthetic keyboard events and mKeys=false selects none.
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

// Firefox sandbox path clones key events and uses the live handlers.
const events = {
  keydown: [{ handler: (event) => trace.push(["down", event.key]) }],
  keyup: [{ handler: (event) => trace.push(["up", event.key]) }],
  mousemove: [{ handler: (event) => trace.push(["all", event.shiftKey]) }],
};
win.$._data = () => ({ events });
needSandboxBypass = true;
KeyManager.init();
game.global.settings.keyMap = {
  x100: "Shift",
  x25: "Control",
  x10: "Alt",
};
KeyManager.reset();
assert.equal(KeyManager._mode, "all");
KeyManager.set(true, false, false);
assert.deepEqual(trace.splice(0), [
  ["clone", "all"],
  ["all", true],
]);

// Log settings and compatibility object resolve live on each call.
GameLog.logInfo("special", "hidden", []);
assert.deepEqual(trace, []);
settings = { logEnabled: true, log_special: true };
poly = { messageQueue: (...args) => trace.push(args) };
GameLog.logSuccess("special", "shown", ["x"]);
assert.deepEqual(trace, [["shown", "success", false, ["x"]]]);

console.log("Infrastructure manager tests passed");
