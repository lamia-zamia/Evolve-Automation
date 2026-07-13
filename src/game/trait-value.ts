interface TraitValueGame {
  global: { race: Record<string, unknown> };
  traits: Record<string, { vars(): number[] }>;
}

interface TraitValueDependencies {
  getGame: () => TraitValueGame;
}

export function createTraitValue({ getGame }: TraitValueDependencies) {
  function traitVal(trait: string, index: number, operation?: string | number) {
    const game = getGame();
    if (game.global.race[trait]) {
      const value = game.traits[trait].vars()[index];
      if (operation === "-") {
        return 1 - value / 100;
      } else if (operation === "+") {
        return 1 + value / 100;
      } else if (operation === "=") {
        return value / 100;
      } else {
        return value;
      }
    } else if (operation === "+" || operation === "-" || operation === "=") {
      return 1;
    } else {
      return operation ?? 0;
    }
  }

  return { traitVal };
}
