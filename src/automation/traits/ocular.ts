import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  | "getGame"
  | "getSettings"
  | "getVueById"
  | "traitVal"
  | "getOcularPowerData"
  | "getDocument"
>;
export function createAutoOcularPowers({
  getGame,
  getSettings,
  getVueById,
  traitVal,
  getOcularPowerData,
  getDocument,
}: Dependencies) {
  return function autoOcularPowers() {
    const game = getGame();
    const settings = getSettings();
    const ocularPowerData = getOcularPowerData();
    const document = getDocument();
    if (
      !game.global.race["ocular_power"] ||
      !game.global.race["ocularPowerConfig"]
    ) {
      return false;
    }

    const vue = getVueById("ocularPower");
    if (!vue) return false;

    let powerCap = traitVal("ocular_power", 0);
    if (powerCap < 1) return false;

    let allPowers = ocularPowerData
      .map((p) => {
        return {
          key: p.key,
          id: p.id,
          enabled: Boolean(settings[`ocularPower_${p.id}`]),
          priority: Number(settings[`ocularPower_p_${p.id}`]),
        };
      })
      .sort((a, b) => b.priority - a.priority);
    let enabledPowers = 0;
    allPowers.forEach((p) => {
      let enable = p.enabled && enabledPowers < powerCap;
      if (enable) enabledPowers++;

      if (vue[p.key] !== enable) {
        document.getElementById(`ocular${p.id}`).querySelector("input").click();
      }
    });
  };
}
