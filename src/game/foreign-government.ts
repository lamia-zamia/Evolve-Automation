type ForeignGovernment = {
  spy: number;
  mil: number;
  name?: { s0: string; s1: string };
};

type ForeignGovernmentGame = {
  global: {
    race: Record<string, unknown>;
    civic: {
      foreign: Record<string, ForeignGovernment>;
    };
  };
};

type Localization = {
  loc: (key: string, args: string[]) => string;
};

type ForeignGovernmentDependencies = {
  getGame: () => ForeignGovernmentGame;
  getPoly: () => Localization;
};

export function createForeignGovernment({
  getGame,
  getPoly,
}: ForeignGovernmentDependencies) {
  function getGovName(govIndex: number) {
    // Government ids are contiguous and the game creates each foreign entry.
    const foreign = getGame().global.civic.foreign[`gov${govIndex}`]!;
    if (!foreign.name) {
      return `foreign power ${govIndex + 1}`;
    }

    return (
      getPoly().loc(`civics_gov${foreign.name.s0}`, [foreign.name.s1]) +
      ` (${govIndex + 1})`
    );
  }

  function getGovPower(govIndex: number) {
    // This function is full of hacks. But all that can be accomplished by wise player without peeking inside game variables
    // We really need to know power as accurate as possible, otherwise script becomes wonky when spies dies on mission
    const game = getGame();
    const gov = game.global.civic.foreign[`gov${govIndex}`]!;
    if (gov.spy > 0) {
      // With 2+ spies we know exact number, for 1 we're assuming trick with advantage
      // We can see ambush advantage with a single spy, and knowing advantage we can calculate power
      // Proof of concept: military_power = army_offence / (5 / (1-advantage))
      // I'm not going to waste time parsing tooltips, and take that from internal variable instead
      return gov.mil;
    } else {
      // We're going to use another trick here. We know minimum and maximum power for gov
      // If current power is below minimum, that means we sabotaged it already, but spy died since that
      // We know we seen it for sure, so let's just peek inside, imitating memory
      // We could cache those values, but making it persistent in between of page reloads would be a pain
      // Especially considering that player can not only reset, but also import different save at any moment
      const minPower = [75, 125, 200, 650, 300];
      const maxPower = [125, 175, 300, 750, 300];
      if (game.global.race["truepath"]) {
        [1.5, 1.4, 1.25].forEach((modifier, index) => {
          minPower[index]! *= modifier;
          maxPower[index]! *= modifier;
        });
      }

      if (gov.mil < minPower[govIndex]!) {
        return gov.mil;
      } else {
        // Above minimum. Even if we ever sabotaged it, unfortunately we can't prove it. Not peeking inside, and assuming worst.
        return maxPower[govIndex]!;
      }
    }
  }

  return { getGovName, getGovPower };
}
