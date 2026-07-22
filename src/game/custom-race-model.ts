interface TraitDefinition {
  val: number;
  taxonomy?: string;
  origin: string;
  type: string;
  name: string;
  vars?: (rank?: number) => number[];
  desc?: string | (() => string);
}

interface RaceDefinition {
  type?: string;
  hybrid?: string[];
  name?: string;
  traits?: Record<string, unknown>;
}

interface CustomRaceGame {
  global: {
    stats: {
      achieve: Record<
        string,
        { l?: number; [key: string]: number | undefined } | undefined
      >;
    };
    race: Record<string, unknown> & {
      species: string;
      universe: string;
      srace?: string;
    };
    civic: { govern?: { type: string } };
    custom?: { race0?: Partial<CustomRaceDraft> };
  };
  traits: Record<string, TraitDefinition | undefined>;
  races: Record<string, RaceDefinition>;
  actions: {
    city: {
      coal_power: { powered(active: boolean): number };
      oil_power: { powered(active: boolean): number };
    };
  };
  loc(id: string): string;
}

interface CustomRaceDraft {
  name: string;
  desc: string;
  entity: string;
  home: string;
  red: string;
  hell: string;
  gas: string;
  gas_moon: string;
  dwarf: string;
  titan: string;
  enceladus: string;
  triton: string;
  eris: string;
  genes: number;
  genus: string;
  traitlist: string[];
  ranks: Record<string, number>;
  fanaticism: unknown;
}

interface RaceModelDependencies {
  getGame: () => CustomRaceGame;
  getPoly: () => {
    genus_traits: Record<string, Record<string, unknown> | undefined>;
    loc(id: string, vars?: unknown[]): string;
  };
  getResources: () => Record<string, { name: string }>;
  getRaces: () => Record<string, { genus: string } | undefined>;
  genusOpposition: Record<string, string[] | undefined>;
}

