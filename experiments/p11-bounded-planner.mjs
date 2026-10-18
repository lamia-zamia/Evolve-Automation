/** Test-only Construction-choice model for P11. No game or browser imports. */

export function cloneFrozen(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneFrozen));
  if (value !== null && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, cloneFrozen(item)]),
      ),
    );
  }
  return value;
}

const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
};

export function allocationValidityToken(input) {
  if (!input || input.complete !== true || !input.dependencies)
    return undefined;
  const {
    root,
    settings,
    controls,
    offers,
    resources,
    reservations,
    prices,
    actionBoundary,
  } = input.dependencies;
  if (
    [
      root,
      settings,
      controls,
      offers,
      resources,
      reservations,
      prices,
      actionBoundary,
    ].some((value) => value === undefined)
  )
    return undefined;
  return stable({
    dependencies: input.dependencies,
    candidates: input.candidates,
    resources: input.resources,
  });
}

function validInput(input) {
  if (allocationValidityToken(input) === undefined) return false;
  if (!Array.isArray(input.candidates) || !Array.isArray(input.resources))
    return false;
  if (
    input.candidates.some(
      (candidate) =>
        !Number.isFinite(candidate.weight) ||
        candidate.weight < 0 ||
        !candidate.cost ||
        Object.values(candidate.cost).some(
          (amount) => !Number.isFinite(amount) || amount < 0,
        ),
    )
  )
    return false;
  return input.resources.every(
    (resource) =>
      Number.isFinite(resource.quantity) &&
      resource.quantity >= 0 &&
      Number.isFinite(resource.capacity) &&
      resource.capacity >= 0 &&
      Number.isFinite(resource.reserved) &&
      resource.reserved >= 0 &&
      resource.reserved <= Math.min(resource.quantity, resource.capacity),
  );
}

function evaluateCandidate(input, index) {
  const candidate = input.candidates[index];
  if (!candidate || candidate.blocked) return undefined;
  for (const [resourceId, amount] of Object.entries(candidate.cost)) {
    const resource = input.resources.find((entry) => entry.id === resourceId);
    if (
      !resource ||
      amount >
        Math.min(resource.quantity, resource.capacity) - resource.reserved
    )
      return undefined;
  }
  return Object.freeze({
    candidateId: candidate.id,
    quantity: 1,
    cost: Object.freeze({ ...candidate.cost }),
    weight: candidate.weight,
    order: index,
  });
}

/** Same one-candidate-at-a-time algorithm is used by both drivers. */
function runEvaluations(input, start, count, best, evaluations) {
  let index = start;
  let winner = best;
  let done = evaluations;
  const end = Math.min(input.candidates.length, start + count);
  while (index < end) {
    const choice = evaluateCandidate(input, index);
    if (choice && (winner === undefined || choice.weight > winner.weight))
      winner = choice;
    index += 1;
    done += 1;
  }
  return { index, winner, evaluations: done };
}

export function planSynchronously(input) {
  if (!validInput(input))
    return Object.freeze({
      status: "failed",
      reason: "incomplete-or-invalid-input",
      evaluations: 0,
    });
  const result = runEvaluations(
    input,
    0,
    input.candidates.length,
    undefined,
    0,
  );
  return Object.freeze({
    status: "completed",
    plan: result.winner ?? null,
    evaluations: result.evaluations,
  });
}

export function startContinuation(input) {
  if (!validInput(input)) return undefined;
  return Object.freeze({
    token: allocationValidityToken(input),
    index: 0,
    best: undefined,
    evaluations: 0,
  });
}

export function advanceContinuation(
  input,
  continuation,
  budget,
  currentToken = allocationValidityToken(input),
) {
  if (!Number.isSafeInteger(budget) || budget < 1)
    throw new RangeError("budget must be a positive integer");
  if (!validInput(input) || !continuation || currentToken === undefined)
    return Object.freeze({
      status: "failed",
      reason: "authority-unavailable",
      continuation: undefined,
    });
  if (currentToken !== continuation.token)
    return Object.freeze({
      status: "invalidated",
      reason: "dependency-token-changed",
      continuation: undefined,
    });
  const limit = Math.min(budget, input.candidates.length - continuation.index);
  const result = runEvaluations(
    input,
    continuation.index,
    limit,
    continuation.best,
    continuation.evaluations,
  );
  if (result.index < input.candidates.length)
    return Object.freeze({
      status: "incomplete",
      continuation: Object.freeze({
        token: continuation.token,
        index: result.index,
        best: result.winner,
        evaluations: result.evaluations,
      }),
      evaluations: limit,
    });
  return Object.freeze({
    status: "completed",
    plan: result.winner ?? null,
    continuation: undefined,
    evaluations: limit,
    totalEvaluations: result.evaluations,
  });
}

export function makeRepresentativeInput(
  candidateCount,
  salt = 0,
  capturedRows,
  resourceIds = ["Money", "Steel", "Knowledge"],
) {
  const candidates =
    capturedRows ??
    Array.from({ length: candidateCount }, (_, index) => {
      const i = index + salt;
      return {
        key: `building-${index}`,
        weight: 1 + ((candidateCount - index) % 11) / 10,
        cost: {
          Money: 20 + ((i * 17) % 180),
          Steel: (i * 7) % 31,
          Knowledge: (i * 13) % 401,
        },
        ignored: index % 19 === 0,
      };
    });
  const normalizedCandidates = candidates.map((candidate, index) => ({
    id: candidate.id ?? candidate.key ?? `candidate-${index}`,
    weight: candidate.weight ?? candidate.weighting,
    cost: Object.fromEntries(
      Object.entries(candidate.cost ?? {}).flatMap(([id, amount]) => {
        const scope =
          candidate.pool === undefined ? id : `${id}@${candidate.pool}`;
        return resourceIds.includes(scope) ? [[scope, amount]] : [];
      }),
    ),
    blocked: candidate.blocked ?? candidate.ignored ?? false,
  }));
  return cloneFrozen({
    complete: true,
    candidates: normalizedCandidates,
    resources: resourceIds.map((id) => {
      const amounts = normalizedCandidates
        .map((candidate) => candidate.cost[id] ?? 0)
        .sort((left, right) => left - right);
      const quantity = amounts[Math.floor((amounts.length - 1) * 0.75)] ?? 0;
      return {
        id,
        quantity,
        capacity: quantity * 1.1,
        reserved: Math.floor(quantity * 0.2),
      };
    }),
    dependencies: {
      root: "root-1",
      settings: "settings-1",
      controls: "controls-1",
      offers: "offers-1",
      resources: "resource-state-1",
      reservations: "reservation-state-1",
      prices: "native-price-1",
      actionBoundary: "no-partial-action-1",
    },
  });
}
