type GameAction = { id: string };
type ScriptAction = { id: string };

type GameActionVerificationDependencies = {
  getGame: () => {
    actions: {
      city: Record<string, unknown>;
      space: Record<string, unknown>;
      interstellar: Record<string, unknown>;
      portal: Record<string, unknown>;
      galaxy: Record<string, unknown>;
      tauceti: Record<string, unknown>;
      eden: Record<string, unknown>;
    };
  };
  getBuildings: () => Record<string, ScriptAction>;
  log: (...values: unknown[]) => void;
};

export function createGameActionVerification({
  getGame,
  getBuildings,
  log,
}: GameActionVerificationDependencies) {
  function verifyGameActions() {
    const actions = getGame().actions;
    const buildings = getBuildings();
    verifyGameActionsExist(actions.city, buildings, false);
    verifyGameActionsExist(actions.space, buildings, true);
    verifyGameActionsExist(actions.interstellar, buildings, true);
    verifyGameActionsExist(actions.portal, buildings, true);
    verifyGameActionsExist(actions.galaxy, buildings, true);
    verifyGameActionsExist(actions.tauceti, buildings, true);
    verifyGameActionsExist(actions.eden, buildings, true);
  }

  function verifyGameActionsExist(
    gameObject: Record<string, unknown>,
    scriptObject: Record<string, ScriptAction>,
    hasSubLevels: boolean,
  ) {
    const scriptKeys = Object.keys(scriptObject);
    for (const gameActionKey in gameObject) {
      if (!hasSubLevels) {
        verifyGameActionExists(
          scriptKeys,
          scriptObject,
          gameActionKey,
          gameObject as Record<string, GameAction>,
        );
      } else {
        const gameSubObject = gameObject[gameActionKey] as Record<
          string,
          GameAction
        >;
        for (const gameSubActionKey in gameSubObject) {
          verifyGameActionExists(
            scriptKeys,
            scriptObject,
            gameSubActionKey,
            gameSubObject,
          );
        }
      }
    }
  }

  function verifyGameActionExists(
    scriptKeys: string[],
    scriptObject: Record<string, ScriptAction>,
    gameActionKey: string,
    gameObject: Record<string, GameAction>,
  ) {
    if (
      ["info", "gift", "bonfire", "firework", "replicator"].includes(
        gameActionKey,
      )
    ) {
      return;
    }

    let scriptActionFound = false;
    for (let i = 0; i < scriptKeys.length; i++) {
      const scriptAction = scriptObject[scriptKeys[i]];
      if (scriptAction.id === gameActionKey) {
        scriptActionFound = true;
        break;
      }
    }

    if (!scriptActionFound) {
      log(
        `Game action key not found in script: ${gameActionKey} (${gameObject[gameActionKey].id})`,
      );
      log(gameObject[gameActionKey]);
    }
  }

  return {
    verifyGameActions,
    verifyGameActionsExist,
    verifyGameActionExists,
  };
}
