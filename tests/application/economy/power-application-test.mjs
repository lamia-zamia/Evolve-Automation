import assert from "node:assert/strict";
import { createPowerAutomation } from "../../../src/application/power.ts";
import { createMechSupplyReservation } from "../../../src/application/mech-supply-reservation.ts";
import { capturedMechSupplyHold } from "../../../src/domain/combat/mech-auto-choice.ts";
import { planPowerWarningShutdown } from "../../../src/domain/economy/production/power.ts";

const powerApplicationBuilding = {
  index: 0,
  id: "coal_power",
  binding: "city-coal_power",
  count: 3,
  stateOn: 1,
  powered: -10,
  autoMaximum: 3,
  tab: "city",
  smartCategory: false,
  smartEnabled: false,
  crewShip: false,
  crewValueRank: 0,
  singleState: false,
  ignorePositivePowerCap: false,
  skipGroup: "none",
  extraDescription: "",
  consumptions: [],
  supportChanges: [],
  produces: [],
  fleetMaximum: null,
  rule: { kind: "ordinary" },
};
const powerApplicationCycle = {
  powerUnlocked: true,
  powerResourceId: "Power",
  powerCurrent: 10,
  powerMaximum: 30,
  replicatorAvailable: false,
  fasting: false,
  hungryRace: false,
  banquetStateOn: 0,
  debug: false,
  consumptionBalanceMinimum: 1,
  civilianPopulation: 10,
  currentCrew: 0,
  settings: {
    showGalactic: true,
    limitPowered: false,
    autoFleet: false,
    crewReserve: 0,
  },
  resources: [
    {
      id: "Power",
      title: "Power",
      currentQuantity: 10,
      maxQuantity: 30,
      rateOfChange: 10,
      storageRatio: 1 / 3,
      unlocked: true,
      useful: true,
      income: 10,
    },
  ],
  supports: [],
  beltConsumers: [],
  buildings: [powerApplicationBuilding],
  lake: { enabled: false },
  spire: { available: false },
};
const powerApplicationWarning = {
  domId: "city-coal_power",
  buildingId: "coal_power",
  binding: "city-coal_power",
  stateOn: 1,
  autoStateEnabled: true,
  ship: false,
  warningKind: "ordinary",
  beltSupportNeeded: 0,
  beltSupportMaximum: 0,
  lakeSupportNeeded: 0,
  lakeSupportMaximum: 0,
};
assert.equal(
  planPowerWarningShutdown([{ ...powerApplicationWarning, stateOn: 0 }]),
  null,
);

function powerApplicationHarness() {
  let cycle = powerApplicationCycle;
  let unavailableReason =
    "exact demand unavailable: queue reservation unavailable: city-mine: queued item could not be priced";
  let warned = true;
  let enabled = true;
  let reject = false;
  const executed = [];
  const automation = createPowerAutomation({
    reader: {
      readCycle: () => cycle,
      readUnavailableReason: () => ({
        authority: "exact-demand",
        message: unavailableReason,
      }),
      readWarnings: () =>
        warned
          ? [{ ...powerApplicationWarning, autoStateEnabled: enabled }]
          : [],
      readStateOn: () => 0,
    },
    warnings: {
      readDebugEnabled: () => false,
      readWarnedBuildingDomIds: () => ["city-coal_power"],
    },
    executor: {
      execute: (decision) => {
        executed.push(decision);
        return reject ? { status: "stale" } : { status: "succeeded" };
      },
    },
  });
  return {
    automation,
    executed,
    setCycle: (value) => {
      cycle = value;
    },
    setUnavailableReason: (value) => {
      unavailableReason = value;
    },
    clearWarning: () => {
      warned = false;
    },
    disableWarning: () => {
      enabled = false;
    },
    rejectExecution: () => {
      reject = true;
    },
  };
}

{
  const harness = powerApplicationHarness();
  assert.equal(harness.automation.run().status, "succeeded");
  assert.deepEqual(
    harness.executed.map((decision) => decision.kind),
    ["apply-power-cycle", "shutdown-warned-building"],
  );
  const firstState = harness.automation.readState();
  assert.equal(firstState.warningCaps["city-coal_power"].cap, 0);
  harness.clearWarning();
  harness.automation.run();
  const nextState = harness.automation.readState();
  assert.equal(
    nextState.warningCaps["city-coal_power"].ticks,
    firstState.warningCaps["city-coal_power"].ticks - 1,
  );
  assert.ok(nextState.oscillations["city-coal_power"]);
}
{
  const harness = powerApplicationHarness();
  harness.disableWarning();
  harness.automation.run();
  assert.equal(harness.executed.length, 1);
  assert.deepEqual(harness.automation.readState().warningCaps, {});
}
{
  const harness = powerApplicationHarness();
  const before = harness.automation.readState();
  harness.rejectExecution();
  assert.equal(harness.automation.run().status, "stale");
  assert.equal(harness.executed.length, 1);
  assert.equal(harness.automation.readState(), before);
}
{
  const harness = powerApplicationHarness();
  const before = harness.automation.readState();
  harness.setCycle(undefined);
  const outcome = harness.automation.run();
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "captured-power-cycle-unavailable");
  assert.match(
    outcome.failure.message,
    /city-mine: queued item could not be priced/,
  );
  assert.equal(harness.executed.length, 0);
  assert.equal(harness.automation.readState(), before);
  harness.setUnavailableReason("production breakdown unavailable");
  assert.equal(
    harness.automation.run().failure.message,
    "production breakdown unavailable",
  );
  harness.setCycle(powerApplicationCycle);
  assert.equal(harness.automation.run().status, "succeeded");
  assert.equal(
    harness.executed.length > 0,
    true,
    "recovery executes the next valid cycle",
  );
}
{
  const reservation = createMechSupplyReservation();
  assert.equal(reservation.readPowerSupplyHold(), undefined);
  assert.equal(reservation.readSaveSupply(), false);
  assert.equal(reservation.setSaveSupply(true, false), false);
  assert.equal(reservation.readPowerSupplyHold(), undefined);
  assert.equal(reservation.setSaveSupply(false, true), true);
  const state = {
    settings: { saveSupplyRatio: 1 },
    powerSupplyHold: reservation.readPowerSupplyHold(),
  };
  assert.equal(capturedMechSupplyHold(state, false, null, 0), true);
  assert.equal(capturedMechSupplyHold(state, true, null, 0), false);
  assert.equal(reservation.setSaveSupply(true, false), true);
  assert.equal(
    capturedMechSupplyHold(
      { ...state, powerSupplyHold: reservation.readPowerSupplyHold() },
      false,
      null,
      0,
    ),
    false,
  );
  reservation.reset();
  assert.equal(reservation.readPowerSupplyHold(), undefined);
}
console.log("Power application state and warning checks passed");
