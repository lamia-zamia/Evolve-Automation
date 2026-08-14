import { createGameKeyboardHandlers } from "../adapters/browser/game-keyboard-handlers.ts";
import { createGamePageShell } from "../adapters/browser/game-page-shell.ts";
import { createGameUiSurface } from "../adapters/browser/game-ui-surface.ts";
import { createInfrastructureManagerControl } from "./infrastructure-manager-control.ts";

type KeyboardDependencies = Parameters<typeof createGameKeyboardHandlers>[0];
type InfrastructureDependencies = Parameters<
  typeof createInfrastructureManagerControl
>[0];
type PageShellDependencies = Parameters<typeof createGamePageShell>[0];
type UiSurfaceDependencies = Parameters<typeof createGameUiSurface>[0];

export interface GameLifecycleControlDependencies {
  readonly getWin: KeyboardDependencies["getWin"];
  readonly getDocument: KeyboardDependencies["getDocument"];
  readonly getKeyboardEvent: KeyboardDependencies["getKeyboardEvent"];
  readonly getNeedSandboxBypass: KeyboardDependencies["getNeedSandboxBypass"];
  readonly cloneIntoPage: KeyboardDependencies["cloneIntoPage"];
  readonly getGame: InfrastructureDependencies["getGame"];
  readonly getSettings: InfrastructureDependencies["getSettings"];
  readonly getPoly: InfrastructureDependencies["getPoly"];
  readonly getMutationObserver: PageShellDependencies["getMutationObserver"];
  readonly getNode: PageShellDependencies["getNode"];
  readonly getTooltipObserver: PageShellDependencies["getTooltipObserver"];
  readonly getLogFilter: PageShellDependencies["getLogFilter"];
  readonly getModal: PageShellDependencies["getModal"];
  readonly getJQuery: PageShellDependencies["getJQuery"];
}

export function createGameLifecycleControl({
  getWin,
  getDocument,
  getKeyboardEvent,
  getNeedSandboxBypass,
  cloneIntoPage,
  getGame,
  getSettings,
  getPoly,
  getMutationObserver,
  getNode,
  getTooltipObserver,
  getLogFilter,
  getModal,
  getJQuery,
}: GameLifecycleControlDependencies) {
  const gameKeyboardHandlers = createGameKeyboardHandlers({
    getWin,
    getDocument,
    getKeyboardEvent,
    getNeedSandboxBypass,
    cloneIntoPage,
  });
  const { KeyManager, GameLog } = createInfrastructureManagerControl({
    getGame,
    getSettings,
    getPoly,
    getKeyboardHandlers: () => gameKeyboardHandlers,
  });
  const gamePageShell = createGamePageShell({
    getDocument,
    getMutationObserver,
    getNode,
    getTooltipObserver,
    getLogFilter,
    getModal,
    getJQuery,
  });
  const gameUiSurface = createGameUiSurface({
    getDocument,
  } as UiSurfaceDependencies);

  return Object.freeze({
    gameKeyboardHandlers,
    KeyManager,
    GameLog,
    gamePageShell,
    gameUiSurface,
  });
}
