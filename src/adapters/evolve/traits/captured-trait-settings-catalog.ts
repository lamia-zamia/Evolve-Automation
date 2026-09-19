/**
 * Static Trait settings catalog for the captured path, verified against DeadSpace 1.5.0.
 *
 * The compat reader mixes hardcoded controls with live game answers: race/genus catalogs,
 * localized option labels, trait-manager priority lists, and game-class mutation data.
 * Genetics 2.0 removed the manager classes the compat reader needs, so the captured path
 * freezes the upstream-verified id sets below and bakes their English labels:
 * - `races` export order in `src/races.js` owns the imitate list (base names; the game shows
 *   seasonal variants for some races via `altRace`, which nothing static can reproduce).
 * - Distinct race `type` values (minus organism/synthetic) own the genus options.
 * - `traits` export order and `type` tags own the minor set (minor plus fortify/mastery)
 *   and the mutable set (major/genus minus xenophobic/rigid/soul_eater).
 * - `atomic_mass` keys in `src/resources.js` own the psychic-boost resource list.
 * - `wishData`/`ocularPowerData` ids match `createTraitAutomationCatalogs`.
 * - Labels are the English `strings.json` values for the same keys the game localizes.
 *   Trait descriptions keep their %0 placeholders: rank-scaled numbers are live game
 *   computation with no captured source.
 * - The gainable set mirrors the 1.5.0 breakdown gain list (same-genus race traits, minus
 *   junker/sludge/ultra_sludge/custom races and soul_eater/catnip/anise).
 * - Reset order groups by first-seen genus: 1.5.0 has no `poly.genus_traits` order,
 *   so the legacy comparator runs over the catalog's genus sequence instead.
 */

import type {
  TraitSettingsControl,
  TraitSettingsSelectOption,
} from "../../../domain/traits/trait-settings.ts";

/** Imitate-race options in upstream `races` export order. */
export const CAPTURED_TRAIT_RACES: readonly {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
}[] = Object.freeze([
  Object.freeze({
    id: "protoplasm",
    name: "Protoplasm",
    desc: "Your race has yet to evolve into a complex lifeform. Currently you're nothing but protoplasm in the primordial ooze.",
  }),
  Object.freeze({
    id: "human",
    name: "Human",
    desc: "Humans are versatile creatures who are adept at bending the environment around them to suit their needs. They are an ambitious race who seek to expand their knowledge of the universe around them and build great empires.",
  }),
  Object.freeze({
    id: "elven",
    name: "Elf",
    desc: "Elves are typically tall and slender creatures with pointy ears, that tend to be reclusive but sharp of wit. Elves live long lives and often devote themselves to study, seeking answers to the deep fundamental questions of the universe.",
  }),
  Object.freeze({
    id: "orc",
    name: "Orc",
    desc: "Orcs tend to be large and muscular creatures who are slow of wit but contain immense brute strength. They typically try to solve problems with violence first, then seek a more rational solution only when that doesn't work.",
  }),
  Object.freeze({
    id: "cath",
    name: "Cath",
    desc: "The Cath are a feline race who are typically lazy. They are curious and love exploring the unknown. However, most Cath prefer to laze about rather than work hard.",
  }),
  Object.freeze({
    id: "wolven",
    name: "Wolven",
    desc: "The Wolven are a canine race who usually move in organized packs. They are a highly social species and rarely undertake any task alone.",
  }),
  Object.freeze({
    id: "vulpine",
    name: "Vulpine",
    desc: "The %0 are a playful species of %1 fox. They are cunning and have a bushy tail.",
  }),
  Object.freeze({
    id: "centaur",
    name: "Centaur",
    desc: "Centaur are a species of horse creatures who have human-like upper bodies. They are fast-moving and strong.",
  }),
  Object.freeze({
    id: "rhinotaur",
    name: "Rhinotaur",
    desc: "Rhinotaur are tough, bestial creatures who have a large horn attached to their nose.",
  }),
  Object.freeze({
    id: "capybara",
    name: "Capybara",
    desc: "The Capybara are highly-evolved giant rodents. They have sharp teeth that grow constantly and require grinding.",
  }),
  Object.freeze({
    id: "porkenari",
    name: "Porkenari",
    desc: "The Porkenari are an evolved warthog.",
  }),
  Object.freeze({
    id: "hedgeoken",
    name: "Hedgeoken",
    desc: "The Hedgeoken are a species descended from hedgehogs. They are covered in spines and can roll up into a spiky ball.",
  }),
  Object.freeze({
    id: "kobold",
    name: "Kobold",
    desc: "Kobolds are small humanoid creatures who are known for their infatuation with candles. They are adept at hoarding as much stuff as possible.",
  }),
  Object.freeze({
    id: "goblin",
    name: "Goblin",
    desc: "Goblins are small humanoid creatures who are known for their greed and cunning. They are highly intelligent but typically selfish in nature.",
  }),
  Object.freeze({
    id: "gnome",
    name: "Gnome",
    desc: "Gnomes are small humanoid creatures who are known for their superior intelligence. They are natural scientists and seek to expand their knowledge, often at the cost of safety and morality.",
  }),
  Object.freeze({
    id: "ogre",
    name: "Ogre",
    desc: "Ogres are large humanoid creatures who are known for being kind of dumb. They are very strong, with few races being able to match their physical prowess. However, they learn slowly.",
  }),
  Object.freeze({
    id: "cyclops",
    name: "Cyclops",
    desc: "Cyclops are large humanoid creatures who have a single giant eye. They have poor depth perception but are fairly social and intelligent.",
  }),
  Object.freeze({
    id: "troll",
    name: "Troll",
    desc: "Trolls are large humanoid creatures who are known for their regenerative powers. They are a hardy race highly resistant to disease and injury.",
  }),
  Object.freeze({
    id: "tortoisan",
    name: "Tortoisan",
    desc: "Tortoisans are a reptilian species with %0 shells on their backs. They are slow-moving and good at hiding.",
  }),
  Object.freeze({
    id: "gecko",
    name: "Gecko",
    desc: "The Geckos are a lizard species who can naturally camouflage themselves to their surroundings. They are very agile and fast-moving.",
  }),
  Object.freeze({
    id: "slitheryn",
    name: "Slitheryn",
    desc: "Slitheryn are a reptilian species who evolved from snakes. They have humanoid upper bodies but retain snake-like lower halves.",
  }),
  Object.freeze({
    id: "arraak",
    name: "Arraak",
    desc: "Arraak are a species of feathered birds. Modern Arraak aren't as adept at flying as their ancestors, but they can still glide.",
  }),
  Object.freeze({
    id: "pterodacti",
    name: "Pterodacti",
    desc: "Pterodacti are descended from large, featherless flying creatures. Their skin is leathery and they have long, narrow heads.",
  }),
  Object.freeze({
    id: "dracnid",
    name: "Dracnid",
    desc: "Dracnid are descended from large, scaly flying creatures. They are tough due to their natural armor, but they tend to be antisocial and greedy.",
  }),
  Object.freeze({
    id: "entish",
    name: "Ent",
    desc: "Ents are basically sentient trees who can uproot themselves and move around. They are large and slow-moving, but fearsome and can get most of their nutrients from the sun.",
  }),
  Object.freeze({
    id: "cacti",
    name: "Cacti",
    desc: "Cacti are small sentient plant creatures covered in spines. They are surprisingly fast-moving, but easily startled.",
  }),
  Object.freeze({
    id: "pinguicula",
    name: "Pinguicula",
    desc: "The Pinguicula are a plant-based species who are covered in a sticky film used to trap small prey. They are well suited to nutrient-poor environments.",
  }),
  Object.freeze({
    id: "sporgar",
    name: "Sporgar",
    desc: "Sporgar are a parasitic species of sentient mold spores that spread by infecting host bodies and possessing them.",
  }),
  Object.freeze({
    id: "shroomi",
    name: "Shroomi",
    desc: "The Shroomi are a race of mushroom-like creatures. They prefer dark places away from sunlight.",
  }),
  Object.freeze({
    id: "moldling",
    name: "Moldling",
    desc: "The Moldling are a race of blob-like creatures made of a mass of mold which can shape itself into any form they please.",
  }),
  Object.freeze({
    id: "mantis",
    name: "Mantis",
    desc: "Mantis are an insectoid species that resemble giant... mantis. They are quick but fragile.",
  }),
  Object.freeze({
    id: "scorpid",
    name: "Scorpid",
    desc: "Scorpid are a bipedal species with large claw hands and barbed tails. They are tough fighters naturally equipped for close combat.",
  }),
  Object.freeze({
    id: "antid",
    name: "Antid",
    desc: "Antid are a hivemind species descended from ants. Individually they are not intelligent, but as their swarm increases so does their collective intelligence.",
  }),
  Object.freeze({
    id: "sharkin",
    name: "Sharkin",
    desc: "Sharkin are an aquatic species descended from aggressive fish that have large mouths with many sharp teeth. Although they can roam on land, they prefer to stay underwater.",
  }),
  Object.freeze({
    id: "octigoran",
    name: "Octigoran",
    desc: "Octigoran are an aquatic species of cephalopod who have eight tentacles. They can mimic walking on land using their appendages as makeshift legs, but are most at home underwater.",
  }),
  Object.freeze({
    id: "dryad",
    name: "Dryad",
    desc: "Dryads are forest creatures that are deeply connected to their trees. They can be quite ruthless if anyone threatens their trees.",
  }),
  Object.freeze({
    id: "satyr",
    name: "Satyr",
    desc: "Satyrs are whimsical goat men that prefer to party rather than work. They are like a society of frat boys.",
  }),
  Object.freeze({
    id: "phoenix",
    name: "Phoenix",
    desc: "Phoenixes are avians that constantly emanate heat. When they die, they can sometimes self-resurrect in an explosion of fire.",
  }),
  Object.freeze({
    id: "salamander",
    name: "Salamander",
    desc: "Salamanders are descended from lizards who evolved around lava flows. They can exhale intense flames and are not to be trifled with.",
  }),
  Object.freeze({
    id: "yeti",
    name: "Yeti",
    desc: "Yeti are polar apes that dislike hot locations. For some reason, pictures of them are always blurry.",
  }),
  Object.freeze({
    id: "wendigo",
    name: "Wendigo",
    desc: "Wendigos are horrific creatures that were born in the coldest climates. They have ravenous appetites which are never sated, and they feed only on the souls of other creatures.",
  }),
  Object.freeze({
    id: "tuskin",
    name: "Tuskin",
    desc: "Tuskin evolved in the deserts and are normally hostile to anyone who is not part of their clan. They will often attack strangers for any resources they might provide.",
  }),
  Object.freeze({
    id: "kamel",
    name: "Kamel",
    desc: "The Kamel are a race of humanoids with a giant hump on their back. They can go for long periods of time without drinking water.",
  }),
  Object.freeze({
    id: "balorg",
    name: "Balorg",
    desc: "Balorg are a fiery race of demons who inhabit the abyss. Their skin literally burns with hellfire and few who gaze upon them live to tell the tale.",
  }),
  Object.freeze({
    id: "imp",
    name: "Imp",
    desc: "Imps are a small race of demonic creatures who delight in tormenting their victims with pranks that are far from harmless.",
  }),
  Object.freeze({
    id: "seraph",
    name: "Seraph",
    desc: "Seraph are a race of angelic beings who inhabit the mountains of Eden. Although they champion the light, they won't hesitate to smite evil wherever it is found.",
  }),
  Object.freeze({
    id: "unicorn",
    name: "Unicorn",
    desc: "Unicorns are mythical creatures of the light who roam the plains of Eden. Despite their reputation for good, unicorns are quite vicious when challenged.",
  }),
  Object.freeze({
    id: "synth",
    name: "Synth",
    desc: "Synths are androids that have been covered in organic flesh to look just like their creator race. To an outside observer they appear indistinguishable from fully organic %0.",
  }),
  Object.freeze({
    id: "nano",
    name: "Nano",
    desc: "The Nano are swarms of tiny robots that work together to form larger entities. Each nano citizen is made up of trillions of individual nanites.",
  }),
  Object.freeze({
    id: "ghast",
    name: "Ghast",
    desc: "The Ghast are a species of nightmarish dark-dwelling creatures that are fast, strong, and cannibalistic.",
  }),
  Object.freeze({
    id: "shoggoth",
    name: "Shoggoth",
    desc: "Shoggoth are sentient amoeba-like blobs of flesh that can sprout eyes, mouths, and pseudopodia anywhere on their body at will.",
  }),
  Object.freeze({
    id: "raptors",
    name: "Raptors",
    desc: "Raptors are theropods often thought to be related to birds. They are resourceful scavengers.",
  }),
  Object.freeze({
    id: "rexicus",
    name: "Rexicus",
    desc: "Rexicus are large theropods, they are fast for their size and very dangerous.",
  }),
  Object.freeze({
    id: "dwarf",
    name: "Dwarf",
    desc: "Dwarves are short stocky humanoids known for their beards and love of alcohol.",
  }),
  Object.freeze({
    id: "raccoon",
    name: "Racconar",
    desc: "Racconar are a species of highly evolved raccoons that love to tinker and have a habit of kleptomania.",
  }),
  Object.freeze({
    id: "lichen",
    name: "Lichen",
    desc: "Lichen are a symbiotic creature that evolved as a strange blend of plant and fungi that blend together to make a single bush like creature.",
  }),
  Object.freeze({
    id: "wyvern",
    name: "Wyvern",
    desc: "Wyvern are a ferocious species of flying reptiles.",
  }),
  Object.freeze({
    id: "beholder",
    name: "Eye-Spector",
    desc: "Eye-Spectors are deadly giant floating eyeballs that dominate everything around them.",
  }),
  Object.freeze({
    id: "djinn",
    name: "Djinn",
    desc: "Djinn are mystical creatures that are rumored to be able to grant wishes.",
  }),
  Object.freeze({
    id: "narwhal",
    name: "Narwhalus",
    desc: "The Narwhalus are large mono-tusked creatures that evolved in the arctic regions. They are descendant from whales and have a single large tusk.",
  }),
  Object.freeze({
    id: "bombardier",
    name: "Bombardier",
    desc: "The Bombardier are descended from beetles and can spit literal fireballs at anyone who challenges them.",
  }),
  Object.freeze({
    id: "nephilim",
    name: "Nephilim",
    desc: "Nephilim are descendants of an unholy union between celestial and demonic beings.",
  }),
  Object.freeze({
    id: "mammuth",
    name: "Mammuth",
    desc: "Mammuths are lumbering elephant-like creatures covered in dense fur. They are highly intelligent and protective of their young.",
  }),
  Object.freeze({
    id: "hellspawn",
    name: "Hellspawn",
    desc: "Hellspawn are literal spawn of the hell dimension.",
  }),
  Object.freeze({
    id: "junker",
    name: "Valdi",
    desc: "The Valdi are a genetic disaster; it's a wonder they have survived this long.",
  }),
  Object.freeze({
    id: "sludge",
    name: "Sludge",
    desc: "The Sludge are a pathetic genetic disaster of ooze made self aware; it's a wonder they can function at all.",
  }),
  Object.freeze({
    id: "ultra_sludge",
    name: "Ultra Sludge",
    desc: "The Ultra Sludge are a repulsive genetic disaster of ooze made self aware; it's pretty bad, really just terrible, the worst.",
  }),
]);

