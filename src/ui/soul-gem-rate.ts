type SoulGemIncome = {
  sec: number;
  gems: number;
};

type SoulGemState = {
  scriptTick: number;
  soulGemLast: number;
  soulGemIncomes: SoulGemIncome[];
  soulGemPerHour: number;
};

type SoulGemResource = {
  currentQuantity: number;
  isUnlocked: () => boolean;
};

type SoulGemRateDependencies = {
  getState: () => SoulGemState;
  getResources: () => { Soul_Gem: SoulGemResource };
  getJQuery: () => (selector: string) => { text: (value: string) => unknown };
  getNiceNumber: (value: number) => number | string;
};

export function createSoulGemRateDisplay({
  getState,
  getResources,
  getJQuery,
  getNiceNumber,
}: SoulGemRateDependencies) {
  function updateSoulGemRate() {
    const state = getState();
    const soulGem = getResources().Soul_Gem;
    if (soulGem.isUnlocked()) {
      const currentSec = Math.floor(state.scriptTick / 4);
      if (soulGem.currentQuantity > state.soulGemLast) {
        state.soulGemIncomes.push({
          sec: currentSec,
          gems: soulGem.currentQuantity - state.soulGemLast,
        });
        state.soulGemLast = soulGem.currentQuantity;
      }
      let gems = 0;
      let index = state.soulGemIncomes.length;
      let oldest = state.soulGemIncomes[index - 1];
      while (--index >= 0) {
        const income = state.soulGemIncomes[index];
        // Get all gems gained in last hour, or at least 10 last gems in any time frame, if rate is low
        if (
          income === undefined ||
          (currentSec - income.sec > 3600 && gems > 10)
        ) {
          break;
        }
        gems += income.gems;
        oldest = income;
      }
      // If loop was broken prematurely - clean up old records which we don't need anymore
      if (index >= 0) {
        state.soulGemIncomes = state.soulGemIncomes.slice(index + 1);
      }
      // The state is seeded with a zero record, so the window always covers at least that one.
      const timePassed = currentSec - (oldest?.sec ?? currentSec);
      let gph = (gems / timePassed) * 3600;
      state.soulGemPerHour = gph;
      if (gph >= 1000) {
        gph = Math.round(gph);
      }
      getJQuery()("#resSoul_Gem span:eq(2)").text(
        `${gems > 0 && currentSec <= 3600 ? "~" : ""}${getNiceNumber(gph)} /h`,
      );
    }
  }

  return { updateSoulGemRate };
}
