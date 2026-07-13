import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  | "RitualManager"
  | "getResources"
  | "getSettings"
  | "getGame"
  | "getJobs"
  | "haveTech"
>;
export function createAutoPylon({
  RitualManager,
  getResources,
  getSettings,
  getGame,
  getJobs,
  haveTech,
}: Dependencies) {
  return function autoPylon() {
    const resources = getResources();
    const settings = getSettings();
    const game = getGame();
    const jobs = getJobs();
    let m = RitualManager;
    // If not unlocked then nothing to do
    if (!m.initIndustry()) {
      return;
    }

    let spells = (Object.values(m.Productions) as any[]).filter((spell) =>
      spell.isUnlocked(),
    );

    // Init adjustment, and sort groups by priorities
    let pylonAdjustments = Object.fromEntries(
      spells.map((spell) => [spell.id, 0]),
    );
    let manaToUse =
      resources.Mana.rateOfChange *
      (resources.Mana.storageRatio > 0.99
        ? 1
        : settings.productionRitualManaUse);
    let usableMana = manaToUse;
    let maxRituals =
      settings.productionRitualSafe && game.global.race["witch_hunter"]
        ? jobs.Priest.count * (haveTech("roguemagic", 4) ? 4 : 1)
        : Number.MAX_SAFE_INTEGER;

    let spellSorter = (a, b) =>
      pylonAdjustments[a.id] / a.weighting -
        pylonAdjustments[b.id] / b.weighting || b.weighting - a.weighting;
    let remainingSpells = spells
      .filter(
        (spell) =>
          spell.weighting > 0 &&
          (spell !== m.Productions.Factory || jobs.CementWorker.count > 0),
      )
      .sort(spellSorter);
    spellsLoop: while (remainingSpells.length > 0 && maxRituals > 0) {
      let spell = remainingSpells.shift();
      let amount = pylonAdjustments[spell.id];
      let cost = m.costStep(amount);

      if (cost <= manaToUse) {
        pylonAdjustments[spell.id] = amount + 1;
        manaToUse -= cost;
        maxRituals--;
        // Insert spell back to array keeping it sorted
        for (let i = remainingSpells.length - 1; i >= 0; i--) {
          if (spellSorter(spell, remainingSpells[i]) > 0) {
            remainingSpells.splice(i + 1, 0, spell);
            continue spellsLoop;
          }
        }
        remainingSpells.unshift(spell);
      }
    }
    resources.Mana.rateOfChange - (usableMana - manaToUse);

    let pylonDeltas = spells.map(
      (spell) => pylonAdjustments[spell.id] - m.currentSpells(spell),
    );

    spells.forEach(
      (spell, index) =>
        pylonDeltas[index] < 0 &&
        m.decreaseRitual(spell, pylonDeltas[index] * -1),
    );
    spells.forEach(
      (spell, index) =>
        pylonDeltas[index] > 0 && m.increaseRitual(spell, pylonDeltas[index]),
    );
  };
}