/** Genus option types in first-seen order, mirroring the compat reader. */
export const CAPTURED_TRAIT_GENUS_TYPES: readonly {
  readonly id: string;
  readonly label: string;
}[] = Object.freeze([
  Object.freeze({ id: "humanoid", label: "Humanoid" }),
  Object.freeze({ id: "carnivore", label: "Carnivorous Beast" }),
  Object.freeze({ id: "herbivore", label: "Herbivorous Beast" }),
  Object.freeze({ id: "omnivore", label: "Omnivorous Beast" }),
  Object.freeze({ id: "small", label: "Small" }),
  Object.freeze({ id: "giant", label: "Giant" }),
  Object.freeze({ id: "reptilian", label: "Reptilian" }),
  Object.freeze({ id: "avian", label: "Avian" }),
  Object.freeze({ id: "plant", label: "Plant" }),
  Object.freeze({ id: "fungi", label: "Fungi" }),
  Object.freeze({ id: "insectoid", label: "Insectoid" }),
  Object.freeze({ id: "aquatic", label: "Aquatic" }),
  Object.freeze({ id: "fey", label: "Fey" }),
  Object.freeze({ id: "heat", label: "Heat" }),
  Object.freeze({ id: "polar", label: "Polar" }),
  Object.freeze({ id: "sand", label: "Sand" }),
  Object.freeze({ id: "demonic", label: "Demonic" }),
  Object.freeze({ id: "angelic", label: "Angelic" }),
  Object.freeze({ id: "eldritch", label: "Eldritch" }),
  Object.freeze({ id: "primordial", label: "Primordial" }),
  Object.freeze({ id: "hybrid", label: "Hybrid" }),
]);

/** Psychic power options in script order. */
export const CAPTURED_TRAIT_PSYCHIC: readonly {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
}[] = Object.freeze([
  Object.freeze({
    id: "boost",
    label: "Boost Resource Production",
    hint: "Boost production of a single resource by %0%.",
  }),
  Object.freeze({
    id: "murder",
    label: "Murder a Citizen",
    hint: "Kill one of your citizens in cold blood.",
  }),
  Object.freeze({
    id: "assault",
    label: "Boost Attack Power",
    hint: "Boost your army rating by %0%.",
  }),
  Object.freeze({
    id: "profit",
    label: "Boost Profits",
    hint: "Boost your income by %0%.",
  }),
  Object.freeze({
    id: "stun",
    label: "Psychic Stun",
    hint: "Capture a surface dweller so you can later convert them into a thrall.",
  }),
  Object.freeze({
    id: "mind_break",
    label: "Mind Break",
    hint: "Convert a captive into a thrall",
  }),
]);

/** Psychic-boost resources: `atomic_mass` keys in file order. */
export const CAPTURED_TRAIT_BOOST_RESOURCES: readonly {
  readonly id: string;
  readonly label: string;
}[] = Object.freeze([
  Object.freeze({ id: "Food", label: "Food" }),
  Object.freeze({ id: "Lumber", label: "Lumber" }),
  Object.freeze({ id: "Chrysotile", label: "Chrysotile" }),
  Object.freeze({ id: "Stone", label: "Stone" }),
  Object.freeze({ id: "Crystal", label: "Crystal" }),
  Object.freeze({ id: "Furs", label: "Furs" }),
  Object.freeze({ id: "Copper", label: "Copper" }),
  Object.freeze({ id: "Iron", label: "Iron" }),
  Object.freeze({ id: "Aluminium", label: "Aluminium" }),
  Object.freeze({ id: "Cement", label: "Cement" }),
  Object.freeze({ id: "Coal", label: "Coal" }),
  Object.freeze({ id: "Oil", label: "Oil" }),
  Object.freeze({ id: "Uranium", label: "Uranium" }),
  Object.freeze({ id: "Steel", label: "Steel" }),
  Object.freeze({ id: "Titanium", label: "Titanium" }),
  Object.freeze({ id: "Alloy", label: "Alloy" }),
  Object.freeze({ id: "Polymer", label: "Polymer" }),
  Object.freeze({ id: "Iridium", label: "Iridium" }),
  Object.freeze({ id: "Helium_3", label: "Helium-3" }),
  Object.freeze({ id: "Deuterium", label: "Deuterium" }),
  Object.freeze({ id: "Tungsten", label: "Tungsten" }),
  Object.freeze({ id: "Neutronium", label: "Neutronium" }),
  Object.freeze({ id: "Adamantite", label: "Adamantite" }),
  Object.freeze({ id: "Infernite", label: "Infernite" }),
  Object.freeze({ id: "Elerium", label: "Elerium" }),
  Object.freeze({ id: "Nano_Tube", label: "Nano Tube" }),
  Object.freeze({ id: "Graphene", label: "Graphene" }),
  Object.freeze({ id: "Stanene", label: "Stanene" }),
  Object.freeze({ id: "Bolognium", label: "Bolognium" }),
  Object.freeze({ id: "Unobtainium", label: "Unobtainium" }),
  Object.freeze({ id: "Vitreloy", label: "Vitreloy" }),
  Object.freeze({ id: "Orichalcum", label: "Orichalcum" }),
  Object.freeze({ id: "Asphodel_Powder", label: "Asphodel Powder" }),
  Object.freeze({ id: "Elysanite", label: "Elysanite" }),
  Object.freeze({ id: "Water", label: "Water" }),
  Object.freeze({ id: "Plywood", label: "Plywood" }),
  Object.freeze({ id: "Brick", label: "Brick" }),
  Object.freeze({ id: "Wrought_Iron", label: "Wrought Iron" }),
  Object.freeze({ id: "Sheet_Metal", label: "Sheet Metal" }),
  Object.freeze({ id: "Mythril", label: "Mythril" }),
  Object.freeze({ id: "Aerogel", label: "Aerogel" }),
  Object.freeze({ id: "Nanoweave", label: "Nanoweave" }),
  Object.freeze({ id: "Scarletite", label: "Scarletite" }),
  Object.freeze({ id: "Quantium", label: "Quantium" }),
  Object.freeze({ id: "Super_Fuel", label: "Super Fuel" }),
  Object.freeze({ id: "Aerographene", label: "Aerographene" }),
]);