export function createCustomRaceModel({
  getGame,
  getPoly,
  getResources,
  getRaces,
  genusOpposition,
}: RaceModelDependencies) {
  function customRaceRankCost(value: number, rank: number, positive: boolean) {
    if (rank === 0.1) value -= 3;
    else if (rank === 0.25) value -= 2;
    else if (rank === 0.5) value--;
    else if (rank === 2) {
      value = positive
        ? Math.max(Math.round(value * 1.5), value + 1)
        : value + 1;
    } else if (rank === 3) {
      value = positive ? Math.max(Math.round(value * 2), value + 2) : value + 2;
    } else if (rank === 4) {
      value = positive
        ? Math.max(Math.round(value * 2.5), value + 3)
        : value + 3;
    }
    return positive ? Math.max(1, value) : value;
  }

  function customRaceGeneBalance(
    draft: Pick<CustomRaceDraft, "genus" | "traitlist" | "ranks">,
  ) {
    const game = getGame();
    const poly = getPoly();
    const ascended = game.global.stats.achieve.ascended ?? {};
    let genes = ["l", "h", "a", "e", "m", "mg"].reduce(
      (sum, universe) => sum + (ascended[universe] ?? 0),
      0,
    );
    genes += (game.global.stats.achieve.technophobe?.l ?? 0) * 4;

    const genusTraits = { ...(poly.genus_traits[draft.genus] ?? {}) };
    if (draft.genus === "fungi") delete genusTraits.spores;
    Object.keys(genusTraits).forEach(
      (trait) => (genes -= game.traits[trait]?.val ?? 0),
    );

    const categoryPositive: Record<string, number> = {};
    const categoryNegative: Record<string, number> = {};
    const opposed = genusOpposition[draft.genus] ?? [];
    for (const id of draft.traitlist) {
      const trait = game.traits[id];
      if (!trait) continue;
      const positive = trait.val >= 0;
      const categoryCounts = positive ? categoryPositive : categoryNegative;
      const taxonomy = trait.taxonomy ?? "";
      const previous = categoryCounts[taxonomy] ?? 0;
      let cost = trait.val;
      if (positive && previous > 1) cost += previous - 1;
      if (!positive && previous >= 1) cost += previous;
      categoryCounts[taxonomy] = previous + 1;
      cost = customRaceRankCost(cost, draft.ranks[id] ?? 1, positive);

      const originRace = game.races[trait.origin];
      const originGenera = originRace?.hybrid ?? [originRace?.type];
      if (originGenera.includes(draft.genus)) cost--;
      if (originGenera.some((genus) => genus && opposed.includes(genus)))
        cost++;
      genes -= cost;
    }
    return genes;
  }

  function customRaceRankOptions(traitId: string) {
    const game = getGame();
    const level =
      game.global.stats.achieve[`extinct_${game.traits[traitId]?.origin}`]?.l ??
      0;
    if (level >= 5) return [0.1, 0.25, 0.5, 1, 2, 3, 4];
    if (level >= 4) return [0.25, 0.5, 1, 2, 3];
    if (level >= 3) return [0.5, 1, 2];
    return [1];
  }

  function customRaceTraitEffect(id: string, rank: number) {
    const game = getGame();
    const poly = getPoly();
    const resources = getResources();
    const trait = game.traits[id];
    if (!trait) return "";
    let vars: unknown[] = trait.vars ? trait.vars(rank) : [];
    const noVariableEffects = new Set([
      "promiscuous",
      "revive",
      "fast_growth",
      "spores",
      "terrifying",
      "unfathomable",
      "darkness",
      "living_tool",
    ]);
    if (noVariableEffects.has(id)) vars = [];
    else if (id === "fibroblast") vars = [(vars[0] as number) * 5];
    else if (id === "hivemind" && game.global.race.high_pop) {
      vars = [(vars[0] as number) * game.traits.high_pop!.vars!()[0]];
    } else if (id === "imitation") {
      vars.push(
        game.races[(game.global.race.srace as string) || "protoplasm"]?.name ??
          "",
      );
    } else if (id === "elusive") {
      vars = [
        Math.round((1 / 30 / (1 / (30 + (vars[0] as number))) - 1) * 100),
      ];
    } else if (id === "chameleon") {
      vars = [
        vars[0],
        Math.round((1 / 30 / (1 / (30 + (vars[1] as number))) - 1) * 100),
      ];
    } else if (id === "blood_thirst") {
      vars = [Math.ceil(Math.log2(vars[0] as number))];
    } else if (id === "selenophobia") {
      vars = [14 - (vars[0] as number), vars[0]];
    } else if (id === "anthropophagite") {
      vars = [(vars[0] as number) * 1e4];
    } else if (id === "living_materials") {
      vars = [
        resources.Lumber.name,
        resources.Plywood.name,
        resources.Furs.name,
        game.loc("resource_Amber_name"),
      ];
    } else if (id === "environmentalist") {
      const coal = -game.actions.city.coal_power.powered(true);
      const oil = -game.actions.city.oil_power.powered(true);
      vars = [
        coal + (vars[0] as number),
        oil + (vars[0] as number) - 1,
        oil + (vars[0] as number) + 1,
        coal,
        oil,
        vars[1],
      ];
    } else if (id === "blurry" && game.global.race.warlord) {
      vars = [+((100 / (100 - (vars[0] as number)) - 1) * 100).toFixed(1)];
    } else if (id === "playful" && game.global.race.warlord) {
      vars = [(vars[0] as number) * 100, resources.Furs.name];
    } else if (id === "ghostly" && game.global.race.warlord) {
      vars = [
        vars[0],
        +(((vars[1] as number) - 1) * 100).toFixed(0),
        resources.Soul_Gem.name,
      ];
    }

    try {
      if (id === "elemental") {
        return poly.loc(`wiki_trait_effect_${id}_${vars[0]}`, vars);
      }
      if (["catnip", "anise"].includes(id)) {
        const specialVars = rank <= 2 ? [] : rank === 3 ? [vars[0]] : vars;
        return poly.loc(`wiki_trait_effect_${id}${rank}`, specialVars);
      }
      if (
        game.global.race.universe === "evil" &&
        game.global.civic.govern?.type !== "theocracy" &&
        ["spiritual", "blasphemous"].includes(id)
      ) {
        return poly.loc(
          `wiki_trait_effect_${
            id === "spiritual" ? "manipulator" : "blasphemous_evil"
          }`,
          vars,
        );
      }
      const effectType =
        ["befuddle", "blurry", "ghostly", "playful"].includes(id) &&
        game.global.race[id]
          ? "warlord"
          : "effect";
      return poly.loc(`wiki_trait_${effectType}_${id}`, vars);
    } catch {
      return typeof trait.desc === "function" ? trait.desc() : trait.desc;
    }
  }

  function customRaceEditorTraits(draft: Pick<CustomRaceDraft, "traitlist">) {
    const game = getGame();
    const unlocked = new Set(draft.traitlist);
    Object.entries(game.races).forEach(([id, race]) => {
      const genus = race.type;
      if (
        game.global.stats.achieve[`extinct_${id}`]?.l ||
        game.global.stats.achieve[`genus_${genus}`]?.l
      ) {
        Object.keys(race.traits ?? {}).forEach((trait) => unlocked.add(trait));
      }
    });
    return Object.entries(game.traits)
      .filter(
        (entry): entry is [string, TraitDefinition] =>
          entry[1]?.type === "major" && unlocked.has(entry[0]),
      )
      .sort(
        ([, a], [, b]) =>
          (a.taxonomy ?? "").localeCompare(b.taxonomy ?? "") ||
          a.name.localeCompare(b.name),
      );
  }

  function customRaceDraftFromPreset(preset: { json: string }) {
    const parsed: unknown = (() => {
      try {
        return JSON.parse(preset.json);
      } catch {
        return null;
      }
    })();
    const game = getGame();
    const poly = getPoly();
    const saved = game.global.custom?.race0;
    const fallbackGenus =
      saved?.genus ??
      getRaces()[game.global.race.species]?.genus ??
      Object.keys(poly.genus_traits).find(
        (genus) => game.global.stats.achieve[`genus_${genus}`]?.l,
      ) ??
      "humanoid";
    const draft =
      parsed && typeof parsed === "object"
        ? (parsed as Partial<CustomRaceDraft> & { traits?: string[] })
        : {};
    const traits = draft.traitlist ?? draft.traits ?? [];
    return {
      name: draft.name ?? saved?.name ?? "Zombie",
      desc: draft.desc ?? saved?.desc ?? "A custom race.",
      entity: draft.entity ?? saved?.entity ?? "custom beings",
      home: draft.home ?? saved?.home ?? "Home",
      red: draft.red ?? saved?.red ?? "Red World",
      hell: draft.hell ?? saved?.hell ?? "Hell",
      gas: draft.gas ?? saved?.gas ?? "Gas Giant",
      gas_moon: draft.gas_moon ?? saved?.gas_moon ?? "Gas Moon",
      dwarf: draft.dwarf ?? saved?.dwarf ?? "Dwarf Planet",
      titan: draft.titan ?? saved?.titan ?? "Titan",
      enceladus: draft.enceladus ?? saved?.enceladus ?? "Enceladus",
      triton: draft.triton ?? saved?.triton ?? "Triton",
      eris: draft.eris ?? saved?.eris ?? "Eris",
      genes: 0,
      genus: draft.genus ?? fallbackGenus,
      traitlist: Array.isArray(traits) ? [...new Set(traits)] : [],
      ranks:
        draft.ranks && typeof draft.ranks === "object"
          ? { ...draft.ranks }
          : {},
      fanaticism: draft.fanaticism || false,
    };
  }

  return {
    customRaceRankCost,
    customRaceGeneBalance,
    customRaceRankOptions,
    customRaceTraitEffect,
    customRaceEditorTraits,
    customRaceDraftFromPreset,
  };
}
