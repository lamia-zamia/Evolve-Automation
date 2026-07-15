type AnyRecord = Record<string, any>;

export interface TooltipUIContext {
  $: any;
  document: any;
  MutationObserver: any;
  settings: AnyRecord;
  state: AnyRecord;
  game: AnyRecord;
  buildings: AnyRecord;
  jobs: AnyRecord;
  resources: AnyRecord;
  techIds: AnyRecord;
  buildingIds: AnyRecord;
  arpaIds: AnyRecord;
  MechManager: AnyRecord;
  FleetManagerOuter: AnyRecord;
  poly: AnyRecord;
  getCitadelConsumption: (count: number) => number;
  getNiceNumber: (value: number) => string;
  getCostConflict: (target: AnyRecord) => AnyRecord | undefined;
  getTechConflict: (target: AnyRecord) => string | undefined;
  haveTech: (id: string, level: number) => boolean;
  getHealingRate: () => number;
  getGrowthRate: () => number;
  getGovernor: () => string;
  traitVal: (id: string, fallback: number, operation: string) => number;
}

export interface TooltipUIDependencies {
  getContext: () => TooltipUIContext;
  isTechnology: (value: unknown) => boolean;
}

export function createTooltipUI({
  getContext,
  isTechnology,
}: TooltipUIDependencies) {
  function getTooltipInfo(obj: AnyRecord) {
    const {
      settings,
      state,
      game,
      buildings,
      jobs,
      resources,
      MechManager,
      FleetManagerOuter,
      getCitadelConsumption,
      getNiceNumber,
      getCostConflict,
      getTechConflict,
      haveTech,
      getHealingRate,
      getGrowthRate,
      getGovernor,
      traitVal,
    } = getContext();
    const notes = [];
    if (obj === buildings.NeutronCitadel) {
      const diff =
        getCitadelConsumption(obj.stateOnCount + 1) -
        getCitadelConsumption(obj.stateOnCount);
      notes.push(
        `Next level will increase total consumption by ${getNiceNumber(
          diff,
        )} MW`,
      );
    }
    if (obj === buildings.SpireMechBay && MechManager.initLab()) {
      notes.push(
        `Current team potential: ${getNiceNumber(MechManager.mechsPotential)}`,
      );
      const supplyCollected = MechManager.activeMechs
        .filter((mech: AnyRecord) => mech.size === "collector")
        .reduce(
          (sum: number, mech: AnyRecord) =>
            sum + mech.power * MechManager.collectorValue,
          0,
        );
      if (supplyCollected > 0) {
        notes.push(`Supplies collected: ${getNiceNumber(supplyCollected)} /s`);
      }
    }

    if (
      (isTechnology(obj) ||
        (!settings.autoARPA && obj._tab === "arpa") ||
        (!settings.autoBuild && obj._tab !== "arpa")) &&
      !state.queuedTargetsAll.includes(obj) &&
      !state.triggerTargets.includes(obj)
    ) {
      const conflict = getCostConflict(obj);
      if (conflict) {
        notes.push(
          `Conflicts with ${conflict.actionList
            .map((action: string) => {
              return `<span class="has-text-info">${action}</span>`;
            })
            .join(", ")} for ${conflict.resList
            .map((res: string) => {
              return `<span class="has-text-info">${res}</span>`;
            })
            .join(", ")} (${conflict.obj.cause})`,
        );
      }
    }

    if (isTechnology(obj)) {
      if (state.queuedTargetsAll.includes(obj)) {
        notes.push("Queued research, processing...");
      } else if (state.triggerTargets.includes(obj)) {
        notes.push("Active trigger, processing...");
      } else {
        const conflict = getTechConflict(obj);
        if (conflict) {
          notes.push(conflict);
        }
      }
    }

    if (obj === buildings.GorddonFreighter && haveTech("banking", 13)) {
      const count = obj.stateOnCount;
      const total = ((1 + (count + 1) * 0.03) / (1 + count * 0.03) - 1) * 100;
      const crew = total / 3;
      notes.push(
        `Next level will increase ${
          buildings.AlphaExchange.title
        } storage by +${getNiceNumber(total)}% (+${getNiceNumber(
          crew,
        )}% per crew)`,
      );
    }
    if (obj === buildings.Alien1SuperFreighter && haveTech("banking", 13)) {
      const count = obj.stateOnCount;
      const total = ((1 + (count + 1) * 0.08) / (1 + count * 0.08) - 1) * 100;
      const crew = total / 5;
      notes.push(
        `Next level will increase ${
          buildings.AlphaExchange.title
        } storage by +${getNiceNumber(total)}% (+${getNiceNumber(
          crew,
        )}% per crew)`,
      );
    }
    if (
      obj === buildings.Hospital ||
      (obj === buildings.BootCamp && game.global.race["artifical"]) ||
      (obj === buildings.EnceladusBase && game.global.race["orbit_decayed"])
    ) {
      notes.push(`~${getNiceNumber(getHealingRate())} soldiers healed per day`);
    }
    if (obj === buildings.Hospital) {
      const growth = 1 / (getGrowthRate() * 4);
      notes.push(`~${getNiceNumber(growth)} seconds to increase population`);
    }
    if (obj === buildings.PortalCarport && jobs.HellSurveyor.count > 0) {
      const influx = 5 * (1 + buildings.BadlandsAttractor.stateOnCount * 0.22);
      const demons = (influx * 10 + influx * 50) / 2;
      let divisor = getGovernor() === "sports" ? 1100 : 1000;
      divisor *= traitVal("blurry", 0, "+");
      divisor *= traitVal("instinct", 0, "+");
      divisor += haveTech("infernite", 5) ? 250 : 0;
      const danger = demons / divisor;
      const risk = 10 - Math.min(10, jobs.HellSurveyor.count) / 2;
      const rate = (danger / 2) * Math.min(1, danger / risk);
      const wreck = 1 / (rate / 5);
      notes.push(
        `Up to ~${getNiceNumber(
          wreck,
        )} seconds to break car (with full supression)`,
      );
    }
    if (obj === buildings.PortalRepairDroid) {
      const wallRepair = Math.round(200 * 0.95 ** obj.stateOnCount) / 4;
      const carRepair = Math.round(180 * 0.92 ** obj.stateOnCount) / 4;
      notes.push(`${getNiceNumber(wallRepair)} seconds to repair 1% of wall`);
      notes.push(`${getNiceNumber(carRepair)} seconds to repair car`);
    }
    if (obj === buildings.BadlandsAttractor) {
      const influx = 5 * (1 + obj.stateOnCount * 0.22);
      let gem_chance =
        game.global.stats.achieve.technophobe?.l >= 5 ? 9000 : 10000;
      if (
        game.global.race.universe === "evil" &&
        resources.Dark.currentQuantity > 1
      ) {
        const de =
          resources.Dark.currentQuantity *
          (1 + resources.Harmony.currentQuantity * 0.01);
        gem_chance -= Math.round(Math.log2(de) * 2);
      }
      gem_chance = Math.round(gem_chance * 0.948 ** obj.stateOnCount);
      gem_chance = Math.round(gem_chance * traitVal("ghostly", 2, "-"));
      gem_chance = Math.max(12, gem_chance);
      const drop = (1 / gem_chance) * 100;
      notes.push(
        `~${getNiceNumber(drop)}% chance to find ${resources.Soul_Gem.title}`,
      );
      notes.push(
        `Up to ~${getNiceNumber(influx * 10)}-${getNiceNumber(
          influx * 50,
        )} demons spawned per day`,
      );
    }
    if (obj === buildings.Smokehouse) {
      const spoilage = 50 * 0.9 ** obj.count;
      notes.push(
        `${getNiceNumber(spoilage)}% of stored ${
          resources.Food.title
        } spoiled per second`,
      );
    }
    if (obj === buildings.LakeCoolingTower) {
      const coolers = buildings.LakeCoolingTower.stateOnCount;
      const current = 500 * 0.92 ** coolers;
      const next = 500 * 0.92 ** (coolers + 1);
      const diff =
        (current - next) *
        buildings.LakeHarbor.stateOnCount *
        (game.global.race["emfield"] ? 1.5 : 1);
      notes.push(
        `Next level will decrease total consumption by ${getNiceNumber(
          diff,
        )} MW`,
      );
    }
    if (obj === buildings.DwarfShipyard) {
      if (settings.autoFleet && FleetManagerOuter.nextShipMsg) {
        notes.push(FleetManagerOuter.nextShipMsg);
      }
    }
    if (obj === buildings.IsleSpiritBattery) {
      const batteries = buildings.IsleSpiritBattery.stateOnCount;
      let coefficient = 0.9;

      if (
        game.global.race["warlord"] &&
        buildings.AsphodelCorruptor &&
        game.global.tech?.asphodel >= 13
      ) {
        const corruptors = buildings.AsphodelCorruptor.on;
        coefficient = 1 - (1 + (corruptors || 0) * 0.03) / 10;
      }

      const current = 18_000 * coefficient ** batteries;
      const next = 18_000 * coefficient ** (batteries + 1);
      const diff =
        (current - next) *
        buildings.IsleSpiritVacuum.stateOnCount *
        (game.global.race["emfield"] ? 1.5 : 1);
      notes.push(
        `Next level will decrease total consumption by ${getNiceNumber(
          diff,
        )} MW`,
      );
    }

    if (obj.extraDescription) {
      notes.push(obj.extraDescription);
    }
    return notes.join("<br>");
  }

  function tooltipObserverCallback(mutations: AnyRecord[]) {
    const { settings, document, MutationObserver } = getContext();
    if (!settings.masterScriptToggle || document.hidden) {
      return;
    }
    mutations.forEach((mutation) =>
      mutation.addedNodes.forEach((node: AnyRecord) => {
        if (node.id === "popper") {
          const popperObserver = new MutationObserver(() => {
            if (!node.querySelector(".script-tooltip")) {
              popperObserver.disconnect();
              addTooltip(node);
              popperObserver.observe(node, { childList: true });
            }
          });
          addTooltip(node);
          popperObserver.observe(node, { childList: true });
        }
      }),
    );
  }

  const infusionStep: AnyRecord = {
    "blood-lust": 15,
    "blood-illuminate": 12,
    "blood-greed": 16,
    "blood-hoarder": 14,
    "blood-artisan": 8,
    "blood-attract": 4,
    "blood-wrath": 2,
  };

  function addTooltip(node: AnyRecord) {
    const {
      $,
      state,
      game,
      buildings,
      resources,
      techIds,
      buildingIds,
      arpaIds,
      poly,
      getNiceNumber,
    } = getContext();
    $(node).append(`<span class="script-tooltip" hidden></span>`);
    const dataId = node.dataset.id;
    if (dataId === "powerStatus") {
      $(node).append(
        `<p class="modal_bd"><span>Disabled</span><span class="has-text-danger">${getNiceNumber(
          resources.Power.maxQuantity,
        )}</span></p>`,
      );
      return;
    } else if (infusionStep[dataId]) {
      $(node)
        .find(".costList .res-Blood_Stone")
        .append(` (+${infusionStep[dataId]})`);
      return;
    } else if (state.tooltips[dataId]) {
      $(node).append(
        `<div style="border-top: solid .0625rem #999">${state.tooltips[dataId]}</div>`,
      );
      return;
    }

    let match = null;
    let obj = null;
    if ((match = dataId.match(/^popArpa([a-z_-]+)\d*$/))) {
      obj = arpaIds["arpa" + match[1]];
    } else if ((match = dataId.match(/^q([A-Za-z_-]+)\d*$/))) {
      obj = buildingIds[match[1]] || arpaIds[match[1]];
    } else {
      obj = buildingIds[dataId] || techIds[dataId];
    }
    if (!obj || (isTechnology(obj) && obj.isResearched())) {
      return;
    }

    if (
      obj === buildings.BlackholeStellarEngine &&
      game.global.race.universe !== "magic" &&
      buildings.BlackholeMassEjector.count > 0 &&
      game.global.interstellar.stellar_engine.exotic < 0.025
    ) {
      const massPerSec =
        resources.Elerium.atomicMass *
          game.global.interstellar.mass_ejector.Elerium +
          resources.Infernite.atomicMass *
            game.global.interstellar.mass_ejector.Infernite || -1;
      const missingExotics =
        (0.025 - game.global.interstellar.stellar_engine.exotic) * 1e10;
      $(node).append(
        `<div id="popTimer" class="flair has-text-advanced">Contaminated in [${poly.timeFormat(
          missingExotics / massPerSec,
        )}]</div>`,
      );
    }
    if (obj === buildings.TauRedJeff && buildings.TauRedWomlingLab.count > 0) {
      let expo = game.global.stats.achieve.overlord?.l >= 5 ? 4.9 : 5;
      expo -= game.global.race["lone_survivor"] ? 0.1 : 0;
      const nextTech = (game.global.tech.womling_tech + 2) ** expo;
      const curTech = game.global.tauceti.womling_lab.tech;
      const completion = Math.floor((curTech / nextTech) * 100);
      $(node).find("div:eq(1)>div:eq(5)").append(` (${completion}%)`);
      const rate =
        (game.global.tauceti.womling_lab.scientist / 2) *
        Math.min(1, game.global.tauceti.womling_lab.scientist * 0.1);
      const eta = rate > 0 ? Math.ceil((nextTech - curTech) / rate) : -1;
      $(node).append(
        `<div id="popTimer" class="flair has-text-advanced">Next Tech Level in ~[${poly.timeFormat(
          eta,
        )}]</div>`,
      );
    }

    const description = getTooltipInfo(obj);
    if (description) {
      $(node).append(
        `<div style="border-top: solid .0625rem #999">${description}</div>`,
      );
    }
  }

  return { getTooltipInfo, tooltipObserverCallback, addTooltip };
}