/** Wish options (minor): `wish_for` composed over each wish label. */
export const CAPTURED_TRAIT_WISH_MINOR: readonly {
  readonly id: string;
  readonly label: string;
}[] = Object.freeze([
  Object.freeze({ id: "Know", label: "Wish for Knowledge" }),
  Object.freeze({ id: "Money", label: "Wish for Money" }),
  Object.freeze({ id: "Res", label: "Wish for Resources" }),
  Object.freeze({ id: "Love", label: "Wish for Love" }),
  Object.freeze({ id: "Excite", label: "Wish for Excitement" }),
  Object.freeze({ id: "Fame", label: "Wish for Fame" }),
  Object.freeze({ id: "Strength", label: "Wish for Strength" }),
  Object.freeze({ id: "Influence", label: "Wish for Influence" }),
]);

/** Wish options (major): `wish_for` composed over each wish label. */
export const CAPTURED_TRAIT_WISH_MAJOR: readonly {
  readonly id: string;
  readonly label: string;
}[] = Object.freeze([
  Object.freeze({ id: "BigMoney", label: "Wish for Fat Stacks of Cash" }),
  Object.freeze({ id: "BigRes", label: "Wish for Lots of Resources" }),
  Object.freeze({ id: "Plasmid", label: "Wish for Plasmids" }),
  Object.freeze({ id: "Power", label: "Wish for Power" }),
  Object.freeze({ id: "Adoration", label: "Wish for Adoration" }),
  Object.freeze({ id: "Thrill", label: "Wish for Thrills" }),
  Object.freeze({ id: "Peace", label: "Wish for Peace" }),
  Object.freeze({ id: "Greatness", label: "Wish for Greatness" }),
]);

/** `neg_roll_traits` in `src/races.js`: traits offering reset toggles. */
export const CAPTURED_TRAIT_NEG_ROLL: ReadonlySet<string> = new Set([
  "angry",
  "arrogant",
  "atrophy",
  "diverse",
  "dumb",
  "fragrant",
  "frail",
  "freespirit",
  "gluttony",
  "gnawer",
  "greedy",
  "hard_of_hearing",
  "heavy",
  "hooved",
  "invertebrate",
  "lazy",
  "mistrustful",
  "nearsighted",
  "nyctophilia",
  "paranoid",
  "pathetic",
  "pessimistic",
  "puny",
  "pyrophobia",
  "skittish",
  "slow",
  "slow_regen",
  "snowy",
  "solitary",
  "unorganized",
  "unfavored",
]);

/**
 * Race id to race `type`, for mutable-trait genus grouping. junker/sludge/ultra_sludge
 * compute their type from the run's `jtype` (default humanoid); the default is baked.
 */
export const CAPTURED_TRAIT_RACE_TYPE: Readonly<Record<string, string>> =
  Object.freeze({
    protoplasm: "organism",
    human: "humanoid",
    elven: "humanoid",
    orc: "humanoid",
    cath: "carnivore",
    wolven: "carnivore",
    vulpine: "carnivore",
    centaur: "herbivore",
    rhinotaur: "herbivore",
    capybara: "herbivore",
    porkenari: "omnivore",
    hedgeoken: "omnivore",
    kobold: "small",
    goblin: "small",
    gnome: "small",
    ogre: "giant",
    cyclops: "giant",
    troll: "giant",
    tortoisan: "reptilian",
    gecko: "reptilian",
    slitheryn: "reptilian",
    arraak: "avian",
    pterodacti: "avian",
    dracnid: "avian",
    entish: "plant",
    cacti: "plant",
    pinguicula: "plant",
    sporgar: "fungi",
    shroomi: "fungi",
    moldling: "fungi",
    mantis: "insectoid",
    scorpid: "insectoid",
    antid: "insectoid",
    sharkin: "aquatic",
    octigoran: "aquatic",
    dryad: "fey",
    satyr: "fey",
    phoenix: "heat",
    salamander: "heat",
    yeti: "polar",
    wendigo: "polar",
    tuskin: "sand",
    kamel: "sand",
    balorg: "demonic",
    imp: "demonic",
    seraph: "angelic",
    unicorn: "angelic",
    synth: "synthetic",
    nano: "synthetic",
    ghast: "eldritch",
    shoggoth: "eldritch",
    raptors: "primordial",
    rexicus: "primordial",
    dwarf: "hybrid",
    raccoon: "hybrid",
    lichen: "hybrid",
    wyvern: "hybrid",
    beholder: "hybrid",
    djinn: "hybrid",
    narwhal: "hybrid",
    bombardier: "hybrid",
    nephilim: "hybrid",
    mammuth: "hybrid",
    hellspawn: "demonic",
    junker: "humanoid",
    sludge: "humanoid",
    ultra_sludge: "humanoid",
  });

/** Label for the mimic-genus `none` option. */
export const CAPTURED_TRAIT_GENUS_NONE_LABEL = "None";

/** Ocular power rows in `ocularPowerData` order. */
export const CAPTURED_TRAIT_OCULAR: readonly {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
}[] = Object.freeze([
  Object.freeze({
    id: "disintegration",
    label: "Disintegration",
    hint: "Disintegration rays increase your combat power by %0%.",
  }),
  Object.freeze({
    id: "petrification",
    label: "Petrification",
    hint: "Turn enemies you defeat into %0.",
  }),
  Object.freeze({
    id: "wound",
    label: "Wound",
    hint: "Wound prey, improve hunting by %0%.",
  }),
  Object.freeze({
    id: "telekinesis",
    label: "Telekinesis",
    hint: "Use your telekinetic powers to improve hard labor jobs by %0%.",
  }),
  Object.freeze({
    id: "fear",
    label: "Fear",
    hint: "Scare away potential enemies.",
  }),
  Object.freeze({
    id: "charm",
    label: "Charm",
    hint: "Get %0% better trade deals.",
  }),
]);

