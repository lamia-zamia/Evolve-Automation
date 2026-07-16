type AnyFunction = (...args: any[]) => any;
type AnyRecord = Record<string, any>;

type MechManagerDependencies = {
  getGame: () => AnyRecord;
  getSettings: () => AnyRecord;
  getResources: () => AnyRecord;
  getBuildings: () => AnyRecord;
  getPoly: () => AnyRecord;
  getGameLog: () => AnyRecord;
  getNeedSandboxBypass: () => boolean;
  getWin: () => AnyRecord;
  getSortable: () => AnyRecord;
  getUpdateDebugData: () => AnyFunction;
  getCreateMechInfo: () => AnyFunction;
  getVueById: (id: string) => any;
  kCombinations: (values: any[], size: number) => any[][];
  cloneIntoPage: (value: unknown, options?: AnyRecord) => any;
  createMutationObserver: (callback: (...args: any[]) => void) => unknown;
};

export function createMechManager({
  getGame,
  getSettings,
  getResources,
  getBuildings,
  getPoly,
  getGameLog,
  getNeedSandboxBypass,
  getWin,
  getSortable,
  getUpdateDebugData,
  getCreateMechInfo,
  getVueById,
  kCombinations,
  cloneIntoPage,
  createMutationObserver,
}: MechManagerDependencies) {
  let game: AnyRecord;
  let settings: AnyRecord;
  let resources: AnyRecord;
  let buildings: AnyRecord;
  let poly: AnyRecord;
  let GameLog: AnyRecord;
  let needSandboxBypass: boolean;
  let win: AnyRecord;
  let Sortable: AnyRecord;

  const k_combinations = kCombinations;
  const updateDebugData = (...args: any[]) => getUpdateDebugData()(...args);
  const createMechInfo = (...args: any[]) => getCreateMechInfo()(...args);

  function refreshContext() {
    game = getGame();
    settings = getSettings();
    resources = getResources();
    buildings = getBuildings();
    poly = getPoly();
    GameLog = getGameLog();
    needSandboxBypass = getNeedSandboxBypass();
    win = getWin();
    Sortable = getSortable();
  }

  const MechManager: AnyRecord = {
    _assemblyVueBinding: "mechAssembly",
    _assemblyVue: undefined,
    _listVueBinding: "mechList",
    _listVue: undefined,

    activeMechs: [],
    inactiveMechs: [],
    mechsPower: 0,
    mechsPotential: 0,
    isActive: false,
    saveSupply: false,

    stateHash: 0,
    bestSize: [],
    bestGems: [],
    bestSupply: [],
    bestMech: {},
    bestBody: {},
    bestWeapon: [],

    Size: ["small", "medium", "large", "titan", "collector"],
    Chassis: ["wheel", "tread", "biped", "quad", "spider", "hover"],
    Weapon: [
      "laser",
      "kinetic",
      "shotgun",
      "missile",
      "flame",
      "plasma",
      "sonic",
      "tesla",
    ],
    Equip: [
      "special",
      "shields",
      "sonar",
      "grapple",
      "infrared",
      "flare",
      "radiator",
      "coolant",
      "ablative",
      "stabilizer",
      "seals",
    ],

    SizeSlots: { small: 0, medium: 1, large: 2, titan: 4, collector: 2 },
    SizeWeapons: { small: 1, medium: 1, large: 2, titan: 4, collector: 0 },
    SmallChassisMod: {
      wheel: {
        sand: 0.9,
        swamp: 0.35,
        forest: 1,
        jungle: 0.92,
        rocky: 0.65,
        gravel: 1,
        muddy: 0.85,
        grass: 1.3,
        brush: 0.9,
        concrete: 1.1,
      },
      tread: {
        sand: 1.15,
        swamp: 0.55,
        forest: 1,
        jungle: 0.95,
        rocky: 0.65,
        gravel: 1.3,
        muddy: 0.88,
        grass: 1,
        brush: 1,
        concrete: 1,
      },
      biped: {
        sand: 0.78,
        swamp: 0.68,
        forest: 1,
        jungle: 0.82,
        rocky: 0.48,
        gravel: 1,
        muddy: 0.85,
        grass: 1.25,
        brush: 0.92,
        concrete: 1,
      },
      quad: {
        sand: 0.86,
        swamp: 0.58,
        forest: 1.25,
        jungle: 1,
        rocky: 0.95,
        gravel: 0.9,
        muddy: 0.68,
        grass: 1,
        brush: 0.95,
        concrete: 1,
      },
      spider: {
        sand: 0.75,
        swamp: 0.9,
        forest: 0.82,
        jungle: 0.77,
        rocky: 1.25,
        gravel: 0.86,
        muddy: 0.92,
        grass: 1,
        brush: 1,
        concrete: 1,
      },
      hover: {
        sand: 1,
        swamp: 1.35,
        forest: 0.65,
        jungle: 0.55,
        rocky: 0.82,
        gravel: 1,
        muddy: 1.15,
        grass: 1,
        brush: 0.78,
        concrete: 1,
      },
    },
    LargeChassisMod: {
      wheel: {
        sand: 0.85,
        swamp: 0.18,
        forest: 1,
        jungle: 0.85,
        rocky: 0.5,
        gravel: 0.95,
        muddy: 0.58,
        grass: 1.2,
        brush: 0.8,
        concrete: 1,
      },
      tread: {
        sand: 1.1,
        swamp: 0.4,
        forest: 0.95,
        jungle: 0.9,
        rocky: 0.5,
        gravel: 1.2,
        muddy: 0.72,
        grass: 1,
        brush: 1,
        concrete: 1,
      },
      biped: {
        sand: 0.65,
        swamp: 0.5,
        forest: 0.95,
        jungle: 0.7,
        rocky: 0.4,
        gravel: 1,
        muddy: 0.7,
        grass: 1.2,
        brush: 0.85,
        concrete: 1,
      },
      quad: {
        sand: 0.75,
        swamp: 0.42,
        forest: 1.2,
        jungle: 1,
        rocky: 0.9,
        gravel: 0.8,
        muddy: 0.5,
        grass: 0.95,
        brush: 0.9,
        concrete: 1,
      },
      spider: {
        sand: 0.65,
        swamp: 0.78,
        forest: 0.75,
        jungle: 0.65,
        rocky: 1.2,
        gravel: 0.75,
        muddy: 0.82,
        grass: 1,
        brush: 0.95,
        concrete: 1,
      },
      hover: {
        sand: 1,
        swamp: 1.2,
        forest: 0.48,
        jungle: 0.35,
        rocky: 0.68,
        gravel: 1,
        muddy: 1.08,
        grass: 1,
        brush: 0.7,
        concrete: 1,
      },
    },
    StatusMod: {
      freeze: (mech) => (!mech.equip.includes("radiator") ? 0.25 : 1),
      hot: (mech) => (!mech.equip.includes("coolant") ? 0.25 : 1),
      corrosive: (mech) =>
        !mech.equip.includes("ablative")
          ? mech.equip.includes("shields")
            ? 0.75
            : 0.25
          : 1,
      humid: (mech) => (!mech.equip.includes("seals") ? 0.75 : 1),
      windy: (mech) => (mech.chassis === "hover" ? 0.5 : 1),
      hilly: (mech) => (mech.chassis !== "spider" ? 0.75 : 1),
      mountain: (mech) =>
        mech.chassis !== "spider" && !mech.equip.includes("grapple")
          ? mech.equip.includes("flare")
            ? 0.75
            : 0.5
          : 1,
      radioactive: (mech) => (!mech.equip.includes("shields") ? 0.5 : 1),
      quake: (mech) => (!mech.equip.includes("stabilizer") ? 0.25 : 1),
      dust: (mech) => (!mech.equip.includes("seals") ? 0.5 : 1),
      river: (mech) => (mech.chassis !== "hover" ? 0.65 : 1),
      tar: (mech) =>
        mech.chassis !== "quad"
          ? mech.chassis === "tread" || mech.chassis === "wheel"
            ? 0.5
            : 0.75
          : 1,
      steam: (mech) => (!mech.equip.includes("shields") ? 0.75 : 1),
      flooded: (mech) => (mech.chassis !== "hover" ? 0.35 : 1),
      fog: (mech) => (!mech.equip.includes("sonar") ? 0.2 : 1),
      rain: (mech) => (!mech.equip.includes("seals") ? 0.75 : 1),
      hail: (mech) =>
        !mech.equip.includes("ablative") && !mech.equip.includes("shields")
          ? 0.75
          : 1,
      chasm: (mech) => (!mech.equip.includes("grapple") ? 0.1 : 1),
      dark: (mech) =>
        !mech.equip.includes("infrared")
          ? mech.equip.includes("flare")
            ? 0.25
            : 0.1
          : 1,
      gravity: (mech) =>
        mech.size === "titan"
          ? 0.25
          : mech.size === "large"
            ? 0.45
            : mech.size === "medium"
              ? 0.8
              : 1,
    },

    get collectorValue() {
      // Collectors power mod. Higher number - more often they'll be scrapped. Default value derieved from scout: 20000 = collectorBaseIncome / (scoutPower / scoutSize), to equalize relative values of collectors and combat mechs with same efficiency.
      return 20000 / Math.max(settings.mechCollectorValue, 0.000001);
    },

    mechObserver: createMutationObserver(() => {
      updateDebugData(); // Observer can be can be called at any time, make sure we have actual data
      createMechInfo();
    }),

    updateSpire() {
      let oldHash = this.stateHash;
      this.stateHash =
        0 +
        game.global.portal.spire.count +
        game.global.blood.prepared +
        game.global.blood.wrath +
        game.global.portal.mechbay.scouts * 1e7 +
        (settings.mechSpecial ? 1e14 : 0) +
        (settings.mechInfernalCollector ? 1e15 : 0) +
        settings.mechCollectorValue;

      return this.stateHash !== oldHash;
    },

    initLab() {
      // TODO: Warlord is not supported yet and breaks a bunch of things, remove when support is implemented
      if (game.global.race["warlord"]) {
        return false;
      }
      if (buildings.SpireMechBay.count < 1) {
        return false;
      }
      this._assemblyVue = getVueById(this._assemblyVueBinding);
      if (this._assemblyVue === undefined) {
        return false;
      }
      this._listVue = getVueById(this._listVueBinding);
      if (this._listVue === undefined) {
        return false;
      }

      this.activeMechs = [];
      this.inactiveMechs = [];
      this.mechsPower = 0;

      let mechBay = game.global.portal.mechbay;
      for (let i = 0; i < mechBay.mechs.length; i++) {
        let mech = {
          id: i,
          ...mechBay.mechs[i],
          ...this.getMechStats(mechBay.mechs[i]),
        };
        if (i < mechBay.active) {
          this.activeMechs.push(mech);
          if (mech.size !== "collector") {
            this.mechsPower += mech.power;
          }
        } else {
          this.inactiveMechs.push(mech);
        }
      }

      if (this.updateSpire()) {
        this.isActive = true;

        this.updateBestWeapon();
        this.Size.forEach((size) => {
          this.updateBestBody(size);
          this.bestMech[size] = this.getRandomMech(size);
        });
        let sortBy = (prop) =>
          (Object.values(this.bestMech) as AnyRecord[])
            .filter((m) => m.size !== "collector")
            .sort((a, b) => b[prop] - a[prop])
            .map((m) => m.size);

        this.bestSize = sortBy("efficiency");
        this.bestGems = sortBy("gems_eff");
        this.bestSupply = sortBy("supply_eff");

        // Redraw added label of Mech Lab after change of floor
        createMechInfo();
      }

      let bestMech = this.bestMech[this.bestSize[0]];
      this.mechsPotential =
        this.mechsPower /
          (((buildings.SpireMechBay.count * 25) / this.getMechSpace(bestMech)) *
            bestMech.power) || 0;

      return true;
    },

    getBodyMod(mech) {
      let floor = game.global.portal.spire;
      let terrainFactor =
        mech.size === "small" || mech.size === "medium"
          ? this.SmallChassisMod[mech.chassis][floor.type]
          : this.LargeChassisMod[mech.chassis][floor.type];

      let rating = poly.terrainRating(
        mech,
        terrainFactor,
        Object.keys(floor.status),
      );
      for (let effect in floor.status) {
        rating *= this.StatusMod[effect](mech);
      }
      return rating;
    },

    getWeaponMod(mech) {
      let weapons = poly.monsters[game.global.portal.spire.boss].weapon;
      let rating = 0;
      for (let i = 0; i < mech.hardpoint.length; i++) {
        rating += poly.weaponPower(mech, weapons[mech.hardpoint[i]]);
      }
      return rating;
    },

    getSizeMod(mech, concrete) {
      let isConcrete = concrete ?? game.global.portal.spire.type === "concrete";
      switch (mech.size) {
        case "small":
          return 0.0025 * (isConcrete ? 0.92 : 1);
        case "medium":
          return 0.0075 * (isConcrete ? 0.95 : 1);
        case "large":
          return 0.01;
        case "titan":
          return 0.012 * (isConcrete ? 1.25 : 1);
        case "collector": // For collectors we're calculating supply rate
          return 25 / this.collectorValue;
      }
      return 0;
    },

    getProgressMod() {
      let mod = 1;
      if (game.global.stats.achieve.gladiator?.l > 0) {
        mod *= 1 + game.global.stats.achieve.gladiator.l * 0.2;
      }
      if (game.global.blood["wrath"]) {
        mod *= 1 + game.global.blood.wrath / 20;
      }
      mod /= game.global.portal.spire.count;

      return mod;
    },

    getPreferredSize() {
      let mechBay = game.global.portal.mechbay;
      if (
        settings.mechFillBay &&
        mechBay.max % 1 === 0 &&
        (game.global.blood.prepared >= 2
          ? mechBay.bay % 2 !== mechBay.max % 2
          : mechBay.max - mechBay.bay === 1)
      ) {
        return ["collector", true]; // One collector to fill odd bay
      }

      if (
        resources.Supply.storageRatio < 0.9 &&
        resources.Supply.rateOfChange < settings.mechMinSupply
      ) {
        let collectorsCount = this.activeMechs.filter(
          (mech) => mech.size === "collector",
        ).length;
        if (collectorsCount / mechBay.max < settings.mechMaxCollectors) {
          return ["collector", true]; // Bootstrap income
        }
      }

      if ((mechBay.scouts * 2) / mechBay.max < settings.mechScouts) {
        return ["small", true]; // Build scouts up to configured ratio
      }

      let floorSize = game.global.portal.spire.status.gravity
        ? settings.mechSizeGravity
        : settings.mechSize;
      if (
        this.Size.includes(floorSize) &&
        (!settings.mechFillBay ||
          poly.mechCost(floorSize).c <= resources.Supply.maxQuantity)
      ) {
        return [floorSize, false]; // This floor have configured size
      }
      let mechPriority =
        floorSize === "gems"
          ? this.bestGems
          : floorSize === "supply"
            ? this.bestSupply
            : this.bestSize;

      for (let i = 0; i < mechPriority.length; i++) {
        let mechSize = mechPriority[i];
        let { s, c } = poly.mechCost(mechSize);
        if (
          resources.Soul_Gem.spareQuantity >= s &&
          resources.Supply.maxQuantity >= c
        ) {
          return [mechSize, false]; // Affordable mech for auto size
        }
      }

      return ["titan", false]; // Just a stub, if auto size couldn't pick anything
    },

    getMechStats(mech) {
      let rating = this.getBodyMod(mech);
      if (mech.size !== "collector") {
        // Collectors doesn't have weapons
        rating *= this.getWeaponMod(mech);
      }
      let power = rating * this.getSizeMod(mech) * (mech.infernal ? 1.25 : 1);
      let [gem, supply, space] = this.getMechCost(mech);
      let [gemRef, supplyRef] = this.getMechRefund(mech);
      return {
        power: power,
        efficiency: power / space,
        gems_eff: power / (gem - gemRef),
        supply_eff: power / (supply - supplyRef),
      };
    },

    getTimeToClear() {
      return this.mechsPower > 0
        ? (100 - game.global.portal.spire.progress) /
            (this.mechsPower * this.getProgressMod())
        : Number.MAX_SAFE_INTEGER;
    },

    updateBestBody(size) {
      let currentBestBodyMod = 0;
      let currentBestBodyList = [];

      let equipmentSlots =
        this.SizeSlots[size] +
        (game.global.blood.prepared ? 1 : 0) -
        (settings.mechSpecial === "always" ? 1 : 0);
      let equipOptions =
        settings.mechSpecial === "always" || settings.mechSpecial === "never"
          ? this.Equip.slice(1)
          : this.Equip;
      let infernal =
        settings.mechInfernalCollector &&
        size === "collector" &&
        game.global.blood.prepared >= 3;

      k_combinations(equipOptions, equipmentSlots).forEach((equip) => {
        this.Chassis.forEach((chassis) => {
          let mech = {
            size: size,
            chassis: chassis,
            equip: equip,
            infernal: infernal,
          };
          let mechMod = this.getBodyMod(mech);
          if (mechMod > currentBestBodyMod) {
            currentBestBodyMod = mechMod;
            currentBestBodyList = [mech];
          } else if (mechMod === currentBestBodyMod) {
            currentBestBodyList.push(mech);
          }
        });
      });

      if (settings.mechSpecial === "always" && equipmentSlots >= 0) {
        currentBestBodyList.forEach((mech) => mech.equip.unshift("special"));
      }
      if (settings.mechSpecial === "prefered") {
        let specialEquip = currentBestBodyList.filter((mech) =>
          mech.equip.includes("special"),
        );
        if (specialEquip.length > 0) {
          currentBestBodyList = specialEquip;
        }
      }
      /* TODO: Not really sure how to utilize it for good: it does find good and bad mech compositions, but using only good ones can backfire on unlucky consequent floors, and there won't big enough amount of mech to use weighted random
            currentBestBodyList.forEach(mech => {
                mech.weigthing = Object.values(this.StatusMod)
                  .reduce((sum, mod) => sum + mod(mech), 0);
            });
            */
      this.bestBody[size] = currentBestBodyList;
    },

    updateBestWeapon() {
      let bestMod = 0;
      let list = poly.monsters[game.global.portal.spire.boss].weapon;
      for (let weapon of MechManager.Weapon) {
        let mod = list[weapon];
        if (mod > bestMod) {
          bestMod = mod;
          this.bestWeapon = [weapon];
        } else if (mod === bestMod) {
          this.bestWeapon.push(weapon);
        }
      }
    },

    getRandomMech(size) {
      let randomBody =
        this.bestBody[size][
          Math.floor(Math.random() * this.bestBody[size].length)
        ];
      let randomWeapon =
        this.bestWeapon[Math.floor(Math.random() * this.bestWeapon.length)];
      let weaponsAmount = this.SizeWeapons[size];
      let mech = {
        hardpoint: new Array(weaponsAmount).fill(randomWeapon),
        ...randomBody,
      };
      return { ...mech, ...this.getMechStats(mech) };
    },

    getMechSpace(mech, prep) {
      switch (mech.size) {
        case "small":
          return 2;
        case "medium":
          return (prep ?? game.global.blood.prepared) >= 2 ? 4 : 5;
        case "large":
          return (prep ?? game.global.blood.prepared) >= 2 ? 8 : 10;
        case "titan":
          return (prep ?? game.global.blood.prepared) >= 2 ? 20 : 25;
        case "collector":
          return 1;
      }
      return Number.MAX_SAFE_INTEGER;
    },

    getMechCost(mech, prep) {
      let { s, c } = poly.mechCost(mech.size, mech.infernal, prep);
      return [s, c, this.getMechSpace(mech, prep)];
    },

    getMechRefund(mech, prep) {
      let { s, c } = poly.mechCost(mech.size, mech.infernal, prep);
      return [Math.floor(s / 2), Math.floor(c / 3)];
    },

    mechDesc(mech) {
      // (${mech.hardpoint.map(id => game.loc("portal_mech_weapon_" + id)).join(", ")}) [${mech.equip.map(id => game.loc("portal_mech_equip_" + id)).join(", ")}]
      let rating = mech.power / this.bestMech[mech.size].power;
      return `${game.loc("portal_mech_size_" + mech.size)} ${game.loc(
        "portal_mech_chassis_" + mech.chassis,
      )} (${Math.round(rating * 100)}%)`;
    },

    buildMech(mech) {
      this._assemblyVue.b.infernal = mech.infernal;
      this._assemblyVue.setSize(mech.size);
      this._assemblyVue.setType(mech.chassis);
      for (let i = 0; i < mech.hardpoint.length; i++) {
        this._assemblyVue.setWep(mech.hardpoint[i], i);
      }
      for (let i = 0; i < mech.equip.length; i++) {
        this._assemblyVue.setEquip(mech.equip[i], i);
      }
      this._assemblyVue.build();
      GameLog.logSuccess(
        "mech_build",
        `${this.mechDesc(mech)} mech has been assembled.`,
        ["hell"],
      );
    },

    scrapMech(mech) {
      this._listVue.scrap(mech.id);
    },

    dragMech(oldId, newId) {
      let sortObj = {
        oldDraggableIndex: oldId,
        newDraggableIndex: newId,
        from: { querySelectorAll: () => [], insertBefore: () => false },
      };
      if (needSandboxBypass) {
        // Yet another FF fix
        win.Sortable.get(this._listVue.$el).options.onEnd(
          cloneIntoPage(sortObj, { cloneFunctions: true }),
        );
      } else {
        Sortable.get(this._listVue.$el).options.onEnd(sortObj);
      }
    },
  };

  for (const key of Reflect.ownKeys(MechManager)) {
    const descriptor = Object.getOwnPropertyDescriptor(MechManager, key);
    if (!descriptor) {
      continue;
    }
    if (typeof descriptor.value === "function") {
      const method = descriptor.value;
      Object.defineProperty(MechManager, key, {
        ...descriptor,
        value: function (this: AnyRecord, ...args: any[]) {
          refreshContext();
          return method.apply(this, args);
        },
      });
    } else if (descriptor.get) {
      const getter = descriptor.get;
      Object.defineProperty(MechManager, key, {
        ...descriptor,
        get: function (this: AnyRecord) {
          refreshContext();
          return getter.call(this);
        },
      });
    }
  }

  return { MechManager };
}
