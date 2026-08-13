// Static compatibility catalogs used by the Vue 2 runtime adapters. Keeping
// these values outside the composition closure leaves the runtime responsible
// only for wiring and mutable session state.

export const biomeList = [
  "grassland",
  "oceanic",
  "forest",
  "desert",
  "volcanic",
  "tundra",
  "savanna",
  "swamp",
  "taiga",
  "ashland",
  "hellscape",
  "eden",
];

export const traitList = [
  "none",
  "toxic",
  "mellow",
  "rage",
  "stormy",
  "ozone",
  "magnetic",
  "trashed",
  "elliptical",
  "flare",
  "dense",
  "unstable",
  "permafrost",
  "retrograde",
  "kamikaze",
];

export const extraList = [
  "Achievement",
  "Orbit",
  "Copper",
  "Iron",
  "Aluminium",
  "Coal",
  "Oil",
  "Titanium",
  "Uranium",
  "Iridium",
];

export const planetBiomes = [
  "eden",
  "ashland",
  "volcanic",
  "taiga",
  "tundra",
  "swamp",
  "oceanic",
  "forest",
  "savanna",
  "grassland",
  "desert",
  "hellscape",
];

export const planetTraits = [
  "elliptical",
  "magnetic",
  "permafrost",
  "rage",
  "retrograde",
  "none",
  "stormy",
  "toxic",
  "trashed",
  "dense",
  "unstable",
  "ozone",
  "mellow",
  "flare",
  "kamikaze",
];

export const planetBiomeGenus = {
  hellscape: "demonic",
  eden: "angelic",
  oceanic: "aquatic",
  forest: "fey",
  desert: "sand",
  volcanic: "heat",
  tundra: "polar",
};

export const fanatAchievements = [
  { god: "sharkin", race: "entish", achieve: "madagascar_tree" },
  { god: "sporgar", race: "human", achieve: "infested" },
  { god: "shroomi", race: "troll", achieve: "godwin" },
];

export const challenges = [
  [
    { id: "plasmid", trait: "no_plasmid" },
    { id: "mastery", trait: "weak_mastery" },
    { id: "nerfed", trait: "nerfed" },
  ],
  [
    { id: "crispr", trait: "no_crispr" },
    { id: "badgenes", trait: "badgenes" },
  ],
  [{ id: "trade", trait: "no_trade" }],
  [{ id: "craft", trait: "no_craft" }],
  [{ id: "joyless", trait: "joyless" }],
  [{ id: "steelen", trait: "steelen" }],
  [{ id: "decay", trait: "decay" }],
  [{ id: "emfield", trait: "emfield" }],
  [{ id: "inflation", trait: "inflation" }],
  [{ id: "sludge", trait: "sludge" }],
  [{ id: "ultra_sludge", trait: "ultra_sludge" }],
  [{ id: "orbit_decay", trait: "orbit_decay" }],
  [
    { id: "gravity_well", trait: "gravity_well" },
    { id: "witch_hunter", trait: "witch_hunter" },
    { id: "warlord", trait: "warlord" },
  ],
  [{ id: "junker", trait: "junker" }],
  [{ id: "cataclysm", trait: "cataclysm" }],
  [{ id: "banana", trait: "banana" }],
  [{ id: "truepath", trait: "truepath" }],
  [{ id: "lone_survivor", trait: "lone_survivor" }],
  [{ id: "fasting", trait: "fasting" }],
];

export const governors = [
  "soldier",
  "criminal",
  "entrepreneur",
  "educator",
  "spiritual",
  "bluecollar",
  "noble",
  "media",
  "sports",
  "bureaucrat",
];

export const evolutionSettingsToStore = [
  "userEvolutionTarget",
  "userEvolutionGenus",
  "prestigeType",
  ...challenges.map((c) => "challenge_" + c[0]!.id),
];

export const logIgnore = [
  "food",
  "lumber",
  "stone",
  "chrysotile",
  "slaughter",
  "s_alter",
  "slave_market",
  "horseshoe",
  "assembly",
  "cloning_facility",
  "ambush_patrol",
  "raid_supplies",
  "siege_fortress",
];

export const galaxyRegions = [
  "gxy_stargate",
  "gxy_gateway",
  "gxy_gorddon",
  "gxy_alien1",
  "gxy_alien2",
  "gxy_chthonian",
];

export const settingsSections = [
  "toggle",
  "general",
  "prestige",
  "evolution",
  "research",
  "market",
  "storage",
  "production",
  "war",
  "hell",
  "fleet",
  "job",
  "building",
  "project",
  "government",
  "authority",
  "logging",
  "trait",
  "weighting",
  "ejector",
  "planet",
  "mech",
  "magic",
  "trigger",
];

export const mutationCostMultipliers = {
  sludge: { gain: 10, purge: 10 },
  ultra_sludge: { gain: 10, purge: 10 },
  custom: { gain: 10, purge: 10 },
};

export const mutationCostMultipliersGenus = { hybrid: { gain: 2, purge: 2 } };

export const specialRaceTraits = {
  beast_of_burden: "reindeer",
  photosynth: "plant",
};

export const conflictingTraits = [["dumb", "smart"]];

export const replicableResources = [
  "Food",
  "Lumber",
  "Chrysotile",
  "Stone",
  "Crystal",
  "Furs",
  "Copper",
  "Iron",
  "Aluminium",
  "Cement",
  "Coal",
  "Oil",
  "Uranium",
  "Steel",
  "Titanium",
  "Alloy",
  "Polymer",
  "Iridium",
  "Helium_3",
  "Deuterium",
  "Neutronium",
  "Adamantite",
  "Infernite",
  "Elerium",
  "Nano_Tube",
  "Graphene",
  "Stanene",
  "Bolognium",
  "Unobtainium",
  "Vitreloy",
  "Orichalcum",
  "Water",
  "Plywood",
  "Brick",
  "Wrought_Iron",
  "Sheet_Metal",
  "Mythril",
  "Aerogel",
  "Nanoweave",
  "Scarletite",
  "Quantium",
];