/** Minor-trait rows in `traits` order, then fortify/mastery. */
export const CAPTURED_TRAIT_MINOR: readonly {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
}[] = Object.freeze([
  Object.freeze({
    id: "tactical",
    label: "Tactical",
    hint: "Increases army rating by %0%.",
  }),
  Object.freeze({
    id: "analytical",
    label: "Analytical",
    hint: "Increases Knowledge output by %0%.",
  }),
  Object.freeze({
    id: "resilient",
    label: "Resilient",
    hint: "Increases Coal, Oil and Helium-3 production by %0%.",
  }),
  Object.freeze({
    id: "cunning",
    label: "Cunning",
    hint: "Reduces the cost of buying resources at the market by %0%.",
  }),
  Object.freeze({
    id: "hardy",
    label: "Hardy",
    hint: "Increases factory output by %0%.",
  }),
  Object.freeze({
    id: "ambidextrous",
    label: "Ambidextrous",
    hint: "Increases crafting speed by %0%, and automated crafting by %1%.",
  }),
  Object.freeze({
    id: "industrious",
    label: "Industrious",
    hint: "Increases mining output by %0%.",
  }),
  Object.freeze({
    id: "fibroblast",
    label: "Fibroblast",
    hint: "Increases soldier healing by %0%.",
  }),
  Object.freeze({
    id: "metallurgist",
    label: "Metallurgist",
    hint: "Increases Alloy production by %0%.",
  }),
  Object.freeze({
    id: "gambler",
    label: "Gambler",
    hint: "Increases casino income by %0%.",
  }),
  Object.freeze({
    id: "persuasive",
    label: "Persuasive",
    hint: "Increases the value of trade routes by %0%.",
  }),
  Object.freeze({
    id: "refiner",
    label: "Refiner",
    hint: "Increases smelter output by %0%.",
  }),
  Object.freeze({
    id: "plunderer",
    label: "Plunderer",
    hint: "Increases loot taken from attacking rival governments by %0%.",
  }),
  Object.freeze({
    id: "stockpiler",
    label: "Stockpiler",
    hint: "Increases the capacity of %1 and %2 by %0%.",
  }),
  Object.freeze({
    id: "assayer",
    label: "Assayer",
    hint: "Increases %1 and %2 production by %0%.",
  }),
  Object.freeze({
    id: "nanoweaver",
    label: "Nanoweaver",
    hint: "Increases %1, %2 and %3 production by %0%.",
  }),
  Object.freeze({
    id: "sapper",
    label: "Sapper",
    hint: "Increases %1 production by %0%.",
  }),
  Object.freeze({
    id: "arborist",
    label: "Arborist",
    hint: "Increases %1 production by %0%.",
  }),
  Object.freeze({
    id: "stonecutter",
    label: "Stonecutter",
    hint: "Increases %1 production by %0%.",
  }),
  Object.freeze({
    id: "archivist",
    label: "Archivist",
    hint: "Increases maximum %1 by %0%.",
  }),
  Object.freeze({
    id: "bureaucrat",
    label: "Bureaucrat",
    hint: "Increases tax revenue by %0%.",
  }),
  Object.freeze({
    id: "zealot",
    label: "Zealot",
    hint: "Increases temple output by %0%.",
  }),
  Object.freeze({
    id: "stargazer",
    label: "Stargazer",
    hint: "Increases %1 from observatories by %0%.",
  }),
  Object.freeze({
    id: "engineer",
    label: "Engineer",
    hint: "Increases A.R.P.A. project progress by %0%.",
  }),
  Object.freeze({
    id: "logistician",
    label: "Logistician",
    hint: "Increases trade route capacity by %0%.",
  }),
  Object.freeze({
    id: "quartermaster",
    label: "Quartermaster",
    hint: "Increases soldier capacity by %0%.",
  }),
  Object.freeze({
    id: "steward",
    label: "Steward",
    hint: "Increases the maximum storage of all resources by %0%.",
  }),
  Object.freeze({
    id: "taskmaster",
    label: "Taskmaster",
    hint: "Increases the output of all citizen jobs by %0%.",
  }),
  Object.freeze({
    id: "queuemaster",
    label: "Queuemaster",
    hint: "Increases the maximum size of the building queue by %0.",
  }),
  Object.freeze({
    id: "guildmaster",
    label: "Guildmaster",
    hint: "Increases the maximum number of craftsmen by %0.",
  }),
  Object.freeze({
    id: "thaumaturge",
    label: "Thaumaturge",
    hint: "Increases %1 production by %0%.",
  }),
  Object.freeze({
    id: "despot",
    label: "Despot",
    hint: "Increases your %1 by %0%.",
  }),
  Object.freeze({
    id: "versatile",
    label: "Versatile",
    hint: "Increases the output of all crafted goods by %0%.",
  }),
  Object.freeze({
    id: "ambusher",
    label: "Ambusher",
    hint: "Increases soldier training speed by %0%.",
  }),
  Object.freeze({
    id: "ruminant",
    label: "Ruminant",
    hint: "Increases maximum population by %0%.",
  }),
  Object.freeze({
    id: "opportunist",
    label: "Opportunist",
    hint: "Increases mining output and crafting speed by %0%.",
  }),
  Object.freeze({
    id: "frugal",
    label: "Frugal",
    hint: "Reduces the cost of housing by %0%.",
  }),
  Object.freeze({
    id: "titanic",
    label: "Titanic",
    hint: "Increases the output of manual labour by %0%.",
  }),
  Object.freeze({
    id: "moltskin",
    label: "Moltskin",
    hint: "Passively produces %1 each second equal to %0% of your population.",
  }),
  Object.freeze({
    id: "featherlight",
    label: "Featherlight",
    hint: "Increases ship speed by %0%.",
  }),
  Object.freeze({
    id: "swarm",
    label: "Swarm",
    hint: "Increases population growth by %0%.",
  }),
  Object.freeze({
    id: "chlorophyll",
    label: "Chlorophyll",
    hint: "Increases %1 production by %0%.",
  }),
  Object.freeze({
    id: "mycelial",
    label: "Mycelial",
    hint: "Increases soldier healing by %0%.",
  }),
  Object.freeze({
    id: "abyssal",
    label: "Abyssal",
    hint: "Increases %1, %2 and %3 production by %0%.",
  }),
  Object.freeze({
    id: "glamour",
    label: "Glamour",
    hint: "Increases morale by %0%.",
  }),
  Object.freeze({
    id: "fireweave",
    label: "Fireweave",
    hint: "Increases %1 production by %0%.",
  }),
  Object.freeze({
    id: "frostbound",
    label: "Frostbound",
    hint: "Reduces the power consumed by buildings by %0%.",
  }),
  Object.freeze({
    id: "duneborn",
    label: "Duneborn",
    hint: "Increases %1 production by %0%.",
  }),
  Object.freeze({
    id: "infernal",
    label: "Infernal",
    hint: "Increases combat effectiveness in Hell and mech damage by %0%.",
  }),
  Object.freeze({
    id: "radiant",
    label: "Radiant",
    hint: "Increases temple output by %0%.",
  }),
  Object.freeze({
    id: "overclocked",
    label: "Overclocked",
    hint: "Increases factory output by %0%.",
  }),
  Object.freeze({
    id: "cerebral",
    label: "Cerebral",
    hint: "Increases %1 gain by %0%.",
  }),
  Object.freeze({
    id: "fortify",
    label: "Fortify",
    hint: "Your genes have been fortified to resist genetic decay.",
  }),
  Object.freeze({
    id: "mastery",
    label: "Mastery",
    hint: "Increases Mastery by %0%.",
  }),
]);

