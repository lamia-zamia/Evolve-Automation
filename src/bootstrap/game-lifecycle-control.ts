import { createGameKeyboardHandlers } from "../adapters/browser/game-keyboard-handlers.ts";
import { createGamePageShell } from "../adapters/browser/game-page-shell.ts";
import { createGameUiSurface } from "../adapters/browser/game-ui-surface.ts";
import { createInfrastructureManagers } from "../game/infrastructure-managers.ts";

type KeyboardDependencies = Parameters<typeof createGameKeyboardHandlers>[0];
type InfrastructureDependencies = Parameters<
  typeof createInfrastructureManagers
>[0];
type PageShellDependencies = Parameters<typeof createGamePageShell>[0];
type UiSurfaceDependencies = Parameters<typeof createGameUiSurface>[0];

export interface GameLifecycleControlDependencies {
  readonly getDocument: KeyboardDependencies["getDocument"];
  readonly getKeyboardEvent: KeyboardDependencies["getKeyboardEvent"];
  readonly getGame: InfrastructureDependencies["getGame"];
  readonly getSettings: InfrastructureDependencies["getSettings"];
  readonly getPoly: InfrastructureDependencies["getPoly"];
  readonly getMutationObserver: PageShellDependencies["getMutationObserver"];
  readonly getNode: PageShellDependencies["getNode"];
  readonly getTooltipObserver: PageShellDependencies["getTooltipObserver"];
  readonly getLogFilter: PageShellDependencies["getLogFilter"];
  readonly getModal: PageShellDependencies["getModal"];
}

export function createGameLifecycleControl({
  getDocument,
  getKeyboardEvent,
  getGame,
  getSettings,
  getPoly,
  getMutationObserver,
  getNode,
  getTooltipObserver,
  getLogFilter,
  getModal,
}: GameLifecycleControlDependencies) {
  const gameKeyboardHandlers = createGameKeyboardHandlers({
    getDocument,
    getKeyboardEvent,
  });
  const { KeyManager, GameLog } = createInfrastructureManagers({
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
  });
  const gameUiSurface = createGameUiSurface({
    getDocument,
  } as UiSurfaceDependencies);

  return Object.freeze({
    KeyManager,
    GameLog,
    gamePageShell,
    gameUiSurface,
  });
}
