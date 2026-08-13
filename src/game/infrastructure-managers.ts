import type { GameKeyboardHandlersPort } from "../ports/game-keyboard-handlers.ts";

type XKey = "x100" | "x25" | "x10";
type KeyMode = "none" | "unset" | "all" | "each";
type ModifierKey = "Shift" | "Control" | "Alt" | "Meta";
type ModifierEvent = Record<string, boolean>;

type GameSurface = {
  global: {
    settings: {
      keyMap: Record<XKey, ModifierKey>;
      mKeys: boolean;
    };
  };
};

type SettingsSurface = { logEnabled: boolean } & Record<string, unknown>;

type PolySurface = {
  messageQueue: (
    text: string,
    level: string,
    always: boolean,
    tags: string[],
  ) => void;
};

type KeyManagerShape = {
  _setFn: ((event: unknown) => void) | null;
  _unsetFn: ((event: unknown) => void) | null;
  _allFn: ((event: ModifierEvent) => void) | null;
  _eventProp: Record<ModifierKey, string>;
  _state: Record<XKey, boolean | undefined>;
  _mode: KeyMode;
  init(): void;
  reset(): void;
  finish(): void;
  setKey(key: XKey, pressed: boolean): void;
  set(x100: boolean, x25: boolean, x10: boolean): void;
  click(amount: number): Generator<number, void, number>;
};

type GameLogShape = {
  Types: Record<string, string>;
  logInfo(loggingType: string, text: string, tags: string[]): void;
  logSuccess(loggingType: string, text: string, tags: string[]): void;
  logWarning(loggingType: string, text: string, tags: string[]): void;
  logDanger(loggingType: string, text: string, tags: string[]): void;
};

type InfrastructureManagerDependencies = {
  getGame: () => GameSurface;
  getSettings: () => SettingsSurface;
  getPoly: () => PolySurface;
  getKeyboardHandlers: () => GameKeyboardHandlersPort;
};

export function createInfrastructureManagers({
  getGame,
  getSettings,
  getPoly,
  getKeyboardHandlers,
}: InfrastructureManagerDependencies) {
  let game: GameSurface;
  let settings: SettingsSurface;
  let poly: PolySurface;

  function refreshContext() {
    game = getGame();
    settings = getSettings();
    poly = getPoly();
  }

  const KeyManager: KeyManagerShape = {
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
      const handlers = getKeyboardHandlers().readGameKeyboardHandlers();
      this._setFn = handlers.keyDown;
      this._unsetFn = handlers.keyUp;
      this._allFn = handlers.moveAll;
    },

    reset() {
      this._state.x100 = undefined;
      this._state.x25 = undefined;
      this._state.x10 = undefined;

      let map = game.global.settings.keyMap;
      let keys = Object.values(map);
      let uniq = (["x100", "x25", "x10"] as XKey[]).every(
        (key) => keys.indexOf(map[key]) === keys.lastIndexOf(map[key]),
      );

      if (!game.global.settings.mKeys) {
        this._mode = "none";
      } else if (!uniq) {
        this._mode = "unset";
      } else if (
        this._allFn &&
        (["x100", "x25", "x10"] as XKey[]).every((key) =>
          ["Shift", "Control", "Alt", "Meta"].includes(map[key]),
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

    setKey(key: XKey, pressed: boolean) {
      if (this._state[key] === pressed) {
        return;
      }
      let fakeEvent = { key: game.global.settings.keyMap[key] };
      if (pressed) {
        this._setFn?.(fakeEvent);
      } else {
        this._unsetFn?.(fakeEvent);
      }
      this._state[key] = pressed;
    },

    set(x100: boolean, x25: boolean, x10: boolean) {
      if (this._mode === "all") {
        let map = game.global.settings.keyMap;
        let fakeEvent = {
          [this._eventProp[map.x100]]: (this._state.x100 = x100),
          [this._eventProp[map.x25]]: (this._state.x25 = x25),
          [this._eventProp[map.x10]]: (this._state.x10 = x10),
        };
        if (this._allFn) {
          this._allFn(fakeEvent);
        }
      } else if (this._mode === "each" || this._mode === "unset") {
        this.setKey("x100", x100);
        this.setKey("x25", x25);
        this.setKey("x10", x10);
      }
    },

    *click(amount: number) {
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

  const GameLog: GameLogShape = {
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

  for (const manager of [KeyManager, GameLog]) {
    for (const key of Reflect.ownKeys(manager)) {
      const descriptor = Object.getOwnPropertyDescriptor(manager, key);
      if (!descriptor || typeof descriptor.value !== "function") {
        continue;
      }
      const method = descriptor.value;
      Object.defineProperty(manager, key, {
        ...descriptor,
        value: function (this: unknown, ...args: unknown[]): unknown {
          refreshContext();
          return method.apply(this, args);
        },
      });
    }
  }

  return { KeyManager, GameLog };
}