/** Mutable-trait rows in `traits` order. `source` is the upstream `origin`/`genus` field. */
export const CAPTURED_TRAIT_MUTABLE: readonly {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly label: string;
  readonly hint: string;
}[] = Object.freeze([
  Object.freeze({
    id: "adaptable",
    type: "genus",
    source: "humanoid",
    label: "Adaptable",
    hint: "Your race is more easily modified by gene therapy.",
  }),
  Object.freeze({
    id: "wasteful",
    type: "genus",
    source: "humanoid",
    label: "Wasteful",
    hint: "Your race is wasteful and uses extra materials to craft things.",
  }),
  Object.freeze({
    id: "carnivore",
    type: "genus",
    source: "carnivore",
    label: "Carnivore",
    hint: "Your species is carnivorous and does not engage in agriculture.",
  }),
  Object.freeze({
    id: "beast",
    type: "genus",
    source: "carnivore",
    label: "Beast",
    hint: "Your bestial instincts improve your hunting skills and make training soldiers easier.",
  }),
  Object.freeze({
    id: "cautious",
    type: "genus",
    source: "carnivore",
    label: "Cautious",
    hint: "Your race is less effective at combat when it is precipitating.",
  }),
  Object.freeze({
    id: "herbivore",
    type: "genus",
    source: "herbivore",
    label: "Herbivore",
    hint: "Your species does not eat meat.",
  }),
  Object.freeze({
    id: "instinct",
    type: "genus",
    source: "herbivore",
    label: "Instincts",
    hint: "Your highly-toned instincts help you avoid danger.",
  }),
  Object.freeze({
    id: "forager",
    type: "genus",
    source: "hybrid",
    label: "Forager",
    hint: "Your race are experts at foraging for resources.",
  }),
  Object.freeze({
    id: "small",
    type: "genus",
    source: "small",
    label: "Small",
    hint: "Your race is small and thus requires fewer materials to build things.",
  }),
  Object.freeze({
    id: "weak",
    type: "genus",
    source: "small",
    label: "Weak",
    hint: "Your race is ineffective at tough manual labor.",
  }),
  Object.freeze({
    id: "large",
    type: "genus",
    source: "giant",
    label: "Large",
    hint: "Your race is large and thus requires extra materials to build things.",
  }),
  Object.freeze({
    id: "strong",
    type: "genus",
    source: "giant",
    label: "Strong",
    hint: "Your race has great strength and can do menial labor jobs much faster.",
  }),
  Object.freeze({
    id: "cold_blooded",
    type: "genus",
    source: "reptilian",
    label: "Cold Blooded",
    hint: "Your species is sensitive to the outside temperature.",
  }),
  Object.freeze({
    id: "scales",
    type: "genus",
    source: "reptilian",
    label: "Scales",
    hint: "Your species is protected by scales that act as a kind of natural armor.",
  }),
  Object.freeze({
    id: "flier",
    type: "genus",
    source: "avian",
    label: "Flier",
    hint: "Your species can fly and prefers to use lightweight clay-based materials for construction.",
  }),
  Object.freeze({
    id: "hollow_bones",
    type: "genus",
    source: "avian",
    label: "Hollow Bones",
    hint: "Your species has lightweight bones and requires less crafted material to build structures.",
  }),
  Object.freeze({
    id: "sky_lover",
    type: "genus",
    source: "avian",
    label: "Sky Lover",
    hint: "Your species feels most at peace under open skies and greatly dislikes working underground.",
  }),
  Object.freeze({
    id: "high_pop",
    type: "genus",
    source: "insectoid",
    label: "High Population",
    hint: "Your species grows to large numbers, for better or worse.",
  }),
  Object.freeze({
    id: "fast_growth",
    type: "genus",
    source: "insectoid",
    label: "Fast Growth",
    hint: "Your species gestates quickly, so its population raises faster than other species.",
  }),
  Object.freeze({
    id: "high_metabolism",
    type: "genus",
    source: "insectoid",
    label: "High Metabolism",
    hint: "Your species metabolizes food quickly. As a result, you need more of it.",
  }),
  Object.freeze({
    id: "photosynth",
    type: "genus",
    source: "plant",
    label: "Photosynth",
    hint: "Your race produces part of its food requirements through photosynthesis.",
  }),
  Object.freeze({
    id: "sappy",
    type: "genus",
    source: "plant",
    label: "Sappy",
    hint: "Your people naturally produce sap, which can be hardened into a useful building material called %0.",
  }),
  Object.freeze({
    id: "asymmetrical",
    type: "genus",
    source: "plant",
    label: "Asymmetrical",
    hint: "Your species is asymmetrical. This gives you a more monstrous appearance, making trade more difficult.",
  }),
  Object.freeze({
    id: "detritivore",
    type: "genus",
    source: "fungi",
    label: "Detritivore",
    hint: "You consume dead matter for nutrition.",
  }),
  Object.freeze({
    id: "spores",
    type: "genus",
    source: "fungi",
    label: "Spores",
    hint: "Your species propagates quickly when it's windy.",
  }),
  Object.freeze({
    id: "spongy",
    type: "genus",
    source: "fungi",
    label: "Spongy",
    hint: "Your species doesn't propagate when it's precipitating.",
  }),
  Object.freeze({
    id: "submerged",
    type: "genus",
    source: "aquatic",
    label: "Submerged",
    hint: "Your species lives primarily underwater and is thus not affected by most weather.",
  }),
  Object.freeze({
    id: "low_light",
    type: "genus",
    source: "aquatic",
    label: "Low Light",
    hint: "Sunlight does not penetrate into the depths of the ocean easily, and farming activities are less effective as a result.",
  }),
  Object.freeze({
    id: "elusive",
    type: "genus",
    source: "fey",
    label: "Elusive",
    hint: "Your spies rarely, if ever, get caught.",
  }),
  Object.freeze({
    id: "iron_allergy",
    type: "genus",
    source: "fey",
    label: "Iron Allergy",
    hint: "Iron is toxic to you. It must be handled with care, thus making mining and refining it slower.",
  }),
  Object.freeze({
    id: "smoldering",
    type: "genus",
    source: "heat",
    label: "Smoldering",
    hint: "You revel in hot weather, gaining increasing production the longer it lasts.",
  }),
  Object.freeze({
    id: "cold_intolerance",
    type: "genus",
    source: "heat",
    label: "Cold Intolerance",
    hint: "You despise cold weather, losing increasing production the longer it lasts.",
  }),
  Object.freeze({
    id: "chilled",
    type: "genus",
    source: "polar",
    label: "Chilled",
    hint: "You revel in cold weather, gaining increasing production the longer it lasts.",
  }),
  Object.freeze({
    id: "heat_intolerance",
    type: "genus",
    source: "polar",
    label: "Heat Intolerance",
    hint: "You despise hot weather, losing increasing production the longer it lasts.",
  }),
  Object.freeze({
    id: "scavenger",
    type: "genus",
    source: "sand",
    label: "Scavenger",
    hint: "You can assign scavengers to look for useful items which boost productivity.",
  }),
  Object.freeze({
    id: "nomadic",
    type: "genus",
    source: "sand",
    label: "Nomadic",
    hint: "Your nomadic lifestyle makes established trade more difficult.",
  }),
  Object.freeze({
    id: "immoral",
    type: "genus",
    source: "demonic",
    label: "Immoral",
    hint: "Your race is immoral and delights in conflict.",
  }),
  Object.freeze({
    id: "evil",
    type: "genus",
    source: "demonic",
    label: "Evil",
    hint: "Your race is pure evil.",
  }),
  Object.freeze({
    id: "blissful",
    type: "genus",
    source: "angelic",
    label: "Blissful",
    hint: "Your citizens exist in a state of bliss; it takes a lot to make them upset.",
  }),
  Object.freeze({
    id: "pompous",
    type: "genus",
    source: "angelic",
    label: "Pompous",
    hint: "The pompous attitude of your species hinders academic pursuits. Professors are significantly less effective.",
  }),
  Object.freeze({
    id: "holy",
    type: "genus",
    source: "angelic",
    label: "Holy",
    hint: "You are filled with holy energy, which helps you smite evil creatures.",
  }),
  Object.freeze({
    id: "artifical",
    type: "genus",
    source: "synthetic",
    label: "Artificial",
    hint: "You are an artificial lifeform. Additional units must be constructed; population does not grow naturally.",
  }),
  Object.freeze({
    id: "powered",
    type: "genus",
    source: "synthetic",
    label: "Powered",
    hint: "You require electricity to keep operational.",
  }),
  Object.freeze({
    id: "psychic",
    type: "genus",
    source: "eldritch",
    label: "Psychic",
    hint: "Your species has powerful psychic abilities.",
  }),
  Object.freeze({
    id: "tormented",
    type: "genus",
    source: "eldritch",
    label: "Tormented",
    hint: "Suffering is so routine for your kind that positive morale is an abstract concept.",
  }),
  Object.freeze({
    id: "darkness",
    type: "genus",
    source: "eldritch",
    label: "Darkness",
    hint: "Planets you inhabit strangely have less sunlight.",
  }),
  Object.freeze({
    id: "unfathomable",
    type: "genus",
    source: "eldritch",
    label: "Unfathomable",
    hint: "Other species are completely unable to comprehend your motives and society.",
  }),
  Object.freeze({
    id: "creative",
    type: "major",
    source: "human",
    label: "Creative",
    hint: "Your species's natural creativity leads to faster development of super projects.",
  }),
  Object.freeze({
    id: "diverse",
    type: "major",
    source: "human",
    label: "Diverse",
    hint: "The diverse nature of your species makes working together as a cohesive military unit more difficult.",
  }),
  Object.freeze({
    id: "studious",
    type: "major",
    source: "elven",
    label: "Studious",
    hint: "Your race is more focused when studying than average. Knowledge is gained faster as a result.",
  }),
  Object.freeze({
    id: "arrogant",
    type: "major",
    source: "elven",
    label: "Arrogant",
    hint: "The inherent arrogance of your species often leads to you overpaying in negotiations.",
  }),
  Object.freeze({
    id: "brute",
    type: "major",
    source: "orc",
    label: "Brute",
    hint: "Your race loves fighting and is easier to recruit for battle.",
  }),
  Object.freeze({
    id: "angry",
    type: "major",
    source: "orc",
    label: "Angry",
    hint: "Your race is quick to get angry when hungry.",
  }),
  Object.freeze({
    id: "lazy",
    type: "major",
    source: "cath",
    label: "Lazy",
    hint: "Your race loves nothing more than a lazy afternoon. Productivity is lost in warm weather as a result.",
  }),
  Object.freeze({
    id: "curious",
    type: "major",
    source: "cath",
    label: "Curious",
    hint: "Your race has to know what's behind every closed door. This thirst for knowledge boosts University effectiveness but often gets citizens into trouble.",
  }),
  Object.freeze({
    id: "pack_mentality",
    type: "major",
    source: "wolven",
    label: "Pack Mentality",
    hint: "Your race prefers to live in groups.",
  }),
  Object.freeze({
    id: "tracker",
    type: "major",
    source: "wolven",
    label: "Tracker",
    hint: "Your race excels at tracking game, and thus produces more from hunting.",
  }),
  Object.freeze({
    id: "playful",
    type: "major",
    source: "vulpine",
    label: "Playful",
    hint: "Your hunters are happy playing in the wild.",
  }),
  Object.freeze({
    id: "freespirit",
    type: "major",
    source: "vulpine",
    label: "Free Spirit",
    hint: "Those forced to conform and hold modern jobs are less happy.",
  }),
  Object.freeze({
    id: "beast_of_burden",
    type: "major",
    source: "centaur",
    label: "Beast of Burden",
    hint: "Your race is able to carry away more loot when winning a military conflict.",
  }),
  Object.freeze({
    id: "sniper",
    type: "major",
    source: "centaur",
    label: "Sniper",
    hint: "Your mastery of ranged weaponry makes new weapons more impactful.",
  }),
  Object.freeze({
    id: "hooved",
    type: "major",
    source: "centaur",
    label: "Hooved",
    hint: "You require manufacturing special shoes to expand your population.",
  }),
  Object.freeze({
    id: "rage",
    type: "major",
    source: "rhinotaur",
    label: "Rage",
    hint: "When wounded, your kind rage with power.",
  }),
  Object.freeze({
    id: "heavy",
    type: "major",
    source: "rhinotaur",
    label: "Heavy",
    hint: "Your heavy weight requires extra materials to support.",
  }),
  Object.freeze({
    id: "gnawer",
    type: "major",
    source: "capybara",
    label: "Gnawer",
    hint: "Your race requires constant gnawing to keep your teeth filed.",
  }),
  Object.freeze({
    id: "calm",
    type: "major",
    source: "capybara",
    label: "Calm",
    hint: "Your people are very calm, rarely getting agitated by anything.",
  }),
  Object.freeze({
    id: "pack_rat",
    type: "major",
    source: "kobold",
    label: "Pack Rat",
    hint: "Your species is adept at packing the most stuff into any storage space.",
  }),
  Object.freeze({
    id: "paranoid",
    type: "major",
    source: "kobold",
    label: "Paranoid",
    hint: "Your race is paranoid and doesn't trust banks.",
  }),
  Object.freeze({
    id: "greedy",
    type: "major",
    source: "goblin",
    label: "Greedy",
    hint: "Your race is greedy and will not willingly part with money, reducing income from taxes.",
  }),
  Object.freeze({
    id: "merchant",
    type: "major",
    source: "goblin",
    label: "Merchant",
    hint: "Your race has an innate gift for haggling.",
  }),
  Object.freeze({
    id: "smart",
    type: "major",
    source: "gnome",
    label: "Smart",
    hint: "Your race more easily understands new concepts.",
  }),
  Object.freeze({
    id: "puny",
    type: "major",
    source: "gnome",
    label: "Puny",
    hint: "Your race is less effective in combat.",
  }),
  Object.freeze({
    id: "dumb",
    type: "major",
    source: "ogre",
    label: "Dumb",
    hint: "Your race does not easily understand new concepts.",
  }),
  Object.freeze({
    id: "tough",
    type: "major",
    source: "ogre",
    label: "Tough",
    hint: "Your race is tough and can withstand the most gruelling jobs without succumbing to weakness.",
  }),
  Object.freeze({
    id: "nearsighted",
    type: "major",
    source: "cyclops",
    label: "Nearsighted",
    hint: "Your species is nearsighted and requires bigger font sizes to read.",
  }),
  Object.freeze({
    id: "intelligent",
    type: "major",
    source: "cyclops",
    label: "Intelligent",
    hint: "Your species always leverages the latest advancements in science to its full benefit.",
  }),
  Object.freeze({
    id: "regenerative",
    type: "major",
    source: "troll",
    label: "Regenerative",
    hint: "Your race inherently heals quickly.",
  }),
  Object.freeze({
    id: "gluttony",
    type: "major",
    source: "troll",
    label: "Gluttony",
    hint: "Your species is always hungry and eats extra food.",
  }),
  Object.freeze({
    id: "slow",
    type: "major",
    source: "tortoisan",
    label: "Slow",
    hint: "Your species is slow moving and rarely in a hurry to get anything done.",
  }),
  Object.freeze({
    id: "armored",
    type: "major",
    source: "tortoisan",
    label: "Armored",
    hint: "Your race is naturally armored and thus less likely to be fatally wounded in battle.",
  }),
  Object.freeze({
    id: "optimistic",
    type: "major",
    source: "gecko",
    label: "Optimistic",
    hint: "Your race always tries to look for the best possible outcome.",
  }),
  Object.freeze({
    id: "chameleon",
    type: "major",
    source: "gecko",
    label: "Chameleon",
    hint: "Your species's natural affinity for hiding has caused them to be more averse to having a standing army.",
  }),
  Object.freeze({
    id: "slow_digestion",
    type: "major",
    source: "slitheryn",
    label: "Slow Digestion",
    hint: "Your race digests food slowly and thus will not starve as easily.",
  }),
  Object.freeze({
    id: "astrologer",
    type: "major",
    source: "slitheryn",
    label: "Astrologer",
    hint: "Gain additional astrological effects",
  }),
  Object.freeze({
    id: "hard_of_hearing",
    type: "major",
    source: "slitheryn",
    label: "Hard of Hearing",
    hint: "Your species has poor hearing and thus lectures are less effective.",
  }),
  Object.freeze({
    id: "resourceful",
    type: "major",
    source: "arraak",
    label: "Resourceful",
    hint: "Your species's resourcefulness leads to less waste when crafting.",
  }),
  Object.freeze({
    id: "selenophobia",
    type: "major",
    source: "arraak",
    label: "Selenophobia",
    hint: "Your race prefers moonless nights.",
  }),
  Object.freeze({
    id: "leathery",
    type: "major",
    source: "pterodacti",
    label: "Leathery",
    hint: "Your race has leathery skin, which makes them more weather resistant.",
  }),
  Object.freeze({
    id: "pessimistic",
    type: "major",
    source: "pterodacti",
    label: "Pessimistic",
    hint: "Your race gets depressed easily.",
  }),
  Object.freeze({
    id: "hoarder",
    type: "major",
    source: "dracnid",
    label: "Hoarder",
    hint: "Your race loves to hoard money.",
  }),
  Object.freeze({
    id: "solitary",
    type: "major",
    source: "dracnid",
    label: "Solitary",
    hint: "Your race prefers to live alone rather than with others.",
  }),
  Object.freeze({
    id: "kindling_kindred",
    type: "major",
    source: "entish",
    label: "Kindling Kindred",
    hint: "Your race is averse to cutting down trees for lumber. All lumber costs are removed, but other costs are increased.",
  }),
  Object.freeze({
    id: "iron_wood",
    type: "major",
    source: "entish",
    label: "Iron Wood",
    hint: "Boneweave costs are removed and gain an attack bonus.",
  }),
  Object.freeze({
    id: "pyrophobia",
    type: "major",
    source: "entish",
    label: "Pyrophobia",
    hint: "Your race is afraid of fire and smelters operate slower as a result",
  }),
  Object.freeze({
    id: "catnip",
    type: "major",
    source: "entish",
    label: "Catnip",
    hint: "You give off an odor that attracts cats.",
  }),
  Object.freeze({
    id: "hyper",
    type: "major",
    source: "cacti",
    label: "Hyper",
    hint: "Your race can never sit still and is always doing something.",
  }),
  Object.freeze({
    id: "skittish",
    type: "major",
    source: "cacti",
    label: "Skittish",
    hint: "Your race is easily startled and may lose productivity when scared.",
  }),
  Object.freeze({
    id: "fragrant",
    type: "major",
    source: "pinguicula",
    label: "Fragrant",
    hint: "You give off a strong odor, which while not unpleasant makes hunting harder.",
  }),
  Object.freeze({
    id: "sticky",
    type: "major",
    source: "pinguicula",
    label: "Sticky",
    hint: "Your sticky body traps prey, reducing food requirements and giving you an edge in combat.",
  }),
  Object.freeze({
    id: "anise",
    type: "major",
    source: "pinguicula",
    label: "Anise",
    hint: "You give off an odor that attracts dogs.",
  }),
  Object.freeze({
    id: "infectious",
    type: "major",
    source: "sporgar",
    label: "Infectious",
    hint: "Your race spreads by infecting other creatures and taking over the host body.",
  }),
  Object.freeze({
    id: "parasite",
    type: "major",
    source: "sporgar",
    label: "Parasite",
    hint: "Your species is a parasite and must infect host victims to grow.",
  }),
  Object.freeze({
    id: "toxic",
    type: "major",
    source: "shroomi",
    label: "Toxic",
    hint: "Your species's natural toxicity makes them resistant to toxic workplaces and thus they are more productive in factories.",
  }),
  Object.freeze({
    id: "nyctophilia",
    type: "major",
    source: "shroomi",
    label: "Nyctophilia",
    hint: "Your race does not like direct sunlight, so they are less productive when it's sunny.",
  }),
  Object.freeze({
    id: "infiltrator",
    type: "major",
    source: "moldling",
    label: "Infiltrator",
    hint: "You are the ultimate infiltrator, able to break into any secure location and steal valuable secrets.",
  }),
  Object.freeze({
    id: "hibernator",
    type: "major",
    source: "moldling",
    label: "Hibernator",
    hint: "Your species lowers their metabolic rate during the winter, consuming less energy but also being far less productive.",
  }),
  Object.freeze({
    id: "cannibalize",
    type: "major",
    source: "mantis",
    label: "Cannibalize",
    hint: "You are cannibals and will eat your own kind. Gain the strength of your own by ingesting them.",
  }),
  Object.freeze({
    id: "frail",
    type: "major",
    source: "mantis",
    label: "Frail",
    hint: "Your race is frail and is more likely to die in combat.",
  }),
  Object.freeze({
    id: "malnutrition",
    type: "major",
    source: "mantis",
    label: "Malnutrition",
    hint: "Your race can function while suffering from malnutrition better than most.",
  }),
  Object.freeze({
    id: "claws",
    type: "major",
    source: "scorpid",
    label: "Claws",
    hint: "Your race is more effective in combat.",
  }),
  Object.freeze({
    id: "atrophy",
    type: "major",
    source: "scorpid",
    label: "Atrophy",
    hint: "Your race atrophies quicker when not well-fed.",
  }),
  Object.freeze({
    id: "hivemind",
    type: "major",
    source: "antid",
    label: "Hivemind",
    hint: "Your citizens are highly ineffectual when working as individuals, but gain potency as they work in bigger groups.",
  }),
  Object.freeze({
    id: "tunneler",
    type: "major",
    source: "antid",
    label: "Tunneler",
    hint: "Your species is naturally adept at digging tunnels, which makes mine shafts cheaper to produce.",
  }),
  Object.freeze({
    id: "blood_thirst",
    type: "major",
    source: "sharkin",
    label: "Blood Thirst",
    hint: "The scent of blood sends your troops into a frenzy, increasing your morale temporarily. You are also immune to the warmonger penalty.",
  }),
  Object.freeze({
    id: "apex_predator",
    type: "major",
    source: "sharkin",
    label: "Apex Predator",
    hint: "You are a very dangerous predator. Hunting and combat effectiveness is increased, but armor technology is unusable.",
  }),
  Object.freeze({
    id: "invertebrate",
    type: "major",
    source: "octigoran",
    label: "Invertebrate",
    hint: "Your lack of a skeletal structure means you can't haul away as much loot from battle.",
  }),
  Object.freeze({
    id: "suction_grip",
    type: "major",
    source: "octigoran",
    label: "Suction Grip",
    hint: "Your superior grip boosts all productivity.",
  }),
  Object.freeze({
    id: "befuddle",
    type: "major",
    source: "dryad",
    label: "Befuddle",
    hint: "Your natural guile helps you complete spy actions quicker.",
  }),
  Object.freeze({
    id: "environmentalist",
    type: "major",
    source: "dryad",
    label: "Environmentalist",
    hint: "You seek balance with nature above all other things.",
  }),
  Object.freeze({
    id: "unorganized",
    type: "major",
    source: "satyr",
    label: "Unorganized",
    hint: "It takes longer to organize a revolution.",
  }),
  Object.freeze({
    id: "musical",
    type: "major",
    source: "satyr",
    label: "Musical",
    hint: "Entertainers are more effective at keeping the masses happy.",
  }),
  Object.freeze({
    id: "revive",
    type: "major",
    source: "phoenix",
    label: "Revive",
    hint: "Your soldiers can sometimes revive after being killed. It is much more likely to occur in hot climates.",
  }),
  Object.freeze({
    id: "slow_regen",
    type: "major",
    source: "phoenix",
    label: "Slow Regen",
    hint: "Your soldiers wounds heal at a reduced rate.",
  }),
  Object.freeze({
    id: "forge",
    type: "major",
    source: "salamander",
    label: "Forge",
    hint: "Your ability to breathe fire removes the fuel requirement to operate smelters.",
  }),
  Object.freeze({
    id: "autoignition",
    type: "major",
    source: "salamander",
    label: "Autoignition",
    hint: "Your core body temperature causes paper to combust near you, reducing the knowledge bonus from libraries.",
  }),
  Object.freeze({
    id: "blurry",
    type: "major",
    source: "yeti",
    label: "Blurry",
    hint: "For some reason no one can ever get a good look at you. Spies are less likely to be caught during espionage actions.",
  }),
  Object.freeze({
    id: "snowy",
    type: "major",
    source: "yeti",
    label: "Snowy",
    hint: "Your race loves snow so much that they become depressed when there is no snow.",
  }),
  Object.freeze({
    id: "ravenous",
    type: "major",
    source: "wendigo",
    label: "Ravenous",
    hint: "You are always starving and consume everything available.",
  }),
  Object.freeze({
    id: "ghostly",
    type: "major",
    source: "wendigo",
    label: "Ghostly",
    hint: "Your connection to the ethereal helps attract souls.",
  }),
  Object.freeze({
    id: "lawless",
    type: "major",
    source: "tuskin",
    label: "Lawless",
    hint: "Your disrespect for central authority lets you change government much more frequently.",
  }),
  Object.freeze({
    id: "mistrustful",
    type: "major",
    source: "tuskin",
    label: "Mistrustful",
    hint: "Conflicts cause you to lose reputation with rival cities faster.",
  }),
  Object.freeze({
    id: "humpback",
    type: "major",
    source: "kamel",
    label: "Humpback",
    hint: "You can go longer periods of time without eating and can haul more basic materials from worksites.",
  }),
  Object.freeze({
    id: "thalassophobia",
    type: "major",
    source: "kamel",
    label: "Thalassophobia",
    hint: "You dislike large bodies of water and will not invest in developing the sea.",
  }),
  Object.freeze({
    id: "unfavored",
    type: "major",
    source: "kamel",
    label: "Unfavored",
    hint: "You are unfavored by the heavens.",
  }),
  Object.freeze({
    id: "fiery",
    type: "major",
    source: "balorg",
    label: "Fiery",
    hint: "Your skin burns with unholy fire, making you one of the most feared opponents on the battlefield.",
  }),
  Object.freeze({
    id: "terrifying",
    type: "major",
    source: "balorg",
    label: "Terrifying",
    hint: "You are so terrifying that no one will trade with you.",
  }),
  Object.freeze({
    id: "slaver",
    type: "major",
    source: "balorg",
    label: "Slaver",
    hint: "You use anyone you can capture as forced labor, often working them to death.",
  }),
  Object.freeze({
    id: "compact",
    type: "major",
    source: "imp",
    label: "Compact",
    hint: "You are very small, and thus do not need many materials to construct things.",
  }),
  Object.freeze({
    id: "conniving",
    type: "major",
    source: "imp",
    label: "Conniving",
    hint: "Your conniving ways get you the best deals in trades.",
  }),
  Object.freeze({
    id: "pathetic",
    type: "major",
    source: "imp",
    label: "Pathetic",
    hint: "You are pathetic in combat; the other demons view you as vermin.",
  }),
  Object.freeze({
    id: "spiritual",
    type: "major",
    source: "seraph",
    label: "Spiritual",
    hint: "Your spirituality increases the effectiveness of temples.",
  }),
  Object.freeze({
    id: "truthful",
    type: "major",
    source: "seraph",
    label: "Truthful",
    hint: "You are incapable of lying. This makes you inherently bad at some professions.",
  }),
  Object.freeze({
    id: "unified",
    type: "major",
    source: "seraph",
    label: "Unified",
    hint: "Your race is united and does not war amongst themselves.",
  }),
  Object.freeze({
    id: "rainbow",
    type: "major",
    source: "unicorn",
    label: "Rainbow",
    hint: "Whenever rainbows appear you get a significant productivity boost.",
  }),
  Object.freeze({
    id: "gloomy",
    type: "major",
    source: "unicorn",
    label: "Gloomy",
    hint: "You are dark and broody all the time. You love dark and depressing places.",
  }),
  Object.freeze({
    id: "magnificent",
    type: "major",
    source: "unicorn",
    label: "Magnificent",
    hint: "You are a magnificent creature of the light. Seekers of the light will often leave you tribute at shrines dedicated to your magnificence.",
  }),
  Object.freeze({
    id: "noble",
    type: "major",
    source: "unicorn",
    label: "Noble",
    hint: "Your noble race is immune to corruption and will not implement extreme tax strategies.",
  }),
  Object.freeze({
    id: "imitation",
    type: "major",
    source: "synth",
    label: "Imitation",
    hint: "You are an imitation of another species; you have weaker versions of their attributes as a result.",
  }),
  Object.freeze({
    id: "emotionless",
    type: "major",
    source: "synth",
    label: "Emotionless",
    hint: "You have no emotions; cold logic dictates your decisions.",
  }),
  Object.freeze({
    id: "logical",
    type: "major",
    source: "synth",
    label: "Logical",
    hint: "Your citizens contribute directly to your knowledge cap.",
  }),
  Object.freeze({
    id: "shapeshifter",
    type: "major",
    source: "nano",
    label: "Mimic",
    hint: "You can assume the properties of another genus.",
  }),
  Object.freeze({
    id: "deconstructor",
    type: "major",
    source: "nano",
    label: "Deconstructor",
    hint: "You destroy matter to reorder it for your own purposes.",
  }),
  Object.freeze({
    id: "linked",
    type: "major",
    source: "nano",
    label: "Linked",
    hint: "Your citizens are all linked together, which grants you extra computational power.",
  }),
  Object.freeze({
    id: "dark_dweller",
    type: "major",
    source: "ghast",
    label: "Dark Dweller",
    hint: "Your species hates light and dwells in total darkness.",
  }),
  Object.freeze({
    id: "swift",
    type: "major",
    source: "ghast",
    label: "Swift",
    hint: "Your species is swift, agile, and deadly.",
  }),
  Object.freeze({
    id: "anthropophagite",
    type: "major",
    source: "ghast",
    label: "Anthropophagite",
    hint: "Your people won't hesitate to eat each other if food runs low.",
  }),
  Object.freeze({
    id: "living_tool",
    type: "major",
    source: "shoggoth",
    label: "Living Tool",
    hint: "You are able to morph your body to create basic tools.",
  }),
  Object.freeze({
    id: "bloated",
    type: "major",
    source: "shoggoth",
    label: "Bloated",
    hint: "You have a lot of mass.",
  }),
  Object.freeze({
    id: "artisan",
    type: "major",
    source: "dwarf",
    label: "Master Artisan",
    hint: "Your people are master crafters.",
  }),
  Object.freeze({
    id: "stubborn",
    type: "major",
    source: "dwarf",
    label: "Stubborn",
    hint: "You are incredibly stubborn.",
  }),
  Object.freeze({
    id: "rogue",
    type: "major",
    source: "raccoon",
    label: "Rogue",
    hint: "You have sticky fingers, randomly stealing things.",
  }),
  Object.freeze({
    id: "untrustworthy",
    type: "major",
    source: "raccoon",
    label: "Untrustworthy",
    hint: "Financial institutions cost more to protect themselves from you.",
  }),
  Object.freeze({
    id: "living_materials",
    type: "major",
    source: "lichen",
    label: "Living Materials",
    hint: "You use materials for construction that are alive.",
  }),
  Object.freeze({
    id: "unstable",
    type: "major",
    source: "lichen",
    label: "Unstable",
    hint: "Your species is an unstable mixture of organic components and sometimes dies spontaneously.",
  }),
  Object.freeze({
    id: "elemental",
    type: "major",
    source: "wyvern",
    label: "Elemental",
    hint: "You have an elemental affinity depending on your starting environment.",
  }),
  Object.freeze({
    id: "chicken",
    type: "major",
    source: "wyvern",
    label: "Chicken",
    hint: "You apparently taste like chicken, and other creatures find you delicious to eat. You will experience increased aggression as they crave your meat.",
  }),
  Object.freeze({
    id: "tusk",
    type: "major",
    source: "narwhal",
    label: "Tusked",
    hint: "You have a big tusk.",
  }),
  Object.freeze({
    id: "blubber",
    type: "major",
    source: "narwhal",
    label: "Blubber",
    hint: "Your body is rich in blubber.",
  }),
  Object.freeze({
    id: "ocular_power",
    type: "major",
    source: "beholder",
    label: "Ocular Power",
    hint: "You have a big magical eye.",
  }),
  Object.freeze({
    id: "floating",
    type: "major",
    source: "beholder",
    label: "Floating",
    hint: "You float in the air, and thus are easy to knock around.",
  }),
  Object.freeze({
    id: "wish",
    type: "major",
    source: "djinn",
    label: "Wish",
    hint: "You can grant wishes.",
  }),
  Object.freeze({
    id: "devious",
    type: "major",
    source: "djinn",
    label: "Devious",
    hint: "People are well aware of your reputation for being devious and are hesitant to make deals with you.",
  }),
  Object.freeze({
    id: "grenadier",
    type: "major",
    source: "bombardier",
    label: "Grenadier",
    hint: "You have fewer soldiers, but they are a lot more powerful.",
  }),
  Object.freeze({
    id: "aggressive",
    type: "major",
    source: "bombardier",
    label: "Aggressive",
    hint: "Your people are aggressive and get into a lot of fights.",
  }),
  Object.freeze({
    id: "empowered",
    type: "major",
    source: "nephilim",
    label: "Empowered",
    hint: "Your innate power empowers other traits.",
  }),
  Object.freeze({
    id: "blasphemous",
    type: "major",
    source: "nephilim",
    label: "Blasphemous",
    hint: "Your link to the divine is weakened.",
  }),
  Object.freeze({
    id: "deep_power",
    type: "genus",
    source: "primordial",
    label: "Deep Power",
    hint: "You are connected to ancient primordial forces.",
  }),
  Object.freeze({
    id: "ancient",
    type: "genus",
    source: "primordial",
    label: "Ancient",
    hint: "You are incompatible with highly advanced technology.",
  }),
  Object.freeze({
    id: "scrounger",
    type: "major",
    source: "raptors",
    label: "Scrounger",
    hint: "You know how to find stuff while exploring.",
  }),
  Object.freeze({
    id: "nostalgic",
    type: "major",
    source: "raptors",
    label: "Nostalgic",
    hint: "Your species remember the simpler days more fondly.",
  }),
  Object.freeze({
    id: "humongous",
    type: "major",
    source: "rexicus",
    label: "Humongous",
    hint: "Your species is huge and strong and builds huge and strong buildings.",
  }),
  Object.freeze({
    id: "limited",
    type: "major",
    source: "rexicus",
    label: "Limited",
    hint: "You are less capable of performing delicate work.",
  }),
  Object.freeze({
    id: "wooly",
    type: "major",
    source: "mammuth",
    label: "Wooly",
    hint: "Your species is good at carrying resources around.",
  }),
  Object.freeze({
    id: "mourning",
    type: "major",
    source: "mammuth",
    label: "Mourning",
    hint: "Your species can not handle the stresses of death well.",
  }),
  Object.freeze({
    id: "ooze",
    type: "major",
    source: "sludge",
    label: "Ooze",
    hint: "You are some kind of ooze; everything is more difficult.",
  }),
]);

