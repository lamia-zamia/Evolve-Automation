/**
 * Static Evolution catalogs for the captured settings panel.
 *
 * The evolution vocabulary is not capture-reachable. `game.races` and `game.actions.evolution`
 * are module-lexical in the game bundle, and the settings panel has to list every race, universe
 * and challenge while the page is not even in an evolution. The values below are derived from
 * `src/races.js` and `strings/strings.json` at the port reference commit: a race's id, its
 * English name, and its genus (`type`).
 *
 * The three challenge races whose genus the player chooses at the gene lab — Valdi, Sludge and
 * Ultra Sludge — carry `genus: "variable"` upstream (`global.race.jtype`), which is a live value
 * no static table can answer.
 *
 * Deliberately absent: race descriptions, `getHabitability()` and `getCondition()`. Those are
 * computed by the game from the current planet, and restating them here would be a second
 * implementation of a game rule rather than a label. The Target Race hint carries the genus
 * instead, and the read model's race warning stays undefined on the captured path.
 */

export interface CapturedEvolutionRaceEntry {
  readonly id: string;
  readonly label: string;
  /** The game's `races[id].type`, or `"variable"` where the player picks it at the gene lab. */
  readonly genus: string;
}

export interface CapturedEvolutionLabelledEntry {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
}

/** Every selectable race, in the game's own declaration order. `protoplasm` is not a target. */
export const CAPTURED_EVOLUTION_RACES: readonly CapturedEvolutionRaceEntry[] =
  Object.freeze([
    { id: "human", label: "Human", genus: "humanoid" },
    { id: "elven", label: "Elf", genus: "humanoid" },
    { id: "orc", label: "Orc", genus: "humanoid" },
    { id: "cath", label: "Cath", genus: "carnivore" },
    { id: "wolven", label: "Wolven", genus: "carnivore" },
    { id: "vulpine", label: "Vulpine", genus: "carnivore" },
    { id: "centaur", label: "Centaur", genus: "herbivore" },
    { id: "rhinotaur", label: "Rhinotaur", genus: "herbivore" },
    { id: "capybara", label: "Capybara", genus: "herbivore" },
    { id: "porkenari", label: "Porkenari", genus: "omnivore" },
    { id: "hedgeoken", label: "Hedgeoken", genus: "omnivore" },
    { id: "kobold", label: "Kobold", genus: "small" },
    { id: "goblin", label: "Goblin", genus: "small" },
    { id: "gnome", label: "Gnome", genus: "small" },
    { id: "ogre", label: "Ogre", genus: "giant" },
    { id: "cyclops", label: "Cyclops", genus: "giant" },
    { id: "troll", label: "Troll", genus: "giant" },
    { id: "tortoisan", label: "Tortoisan", genus: "reptilian" },
    { id: "gecko", label: "Gecko", genus: "reptilian" },
    { id: "slitheryn", label: "Slitheryn", genus: "reptilian" },
    { id: "arraak", label: "Arraak", genus: "avian" },
    { id: "pterodacti", label: "Pterodacti", genus: "avian" },
    { id: "dracnid", label: "Dracnid", genus: "avian" },
    { id: "entish", label: "Ent", genus: "plant" },
    { id: "cacti", label: "Cacti", genus: "plant" },
    { id: "pinguicula", label: "Pinguicula", genus: "plant" },
    { id: "sporgar", label: "Sporgar", genus: "fungi" },
    { id: "shroomi", label: "Shroomi", genus: "fungi" },
    { id: "moldling", label: "Moldling", genus: "fungi" },
    { id: "mantis", label: "Mantis", genus: "insectoid" },
    { id: "scorpid", label: "Scorpid", genus: "insectoid" },
    { id: "antid", label: "Antid", genus: "insectoid" },
    { id: "sharkin", label: "Sharkin", genus: "aquatic" },
    { id: "octigoran", label: "Octigoran", genus: "aquatic" },
    { id: "dryad", label: "Dryad", genus: "fey" },
    { id: "satyr", label: "Satyr", genus: "fey" },
    { id: "phoenix", label: "Phoenix", genus: "heat" },
    { id: "salamander", label: "Salamander", genus: "heat" },
    { id: "yeti", label: "Yeti", genus: "polar" },
    { id: "wendigo", label: "Wendigo", genus: "polar" },
    { id: "tuskin", label: "Tuskin", genus: "sand" },
    { id: "kamel", label: "Kamel", genus: "sand" },
    { id: "balorg", label: "Balorg", genus: "demonic" },
    { id: "imp", label: "Imp", genus: "demonic" },
    { id: "seraph", label: "Seraph", genus: "angelic" },
    { id: "unicorn", label: "Unicorn", genus: "angelic" },
    { id: "synth", label: "Synth", genus: "synthetic" },
    { id: "nano", label: "Nano", genus: "synthetic" },
    { id: "ghast", label: "Ghast", genus: "eldritch" },
    { id: "shoggoth", label: "Shoggoth", genus: "eldritch" },
    { id: "raptors", label: "Raptors", genus: "primordial" },
    { id: "rexicus", label: "Rexicus", genus: "primordial" },
    { id: "dwarf", label: "Dwarf", genus: "hybrid" },
    { id: "raccoon", label: "Racconar", genus: "hybrid" },
    { id: "lichen", label: "Lichen", genus: "hybrid" },
    { id: "wyvern", label: "Wyvern", genus: "hybrid" },
    { id: "beholder", label: "Eye-Spector", genus: "hybrid" },
    { id: "djinn", label: "Djinn", genus: "hybrid" },
    { id: "narwhal", label: "Narwhalus", genus: "hybrid" },
    { id: "bombardier", label: "Bombardier", genus: "hybrid" },
    { id: "nephilim", label: "Nephilim", genus: "hybrid" },
    { id: "mammuth", label: "Mammuth", genus: "hybrid" },
    { id: "hellspawn", label: "Hellspawn", genus: "demonic" },
    { id: "junker", label: "Valdi", genus: "variable" },
    { id: "sludge", label: "Sludge", genus: "variable" },
    { id: "ultra_sludge", label: "Ultra Sludge", genus: "variable" },
  ]);

