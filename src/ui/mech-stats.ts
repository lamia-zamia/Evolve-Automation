interface MechBlueprint {
  size: string;
  equip: string[];
}

interface MechStatsDependencies {
  getDocument: () => {
    getElementById(id: string): { checked: boolean; value: string };
  };
  getJQuery: () => (selector: string) => { html(content: string): void };
  getMechManager: () => {
    SmallChassisMod: Record<string, Record<string, number>>;
    LargeChassisMod: Record<string, Record<string, number>>;
    Size: string[];
    SizeWeapons: Record<string, number>;
    StatusMod: { gravity(mech: MechBlueprint): number };
    getSizeMod(mech: MechBlueprint, prepared: boolean): number;
    getMechCost(
      mech: MechBlueprint,
      prepared: number,
    ): [number, number, number];
    getMechRefund(mech: MechBlueprint, prepared: number): [number, number];
  };
  getPoly: () => {
    monsters: Record<string, { weapon: Record<string, number> }>;
    terrainRating(
      mech: MechBlueprint,
      factor: number,
      statuses: string[],
      scouts: number,
    ): number;
    weaponPower(mech: MechBlueprint, factor: number): number;
  };
  getGame: () => { loc(id: string): string };
  average: (values: number[]) => number;
}

export function createMechStats({
  getDocument,
  getJQuery,
  getMechManager,
  getPoly,
  getGame,
  average,
}: MechStatsDependencies) {
  function calculateMechStats() {
    const cellInfo = '<td><span class="has-text-info">';
    const cellWarn = '<td><span class="has-text-warning">';
    const cellAdv = '<td><span class="has-text-advanced">';
    const cellEnd = "</span></td>";
    let content = "";
    const document = getDocument();
    const MechManager = getMechManager();
    const poly = getPoly();
    const game = getGame();

    const special = document.getElementById("script_mechStatsSpecial").checked;
    const gravity = document.getElementById("script_mechStatsGravity").checked;
    const efficient = document.getElementById(
      "script_mechStatsEfficient",
    ).checked;
    const scouts =
      parseInt(document.getElementById("script_mechStatsScouts").value) || 0;
    const prepared = document.getElementById("script_mechStatsCompact").checked
      ? 2
      : 0;

    const smallFactor = efficient
      ? 1
      : average(
          Object.values(MechManager.SmallChassisMod).reduce<number[]>(
            (list, mod) => list.concat(Object.values(mod)),
            [],
          ),
        );
    const largeFactor = efficient
      ? 1
      : average(
          Object.values(MechManager.LargeChassisMod).reduce<number[]>(
            (list, mod) => list.concat(Object.values(mod)),
            [],
          ),
        );
    const weaponFactor = efficient
      ? 1
      : average(
          Object.values(poly.monsters).reduce<number[]>(
            (list, mod) => list.concat(Object.values(mod.weapon)),
            [],
          ),
        );

    // One row per statistic, so each row is addressed by name below rather than by a loose index.
    const rows: [string[], string[], string[], string[], string[], string[]] = [
      [""],
      ["Damage Per Size"],
      ["Damage Per Supply (New)"],
      ["Damage Per Gems (New)"],
      ["Damage Per Supply (Rebuild)"],
      ["Damage Per Gems (Rebuild)"],
    ];
    // The last size is the collector, which has no damage statistics.
    for (const [i, size] of MechManager.Size.slice(0, -1).entries()) {
      const sizeWeapons = MechManager.SizeWeapons[size];
      if (sizeWeapons === undefined) {
        // A size the game does not rate for weapons has no comparable damage figures.
        continue;
      }
      const mech = { size, equip: special ? ["special"] : [] };
      const basePower = MechManager.getSizeMod(mech, false);
      const statusMod = gravity ? MechManager.StatusMod.gravity(mech) : 1;
      const terrainMod = poly.terrainRating(
        mech,
        i < 2 ? smallFactor : largeFactor,
        gravity ? ["gravity"] : [],
        scouts,
      );
      const weaponMod = poly.weaponPower(mech, weaponFactor) * sizeWeapons;
      const power = basePower * statusMod * terrainMod * weaponMod;
      const [gems, cost, space] = MechManager.getMechCost(mech, prepared);
      const [gemsRef, costRef] = MechManager.getMechRefund(mech, prepared);

      rows[0].push(game.loc(`portal_mech_size_${mech.size}`));
      rows[1].push(((power / space) * 100).toFixed(4));
      rows[2].push(((power / (cost / 100000)) * 100).toFixed(4));
      rows[3].push(((power / gems) * 100).toFixed(4));
      rows[4].push(((power / ((cost - costRef) / 100000)) * 100).toFixed(4));
      rows[5].push(((power / (gems - gemsRef)) * 100).toFixed(4));
    }
    rows.forEach(
      (line, index) =>
        (content +=
          "<tr>" +
          (index === 0 ? cellWarn : cellAdv) +
          line.join("&nbsp;" + cellEnd + (index === 0 ? cellAdv : cellInfo)) +
          cellEnd +
          "</tr>"),
    );
    getJQuery()("#script_mechStatsTable").html(content);
  }

  return { calculateMechStats };
}