/** Traits the 1.5.0 breakdown offers for gain. */
export const CAPTURED_TRAIT_GAINABLE: ReadonlySet<string> = new Set([
  "aggressive",
  "angry",
  "anthropophagite",
  "apex_predator",
  "armored",
  "arrogant",
  "artisan",
  "astrologer",
  "atrophy",
  "autoignition",
  "befuddle",
  "blasphemous",
  "bloated",
  "blood_thirst",
  "blubber",
  "blurry",
  "brute",
  "calm",
  "cannibalize",
  "chameleon",
  "chicken",
  "claws",
  "compact",
  "conniving",
  "creative",
  "curious",
  "dark_dweller",
  "deconstructor",
  "devious",
  "diverse",
  "dumb",
  "elemental",
  "emotionless",
  "empowered",
  "environmentalist",
  "fiery",
  "floating",
  "forge",
  "fragrant",
  "freespirit",
  "ghostly",
  "gluttony",
  "gnawer",
  "greedy",
  "grenadier",
  "hard_of_hearing",
  "heavy",
  "hibernator",
  "hivemind",
  "hoarder",
  "hooved",
  "humongous",
  "humpback",
  "hyper",
  "imitation",
  "immoral",
  "infectious",
  "infiltrator",
  "intelligent",
  "invertebrate",
  "kindling_kindred",
  "lawless",
  "lazy",
  "leathery",
  "limited",
  "linked",
  "living_materials",
  "living_tool",
  "logical",
  "magnificent",
  "malnutrition",
  "merchant",
  "mistrustful",
  "mourning",
  "musical",
  "nearsighted",
  "noble",
  "nostalgic",
  "nyctophilia",
  "ocular_power",
  "optimistic",
  "pack_mentality",
  "pack_rat",
  "paranoid",
  "parasite",
  "pathetic",
  "pessimistic",
  "playful",
  "puny",
  "pyrophobia",
  "rage",
  "rainbow",
  "ravenous",
  "regenerative",
  "resourceful",
  "revive",
  "rogue",
  "scrounger",
  "selenophobia",
  "shapeshifter",
  "skittish",
  "slaver",
  "slow",
  "slow_digestion",
  "slow_regen",
  "smart",
  "sniper",
  "snowy",
  "solitary",
  "spiritual",
  "sticky",
  "stubborn",
  "studious",
  "suction_grip",
  "swift",
  "terrifying",
  "tough",
  "toxic",
  "tracker",
  "truthful",
  "tunneler",
  "tusk",
  "unfavored",
  "unified",
  "unorganized",
  "unstable",
  "untrustworthy",
  "wish",
  "wooly",
]);

