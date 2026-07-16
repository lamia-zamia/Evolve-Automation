type AnyRecord = Record<string, any>;

type InfrastructureManagerDependencies = {
  getDocument: () => AnyRecord;
  getGame: () => AnyRecord;
  getSettings: () => AnyRecord;
  getPoly: () => AnyRecord;
  getWin: () => AnyRecord;
  getNeedSandboxBypass: () => boolean;
  getUnsafeWindow: () => unknown;
  getKeyboardEvent: () => new (type: string, init: AnyRecord) => unknown;
  cloneInto: (...args: any[]) => any;
};

export function createInfrastructureManagers({
  getDocument,
  getGame,
  getSettings,
  getPoly,
  getWin,
  getNeedSandboxBypass,
  getUnsafeWindow,
  getKeyboardEvent,
  cloneInto,
}: InfrastructureManagerDependencies) {
  let document: AnyRecord;
  let game: AnyRecord;
  let settings: AnyRecord;
  let poly: AnyRecord;
  let win: AnyRecord;
  let needSandboxBypass: boolean;
  let unsafeWindow: unknown;
  let KeyboardEvent: new (type: string, init: AnyRecord) => unknown;

  function refreshContext() {
    document = getDocument();
    game = getGame();
    settings = getSettings();
    poly = getPoly();
    win = getWin();
    needSandboxBypass = getNeedSandboxBypass();
    unsafeWindow = getUnsafeWindow();
    KeyboardEvent = getKeyboardEvent();
  }

  const WindowManager: AnyRecord = {
    openedByScript: false,
    _callbackWindowTitle: "",
    _callbackFunction: null,

    currentModalWindowTitle() {
      let modalTitleNode = document.getElementById("modalBoxTitle");
      if (modalTitleNode === null) {
        return "";
      }

      // Modal title will either be a single name or a combination of resource and storage
      // eg. single name "Smelter" or "Factory"
      // eg. combination "Iridium - 26.4K/279.9K"
      let indexOfDash = modalTitleNode.textContent.indexOf(" - ");
      if (indexOfDash === -1) {
        return modalTitleNode.textContent;
      } else {
        return modalTitleNode.textContent.substring(0, indexOfDash);
      }
    },

    openModalWindowWithCallback(
      elementToClick,
      callbackWindowTitle,
      callbackFunction,
    ) {
      if (this.isOpen()) {
        return;
      }

      this.openedByScript = true;
      this._callbackWindowTitle = callbackWindowTitle;
      this._callbackFunction = callbackFunction;
      elementToClick.click();
    },

    isOpen() {
      // Checks both the game modal window and our script modal window
      // game = modalBox
      // script = scriptModal
      return (
        this.openedByScript ||
        document.getElementById("modalBox") !== null ||
        document.getElementById("scriptModal")?.style.display === "block"
      );
    },

    checkCallbacks() {
      // We only care if the script itself opened the modal. If the user did it then ignore it.
      // There must be a call back function otherwise there is nothing to do.
      if (
        WindowManager.currentModalWindowTitle() ===
          WindowManager._callbackWindowTitle &&
        WindowManager.openedByScript &&
        WindowManager._callbackFunction
      ) {
        WindowManager._callbackFunction();

        let modalCloseBtn = document.querySelector(".modal .modal-close");
        if (modalCloseBtn !== null) {
          modalCloseBtn.click();
        }
      } else {
        // If we hid users's modal - show it back
        let modal = document.querySelector(".modal");
        if (modal !== null) {
          modal.style.display = "";
        }
      }

      WindowManager.openedByScript = false;
      WindowManager._callbackWindowTitle = "";
      WindowManager._callbackFunction = null;
    },
  };

  const KeyManager: AnyRecord = {
    _setFn: null,
    _unsetFn: null,
    _allFn: null,
    _eventProp: {
      Shift: "shiftKey",
      Control: "ctrlKey",
      Alt: "altKey",
      Meta: "metaKey",
    },
    _state: { x100: undefined, x25: undefined, x10: undefined },
    _mode: "none",

    init() {
      let events = win.$._data(win.document).events;
      let set = events?.keydown?.[0]?.handler ?? null;
      let unset = events?.keyup?.[0]?.handler ?? null;
      let all = events?.mousemove?.[0]?.handler ?? null;

      if (!all && (!set || !unset)) {
        // Fallback, if there's no handlers in JQuery data
        this._setFn = (e) =>
          document.dispatchEvent(new KeyboardEvent("keydown", e));
        this._unsetFn = (e) =>
          document.dispatchEvent(new KeyboardEvent("keyup", e));
        this._allFn = null;
      } else if (needSandboxBypass) {
        // FF fix
        this._setFn = (e) => set(cloneInto(e, unsafeWindow));
        this._unsetFn = (e) => unset(cloneInto(e, unsafeWindow));
        this._allFn = (e) => all(cloneInto(e, unsafeWindow));
      } else {
        this._setFn = set;
        this._unsetFn = unset;
        this._allFn = all;
      }
    },

    reset() {
      this._state.x100 = undefined;
      this._state.x25 = undefined;
      this._state.x10 = undefined;

      let map = game.global.settings.keyMap;
      let keys = Object.values(map);
      let uniq = ["x100", "x25", "x10"].every(
        (key) => keys.indexOf(map[key]) === keys.lastIndexOf(map[key]),
      );

      if (!game.global.settings.mKeys) {
        this._mode = "none";
      } else if (!uniq) {
        this._mode = "unset";
      } else if (
        this._allFn &&
        ["x100", "x25", "x10"].every((key) =>
          ["Shift", "Control", "Alt", "Meta"].includes(
            game.global.settings.keyMap[key],
          ),
        )
      ) {
        this._mode = "all";
      } else {
        this._mode = "each";
      }
    },

    finish() {
      if (this._state.x100 || this._state.x25 || this._state.x10) {
        this.set(false, false, false);
      }
    },

    setKey(key, pressed) {
      if (this._state[key] === pressed) {
        return;
      }
      let fakeEvent = { key: game.global.settings.keyMap[key] };
      if (pressed) {
        this._setFn(fakeEvent);
      } else {
        this._unsetFn(fakeEvent);
      }
      this._state[key] = pressed;
    },

    set(x100, x25, x10) {
      if (this._mode === "all") {
        let map = game.global.settings.keyMap;
        let fakeEvent = {
          [this._eventProp[map.x100]]: (this._state.x100 = x100),
          [this._eventProp[map.x25]]: (this._state.x25 = x25),
          [this._eventProp[map.x10]]: (this._state.x10 = x10),
        };
        this._allFn(fakeEvent);
      } else if (this._mode === "each" || this._mode === "unset") {
        this.setKey("x100", x100);
        this.setKey("x25", x25);
        this.setKey("x10", x10);
      }
    },

    *click(amount) {
      if (this._mode === "none") {
        while (amount > 0) {
          yield (amount -= 1);
        }
      } else if (this._mode === "unset") {
        this.set(false, false, false);
        while (amount > 0) {
          yield (amount -= 1);
        }
      } else {
        while (amount > 0) {
          if (amount >= 25000) {
            this.set(true, true, true);
            yield (amount -= 25000);
          } else if (amount >= 2500) {
            this.set(true, true, false);
            yield (amount -= 2500);
          } else if (amount >= 1000) {
            this.set(true, false, true);
            yield (amount -= 1000);
          } else if (amount >= 250) {
            this.set(false, true, true);
            yield (amount -= 250);
          } else if (amount >= 100) {
            this.set(true, false, false);
            yield (amount -= 100);
          } else if (amount >= 25) {
            this.set(false, true, false);
            yield (amount -= 25);
          } else if (amount >= 10) {
            this.set(false, false, true);
            yield (amount -= 10);
          } else {
            this.set(false, false, false);
            yield (amount -= 1);
          }
        }
      }
    },
  };

  const GameLog: AnyRecord = {
    Types: {
      special: "Specials",
      construction: "Construction",
      multi_construction: "Multi-part Construction",
      arpa: "A.R.P.A Progress",
      research: "Research",
      spying: "Spying",
      attack: "Attack",
      mercenary: "Mercenaries",
      mech_build: "Mech Build",
      mech_scrap: "Mech Scrap",
      outer_fleet: "True Path Fleet",
      mutation: "Mutations",
      prestige: "Prestige",
    },

    logInfo(loggingType, text, tags) {
      if (!settings.logEnabled || !settings["log_" + loggingType]) {
        return;
      }

      poly.messageQueue(text, "info", false, tags);
    },

    logSuccess(loggingType, text, tags) {
      if (!settings.logEnabled || !settings["log_" + loggingType]) {
        return;
      }

      poly.messageQueue(text, "success", false, tags);
    },

    logWarning(loggingType, text, tags) {
      if (!settings.logEnabled || !settings["log_" + loggingType]) {
        return;
      }

      poly.messageQueue(text, "warning", false, tags);
    },

    logDanger(loggingType, text, tags) {
      if (!settings.logEnabled || !settings["log_" + loggingType]) {
        return;
      }

      poly.messageQueue(text, "danger", false, tags);
    },
  };

  for (const manager of [WindowManager, KeyManager, GameLog]) {
    for (const key of Reflect.ownKeys(manager)) {
      const descriptor = Object.getOwnPropertyDescriptor(manager, key);
      if (!descriptor || typeof descriptor.value !== "function") {
        continue;
      }
      const method = descriptor.value;
      Object.defineProperty(manager, key, {
        ...descriptor,
        value: function (this: AnyRecord, ...args: any[]) {
          refreshContext();
          return method.apply(this, args);
        },
      });
    }
  }

  return { WindowManager, KeyManager, GameLog };
}
