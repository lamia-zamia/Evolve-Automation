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
      let i = state.soulGemIncomes.length;
      while (--i >= 0) {
        const income = state.soulGemIncomes[i];
        // Get all gems gained in last hour, or at least 10 last gems in any time frame, if rate is low
        if (currentSec - income.sec > 3600 && gems > 10) {
          break;
        } else {
          gems += income.gems;
        }
      }
      // If loop was broken prematurely - clean up old records which we don't need anymore
      if (i >= 0) {
        state.soulGemIncomes = state.soulGemIncomes.splice(i + 1);
      }
      const timePassed = currentSec - state.soulGemIncomes[0].sec;
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
