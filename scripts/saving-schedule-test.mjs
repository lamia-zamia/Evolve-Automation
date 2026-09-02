import assert from "node:assert/strict";
import test from "node:test";

import { planSavingSchedule } from "../src/domain/economy/resources/saving-schedule.ts";

const cost = (resourceId, amount, currentQuantity, ratePerDay) =>
  Object.freeze({ resourceId, amount, currentQuantity, ratePerDay });

const plan = (overrides = {}) =>
  planSavingSchedule({
    name: "Ship Yard",
    costs: [cost("Titanium", 650_000, 50_000, 500)],
    currentDay: 30_000,
    previous: null,
    ...overrides,
  });

test("the bottleneck resource's floor is exactly what is already accumulated", () => {
  // 600,000 short at 500/day is 1,200 days out. The deadline is set by this
  // resource, so the floor is cost - rate * 1,200 = the 50,000 already held:
  // production must supply the rest rather than the stock being spent away.
  const result = plan();
  assert.equal(result.commitment?.deadlineDay, 31_200);
  assert.deepEqual(result.holds, { Titanium: 50_000 });
});

test("a resource that is not the bottleneck stays free", () => {
  // Iridium sets the deadline at 3,000 days out. Money can rebuild its whole
  // cost many times over inside that window, so it carries no floor and
  // cheaper candidates may keep spending it.
  const result = plan({
    costs: [
      cost("Iridium", 300_000, 0, 100),
      cost("Money", 2_000_000, 1_500_000, 10_000),
    ],
  });
  assert.equal(result.commitment?.deadlineDay, 33_000);
  assert.equal(result.holds["Money"], undefined);
});

test("the floor rises as the committed day approaches", () => {
  const previous = { name: "Ship Yard", deadlineDay: 31_200 };
  // 400 days left: production supplies 200,000, so 450,000 must be held now.
  const result = plan({ currentDay: 30_800, previous });
  assert.equal(result.holds["Titanium"], 450_000);
});

test("the commitment improves but is never pushed back by our own spending", () => {
  const previous = { name: "Ship Yard", deadlineDay: 31_200 };
  // Spending Titanium makes the fresh estimate worse; the promise still stands.
  const drained = plan({
    costs: [cost("Titanium", 650_000, 0, 500)],
    currentDay: 30_000,
    previous,
  });
  assert.equal(drained.commitment?.deadlineDay, 31_200);

  // A genuinely better plan pulls the deadline forward.
  const faster = plan({
    costs: [cost("Titanium", 650_000, 50_000, 2_000)],
    currentDay: 30_000,
    previous,
  });
  assert.equal(faster.commitment?.deadlineDay, 30_300);
});

test("an expired commitment is re-established rather than held against a past day", () => {
  const previous = { name: "Ship Yard", deadlineDay: 29_000 };
  const result = plan({ currentDay: 30_000, previous });
  assert.equal(result.commitment?.deadlineDay, 31_200);
});

test("a commitment for a different target is not inherited", () => {
  const previous = { name: "Something Else", deadlineDay: 30_100 };
  const result = plan({ previous });
  assert.equal(result.commitment?.deadlineDay, 31_200);
});

test("a target blocked on an unproduced resource reserves nothing at all", () => {
  // Neutronium has a deficit and no production, so the target cannot complete
  // and must not hold Titanium while it waits.
  const result = plan({
    costs: [
      cost("Titanium", 650_000, 640_000, 500),
      cost("Neutronium", 1_000, 0, 0),
    ],
  });
  assert.equal(result.commitment, null);
  assert.deepEqual(result.holds, {});
});

test("an unproduced resource that is already covered does not block the schedule", () => {
  const result = plan({
    costs: [
      cost("Titanium", 650_000, 50_000, 500),
      cost("Mythril", 500_000, 500_000, 0),
    ],
  });
  assert.equal(result.commitment?.deadlineDay, 31_200);
  // Mythril is met and unproduced, so it carries no floor of its own.
  assert.deepEqual(Object.keys(result.holds), ["Titanium"]);
});

test("the deadline is set by the slowest resource", () => {
  const result = plan({
    costs: [
      cost("Titanium", 650_000, 50_000, 500), // 1,200 days
      cost("Iridium", 300_000, 0, 100), // 3,000 days
    ],
  });
  assert.equal(result.commitment?.deadlineDay, 33_000);
});

test("a met target schedules nothing", () => {
  const result = plan({ costs: [cost("Titanium", 650_000, 650_000, 500)] });
  assert.equal(result.commitment, null);
  assert.deepEqual(result.holds, {});
});

test("a floor never exceeds what the target needs", () => {
  // A negative rate would otherwise imply holding more than the cost.
  const result = plan({
    costs: [cost("Alloy", 16_000, 0, -50)],
    previous: { name: "Ship Yard", deadlineDay: 30_100 },
  });
  assert.equal(result.holds["Alloy"], undefined);
});
