type PreviousStats = {
  know: number;
  starved: number;
  died: number;
  attacks: number;
  days: number;
  dkills: number;
  sac: number;
  murders: number;
  psykill: number;
};

type PreviousGameStatsDependencies = {
  getGame: () => { loc: (key: string) => string };
  getWin: () => {
    LZString: { decompressFromUTF16: (value: string | null) => string | null };
  };
  getJQuery: () => (selector: string) => {
    length: number;
    append: (value: string) => unknown;
  };
  storage: { getItem: (key: string) => string | null };
};

export function createPreviousGameStats({
  getGame,
  getWin,
  getJQuery,
  storage,
}: PreviousGameStatsDependencies) {
  function renderPreviousGameStats() {
    const jquery = getJQuery();
    if (jquery("#statsPanel .cstat").length === 1) {
      const backupString = getWin().LZString.decompressFromUTF16(
        storage.getItem("evolveBak"),
      );
      if (backupString) {
        const oldStats = (JSON.parse(backupString) as { stats: PreviousStats })
          .stats;
        const statsData: Record<string, number> = {
          knowledge_spent: oldStats.know,
          starved_to_death: oldStats.starved,
          died_in_combat: oldStats.died,
          attacks_made: oldStats.attacks,
          game_days_played: oldStats.days,
        };
        if (oldStats.dkills > 0) {
          statsData.demons_kills = oldStats.dkills;
        }
        if (oldStats.sac > 0) {
          statsData.sacrificed = oldStats.sac;
        }
        if (oldStats.murders > 0) {
          statsData.murders = oldStats.murders;
        }
        if (oldStats.psykill > 0) {
          statsData.psymurders = oldStats.psykill;
        }
        let statsString = `<div class="cstat"><span class="has-text-success">Previous Game</span></div>`;
        for (const [label, value] of Object.entries(statsData)) {
          statsString += `<div><span class="has-text-warning">${getGame().loc(
            "achieve_stats_" + label,
          )}</span> ${value.toLocaleString()}</div>`;
        }
        jquery("#statsPanel").append(statsString);
      }
    }
  }

  return { renderPreviousGameStats };
}