/** `universe_<id>` / `universe_<id>_desc`, for the ids `src/config.ts` already owns. */
export const CAPTURED_EVOLUTION_UNIVERSE_LABELS: Readonly<
  Record<string, CapturedEvolutionLabelledEntry>
> = Object.freeze(
  Object.fromEntries(
    (
      [
        {
          id: "standard",
          label: "Standard",
          hint: "A standard universe with normal laws of physics",
        },
        {
          id: "heavy",
          label: "Heavy Gravity",
          hint: "The force of gravity in this universe is much stronger than normal",
        },
        {
          id: "antimatter",
          label: "Antimatter",
          hint: "This universe consists primarily of antimatter",
        },
        {
          id: "evil",
          label: "Evil",
          hint: "Everything in this universe is evil",
        },
        {
          id: "micro",
          label: "Micro",
          hint: "Everything in this universe is small",
        },
        { id: "magic", label: "Magic", hint: "Magic is real in this universe" },
      ] as const
    ).map((entry) => [entry.id, Object.freeze(entry)]),
  ),
);

/**
 * `evo_challenge_<id>` / `_effect` for each challenge group, keyed by the group's first member —
 * the same id `computeEvolutionDefaults` turns into a `challenge_<id>` setting. Grouped labels
 * join the members the way the game's own gene-lab rows read. The group *list* stays owned by
 * `runtime-catalogs.ts`; this table only labels it.
 */
export const CAPTURED_EVOLUTION_CHALLENGE_LABELS: Readonly<
  Record<string, CapturedEvolutionLabelledEntry>