function traitOption(
  val: string,
  label: string,
  hint = "",
): TraitSettingsSelectOption {
  return Object.freeze({ val, label, hint });
}

/** Controls with fully hardcoded options, copied verbatim from the compat reader. */
export const CAPTURED_TRAIT_STATIC_CONTROLS: readonly TraitSettingsControl[] =
  Object.freeze([
    Object.freeze({
      kind: "select",
      settingName: "buildingShrineType",
      label: "Magnificent shrine",
      hint: "Auto Build shrines only at moons of chosen shrine",
      options: Object.freeze([
        traitOption(
          "any",
          "Any",
          "Build any Shrines, whenever have resources for it",
        ),
        traitOption("equally", "Equally", "Build all Shrines equally"),
        traitOption("morale", "Morale", "Build only Morale Shrines"),
        traitOption("metal", "Metal", "Build only Metal Shrines"),
        traitOption("know", "Knowledge", "Build only Knowledge Shrines"),
        traitOption("tax", "Tax", "Build only Tax Shrines"),
        traitOption(
          "rotating",
          "Rotating",
          "Build Shrines during quarter/full phases for rotating effect shrines",
        ),
      ]),
    }),
    Object.freeze({
      kind: "number",
      settingName: "slaveIncome",
      label: "Minimum income to buy slave",
      hint: "Script will use Slave Market only when money is capped, or have income above given number",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "jobScalePop",
      label: "High Pop job scale",
      hint: "Auto Job will automatically scaly breakpoints to match population increase",
    }),
    Object.freeze({
      kind: "select",
      settingName: "geneticsSequence",
      label: "Sequencer",
      hint: "Manages genome decoding, and mutations",
      options: Object.freeze([
        traitOption(
          "none",
          "Ignore",
          "Ignored by script, managed by game and player",
        ),
        traitOption("enabled", "Enable", "Sequencer enabled"),
        traitOption("disabled", "Disable", "Sequencer disabled"),
        traitOption(
          "decode",
          "Decode",
          "Decode genome only, with no further mutations",
        ),
      ]),
    }),
    Object.freeze({
      kind: "select",
      settingName: "geneticsBoost",
      label: "Sequence Booster",
      hint: "Manages sequencer booster",
      options: Object.freeze([
        traitOption(
          "none",
          "Ignore",
          "Ignored by script, managed by game and player",
        ),
        traitOption("enabled", "Enable", "Booster enabled"),
        traitOption("disabled", "Disable", "Booster disabled"),
      ]),
    }),
    Object.freeze({
      kind: "select",
      settingName: "geneticsAssemble",
      label: "Auto Sequence",
      hint: "Manages genome decoding, and mutations",
      options: Object.freeze([
        traitOption(
          "none",
          "Ignore",
          "Ignored by script, managed by game and player",
        ),
        traitOption("enabled", "Enable", "Auto Sequencer enable"),
        traitOption("disabled", "Disable", "Auto Sequencer disable"),
        traitOption(
          "auto",
          "Script Managed",
          "Gene assembling managed by script, allowing to dump excess knowledge at faster rate, matching income",
        ),
      ]),
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "doNotGoBelowPlasmidSoftcap",
      label: "Do not go below Plasmid softcap",
      hint: "Script will not mutate if the number of remaining plasmids or anti plamids would be lower than the softcap (250 + Phage)",
    }),
    Object.freeze({
      kind: "number",
      settingName: "minimumPlasmidsToPreserve",
      label: "Minimum Plasmids / Anti-Plasmids to preserve",
      hint: "Script will not mutate if the number of remaining plasmids or anti plamids would be lower than this value",
    }),
  ]);

