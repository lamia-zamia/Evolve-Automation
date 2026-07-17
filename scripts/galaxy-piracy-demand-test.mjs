import assert from "node:assert/strict";

import { decideGalaxyPiracyProtection } from "../src/domain/combat/galaxy-piracy.ts";

const inactiveProducers = {
  bologniumShip: false,
  gorddonSymposium: false,
  alien1VitreloyPlant: false,
  alien2ArmedMiner: false,
  alien2Scavenger: false,
  chthonianExcavator: false,
};

const unneededResources = {
  Adamantite: false,
  Bolognium: false,
  Deuterium: false,
  Iridium: false,
  Knowledge: false,
  Neutronium: false,
  Orichalcum: false,
  Polymer: false,
  Vitreloy: false,
};

function decide({
  producers = inactiveProducers,
  usefulResources = unneededResources,
  gorddonTradeTargetsUsefulResource = false,
} = {}) {
  return decideGalaxyPiracyProtection({
    producers,
    usefulResources,
    gorddonTradeTargetsUsefulResource,
  });
}

const noDemand = decide({
  producers: {
    bologniumShip: true,
    gorddonSymposium: true,
    alien1VitreloyPlant: true,
    alien2ArmedMiner: true,
    alien2Scavenger: true,
    chthonianExcavator: true,
  },
});
assert.deepEqual(noDemand, {
  gxy_stargate: false,
  gxy_gateway: false,
  gxy_gorddon: false,
  gxy_alien1: false,
  gxy_alien2: false,
  gxy_chthonian: false,
});

for (const scenario of [
  {
    name: "Gateway Bolognium production",
    producers: { bologniumShip: true },
    resources: { Bolognium: true },
    region: "gxy_gateway",
  },
  {
    name: "Gorddon Symposium knowledge",
    producers: { gorddonSymposium: true },
    resources: { Knowledge: true },
    region: "gxy_gorddon",
  },
  {
    name: "Alien 1 Vitreloy production",
    producers: { alien1VitreloyPlant: true },
    resources: { Vitreloy: true },
    region: "gxy_alien1",
  },
  {
    name: "Alien 2 armed-miner production",
    producers: { alien2ArmedMiner: true },
    resources: { Adamantite: true },
    region: "gxy_alien2",
  },
  {
    name: "Alien 2 scavenger knowledge",
    producers: { alien2Scavenger: true },
    resources: { Knowledge: true },
    region: "gxy_alien2",
  },
  {
    name: "Chthonian excavator production",
    producers: { chthonianExcavator: true },
    resources: { Orichalcum: true },
    region: "gxy_chthonian",
  },
]) {
  const protection = decide({
    producers: { ...inactiveProducers, ...scenario.producers },
    usefulResources: { ...unneededResources, ...scenario.resources },
  });
  assert.equal(protection[scenario.region], true, scenario.name);
  assert.equal(
    protection.gxy_stargate,
    true,
    `${scenario.name} needs Stargate`,
  );
}

const usefulTrade = decide({ gorddonTradeTargetsUsefulResource: true });
assert.equal(usefulTrade.gxy_gorddon, true);
assert.equal(usefulTrade.gxy_stargate, true);

const idleProducer = decide({
  usefulResources: { ...unneededResources, Orichalcum: true },
});
assert.equal(idleProducer.gxy_chthonian, false);
assert.equal(idleProducer.gxy_stargate, false);

const raiderByproductsOnly = decide({
  usefulResources: {
    ...unneededResources,
    Deuterium: true,
    Neutronium: true,
    Polymer: true,
    Vitreloy: true,
  },
});
assert.equal(raiderByproductsOnly.gxy_chthonian, false);
assert.equal(raiderByproductsOnly.gxy_stargate, false);

console.log("Galaxy piracy demand policy tests passed");