> = Object.freeze(
  Object.fromEntries(
    (
      [
        {
          id: "plasmid",
          label: "No Starting Plasmids | Weak Mastery | Weak Genes",
          hint: "Starting Plasmids have no effect.&#xA;Mastery is much weaker than normal.&#xA;Mastery is reduced to %0, and plasmid and anti-plasmid production are reduced to %1 value. Plasmid and anti-plasmid storage bonus reduced to %2. Phage storage bonus reduced to %3.",
        },
        {
          id: "crispr",
          label: "Junk Gene | Bad Genes",
          hint: "Gain a random negative mutation. CRISPR cost creep discounts function at only 20%.&#xA;Gain %0 random empowered negative trait and %1 weak negative traits.",
        },
        {
          id: "trade",
          label: "No Free Trade",
          hint: "No marketplace trading. (Trade routes are still enabled.)",
        },
        {
          id: "craft",
          label: "No Manual Crafting",
          hint: "No manual resource crafting.",
        },
        {
          id: "joyless",
          label: "Joyless",
          hint: "There will be no joy in your life: entertainers and broadcasting are disabled. Construct a Biodome to earn the achievement and remove the penalty.",
        },
        {
          id: "steelen",
          label: "Steelen",
          hint: "Your species cannot figure out how to smelt Steel. You have to resort to other means to get any of it. Have the mettle to Bioseed with this challenge active and your dedication will be rewarded.",
        },
        {
          id: "decay",
          label: "Decay",
          hint: "Resources decay at a rate determined by how much of it you are storing. Larger stores decay quicker. Destroy this universe to end the cycle of decay.",
        },
        {
          id: "emfield",
          label: "EM Field",
          hint: "Energy costs are higher and technology may fail you. You must ascend to win.",
        },
        {
          id: "inflation",
          label: "Inflation",
          hint: "Inflation is ruining your economy. The more you build, the more worthless your money becomes. Constructing anything devalues money, causing all money costs to increase.",
        },
        {
          id: "sludge",
          label: "Failed Experiment",
          hint: "You will be stacked with terrible junk traits. You suffer for no reason.",
        },
        {
          id: "ultra_sludge",
          label: "Ultimate Failed Experiment",
          hint: "You will be stacked with terrible junk traits. You suffer because the community wanted it.",
        },
        {
          id: "orbit_decay",
          label: "Orbital Decay",
          hint: "Your homeworld's moon is in a decaying orbit; it will impact the planet in %0 days.",
        },
        {
          id: "gravity_well",
          label: "Gravity Well | Witch Hunter | Warlord",
          hint: "Gravity is very strong, so leaving the planet will be very difficult. Find a new one that doesn't drag you down.&#xA;Magic effects are stronger, but using magic draws unwanted attention. Your goal is to perform the ultimate forbidden ritual.&#xA;Prove you are the most ruthless to ever exist.",
        },
        {
          id: "junker",
          label: "Genetic Dead End",
          hint: "This forces on all four challenge genes. You will be stacked with horrible junk traits. Reach MAD for a special perk.",
        },
        {
          id: "cataclysm",
          label: "Cataclysm",
          hint: "A massive earthquake has literally shaken your planet apart. Start with a space colony but no homeworld. Escape to a new world to win (Bioseed).",
        },
        {
          id: "banana",
          label: "Banana Republic",
          hint: "You can only export one type of resource, your economy is bad, and your army is weak. Complete a checklist of objectives; unifying exits the scenario.",
        },
        {
          id: "truepath",
          label: "The True Path",
          hint: "Use an alternate progression path.",
        },
        {
          id: "lone_survivor",
          label: "Lone Survivor",
          hint: "You must survive and thrive alone on an alien world.",
        },
        {
          id: "fasting",
          label: "Fasting",
          hint: "Food production is disabled. Learn to survive without sustenance.",
        },
      ] as const
    ).map((entry) => [entry.id, Object.freeze(entry)]),
  ),
);
