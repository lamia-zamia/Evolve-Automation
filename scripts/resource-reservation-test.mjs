import assert from "node:assert/strict";

import {
  canSpendWithDistantReservation,
  DEFAULT_RESERVATION_HORIZON_SECONDS,
} from "../src/domain/economy/resources/reservation.ts";

const resource = { current: 41, spare: -209, rate: 0.01 };
assert.equal(DEFAULT_RESERVATION_HORIZON_SECONDS, 14_400);
assert.equal(canSpendWithDistantReservation(resource, 5), true);

// A five-unit spend would be restored in 500 seconds, so the reservation
// remains hard even though the current quantity covers the spend.
assert.equal(
  canSpendWithDistantReservation({ ...resource, spare: 0, rate: 0.01 }, 5),
  false,
);
assert.equal(
  canSpendWithDistantReservation({ ...resource, rate: 0 }, 5),
  false,
);
assert.equal(
  canSpendWithDistantReservation({ ...resource, current: 4 }, 5),
  false,
);
assert.equal(
  canSpendWithDistantReservation({ ...resource, spare: 5 }, 5),
  true,
);
assert.equal(
  canSpendWithDistantReservation({ ...resource, spare: -139 }, 5),
  false,
  "a reservation restored exactly at the horizon remains hard",
);

console.log("Resource reservation policy tests passed");