/** Mimic-genus options: ignore/none plus every upstream race type. */
export function buildTraitGenusOptions(): readonly TraitSettingsSelectOption[] {
  return Object.freeze([
    traitOption("ignore", "Ignore", "Do not shift genus"),
    traitOption("none", CAPTURED_TRAIT_GENUS_NONE_LABEL),
    ...CAPTURED_TRAIT_GENUS_TYPES.map((genus) =>
      traitOption(genus.id, genus.label),
    ),
  ]);
}

/** Imitate-race options; completed races show plain, the rest dashed. */
export function buildTraitImitateOptions(
  completedIds: ReadonlySet<string>,
): readonly TraitSettingsSelectOption[] {
  return Object.freeze([
    traitOption(
      "ignore",
      "Ignore",
      "Do not imitate race. IMPORTANT: script will stall at evolution if none selected",
    ),
    ...CAPTURED_TRAIT_RACES.map((race) =>
      traitOption(
        race.id,
        completedIds.has(race.id) ? race.name : `--${race.name}--`,
        race.desc,
      ),
    ),
  ]);
}

/** Psychic-power options in script order. */
export function buildTraitPsychicOptions(): readonly TraitSettingsSelectOption[] {
  return Object.freeze([
    traitOption("none", "Ignore", "Psychic Powers ignored by script"),
    traitOption(
      "auto",
      "Script Managed",
      "Performs one of available actions in this order: Capture, Mind Break, Boost Profits, Boost Resource, Boost Attack Power.",
    ),
    ...CAPTURED_TRAIT_PSYCHIC.map((power) =>
      traitOption(power.id, power.label, power.hint),
    ),
  ]);
}

/** Boosted-resource options: script-managed plus every boostable resource. */
export function buildTraitBoostOptions(): readonly TraitSettingsSelectOption[] {
  return Object.freeze([
    traitOption(
      "auto",
      "Script Managed",
      "Resource selected by looking for highest income among ones having enough free storage room.",
    ),
    ...CAPTURED_TRAIT_BOOST_RESOURCES.map((resource) =>
      traitOption(resource.id, resource.label),
    ),
  ]);
}

/** Wish options: disabling none plus the catalog list. */
export function buildTraitWishOptions(
  kind: "minor" | "major",
): readonly TraitSettingsSelectOption[] {
  const wishes =
    kind === "minor" ? CAPTURED_TRAIT_WISH_MINOR : CAPTURED_TRAIT_WISH_MAJOR;
  return Object.freeze([
    traitOption("none", "None", `Disable using ${kind} wishes.`),
    ...wishes.map((wish) => traitOption(wish.id, wish.label)),
  ]);
}

/** Minor-trait reset context: catalog ids in `traits` order plus ocular ids. */
export function readCapturedMinorTraitContext(): {
  readonly traitNames: readonly string[];
  readonly ocularPowerIds: readonly string[];
} {
  return Object.freeze({
    traitNames: Object.freeze(CAPTURED_TRAIT_MINOR.map((trait) => trait.id)),
    ocularPowerIds: Object.freeze(
      CAPTURED_TRAIT_OCULAR.map((power) => power.id),
    ),
  });
}

/** Mutable-trait reset context: catalog descriptors in `traits` order. */
export function readCapturedMutableTraitContext(): {
  readonly traits: readonly {
    readonly traitName: string;
    readonly type: "major" | "genus";
    readonly genus: string;
    readonly isGainable: boolean;
    readonly isNegRoll: boolean;
  }[];
  readonly genusOrder: readonly string[];
} {
  const seen = new Set<string>();
  const genusOrder: string[] = [];
  const traits = CAPTURED_TRAIT_MUTABLE.map((trait) => {
    const genus =
      trait.type === "genus"
        ? trait.source
        : (CAPTURED_TRAIT_RACE_TYPE[trait.source] ?? trait.source);
    if (!seen.has(genus)) {
      seen.add(genus);
      genusOrder.push(genus);
    }
    return Object.freeze({
      traitName: trait.id,
      type: trait.type === "genus" ? "genus" : "major",
      genus,
      isGainable: CAPTURED_TRAIT_GAINABLE.has(trait.id),
      isNegRoll: CAPTURED_TRAIT_NEG_ROLL.has(trait.id),
    });
  });
  return Object.freeze({
    traits: Object.freeze(traits),
    genusOrder: Object.freeze(genusOrder),
  });
}
