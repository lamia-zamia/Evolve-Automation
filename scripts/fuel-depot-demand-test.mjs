import assert from "node:assert/strict";
import { planFuelDepotDemand } from "../src/domain/economy/storage/fuel-depot-demand.ts";
import { readFuelDepotDemandInput } from "../src/adapters/evolve/economy/storage/storage-requirements.ts";

// --- planFuelDepotDemand: max cost per resource across the target set ---
{
  const result = planFuelDepotDemand({
    targets: [
      { costs: [{ resourceId: "Oil", amount: 100 }] },
      {
        costs: [
          { resourceId: "Oil", amount: 250 },
          { resourceId: "Helium_3", amount: 40 },
        ],
      },
      { costs: [{ resourceId: "Helium_3", amount: 10 }] },
    ],
  });
  assert.equal(result.get("Oil"), 250);
  assert.equal(result.get("Helium_3"), 40);
  assert.equal(result.get("Iron"), undefined);
}

// Empty target set (all techs and missions done) yields no demand.
{
  const result = planFuelDepotDemand({ targets: [] });
  assert.equal(result.size, 0);
}

// --- readFuelDepotDemandInput: techs plus still-pending missions only ---
const tech = (cost) => ({ cost });
const mission = (cost, flags = {}) => ({
  cost,
  isUnlocked: () => flags.unlocked ?? true,
  isComplete: () => flags.complete ?? false,
  autoBuildEnabled: flags.autoBuild ?? true,
});

{
  const input = readFuelDepotDemandInput({
    getState: () => ({
      unlockedTechs: [tech({ Knowledge: 500, Oil: 1000 })],
      missionBuildingList: [
        mission({ Helium_3: 5000 }), // pending → counts
        mission({ Oil: 9999 }, { complete: true }), // done → excluded
        mission({ Oil: 8888 }, { unlocked: false }), // locked → excluded
        mission({ Oil: 7777 }, { autoBuild: false }), // autobuild off → excluded
      ],
    }),
  });
  const result = planFuelDepotDemand(input);
  assert.equal(result.get("Oil"), 1000); // only the tech's Oil cost survives
  assert.equal(result.get("Helium_3"), 5000); // only the pending mission
}

// Late game: no researchable techs and every mission complete -> nothing.
{
  const input = readFuelDepotDemandInput({
    getState: () => ({
      unlockedTechs: [],
      missionBuildingList: [mission({ Oil: 9999 }, { complete: true })],
    }),
  });
  const result = planFuelDepotDemand(input);
  assert.equal(result.get("Oil"), undefined);
  assert.equal(result.size, 0);
}

console.log("fuel-depot-demand-test passed");
