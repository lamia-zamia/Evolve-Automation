export interface ConstructionAllocationPriceSource {
  readonly name: unknown;
  readonly pool?: unknown;
  readonly cost: unknown;
}

export interface ConstructionAllocationAuthorityInput {
  readonly publicationCurrent: boolean;
  readonly targetId: unknown;
  readonly request: unknown;
  readonly publication: unknown;
  readonly native: unknown;
  readonly resources: unknown;
}

export interface ConstructionAllocationAuthority {
  readonly targetId: string;
  readonly cost: Readonly<Record<string, number>>;
  readonly pool: string;
  readonly stock: Readonly<Record<string, number>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isPriceSource(
  value: unknown,
): value is ConstructionAllocationPriceSource {
  return isRecord(value) && "name" in value && "cost" in value;
}

function priceIdentity(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (
    entries.some(
      ([name, amount]) =>
        name.length === 0 ||
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        amount < 0,
    )
  )
    return undefined;
  return JSON.stringify(
    entries.sort(([left], [right]) => left.localeCompare(right)),
  );
}

function poolIdentity(value: unknown): string | undefined {
  if (value === undefined) return "anywhere";
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function readConstructionAllocationAuthority(
  input: ConstructionAllocationAuthorityInput,
): ConstructionAllocationAuthority | undefined {
  const { targetId, request, publication, native } = input;
  if (
    input.publicationCurrent !== true ||
    typeof targetId !== "string" ||
    !targetId.startsWith("city-") ||
    !isPriceSource(request) ||
    !isPriceSource(publication) ||
    !isRecord(native) ||
    request?.name !== targetId ||
    publication?.name !== targetId ||
    !("cost" in native)
  )
    return undefined;
  const requestPrice = priceIdentity(request.cost);
  const publicationPrice = priceIdentity(publication.cost);
  const nativePrice = priceIdentity(native.cost);
  const requestPool = poolIdentity(request.pool);
  const publicationPool = poolIdentity(publication.pool);
  const nativePool = poolIdentity(native.pool);
  if (
    requestPrice === undefined ||
    requestPrice !== publicationPrice ||
    requestPrice !== nativePrice ||
    requestPool === undefined ||
    requestPool !== "anywhere" ||
    requestPool !== publicationPool ||
    requestPool !== nativePool
  )
    return undefined;

  const cost = request.cost as Record<string, number>;
  const resources = isRecord(input.resources) ? input.resources : undefined;
  if (resources === undefined) return undefined;
  const stock: Record<string, number> = {};
  for (const [resourceId, amount] of Object.entries(cost)) {
    const resource = resources[resourceId];
    if (!isRecord(resource)) return undefined;
    const current = resource.amount;
    const maximum = resource.max;
    if (
      typeof current !== "number" ||
      !Number.isFinite(current) ||
      current < 0 ||
      typeof maximum !== "number" ||
      !Number.isFinite(maximum) ||
      maximum < current
    )
      return undefined;
    stock[resourceId] = current;
    if (resourceId !== "Lumber" && resourceId !== "Stone" && current < amount)
      return undefined;
  }
  if (
    !Object.entries(cost).some(
      ([id, amount]) => (id === "Lumber" || id === "Stone") && amount > 0,
    )
  )
    return undefined;
  return Object.freeze({
    targetId,
    cost: Object.freeze({ ...cost }),
    pool: requestPool,
    stock: Object.freeze(stock),
  });
}
