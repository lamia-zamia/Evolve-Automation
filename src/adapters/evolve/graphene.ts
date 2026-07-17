import type { GrapheneFuelView, GrapheneInput } from "../../domain/graphene.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface GrapheneReaderDependencies {
  readonly getGrapheneManager: () => unknown;
  readonly getResources: () => unknown;
  readonly consumptionBalanceMin: number;
}

function callBoolean(
  record: UnknownRecord,
  name: string,
  path: string,
): boolean {
  const method = requireFunction(record[name], `${path}.${name}`);
  return Boolean(Reflect.apply(method, record, []));
}

function callNumber(
  record: UnknownRecord,
  name: string,
  path: string,
  ...args: unknown[]
): number {
  const method = requireFunction(record[name], `${path}.${name}`);
  return requireNumber(
    Reflect.apply(method, record, args),
    `${path}.${name}()`,
  );
}

function readFuels(manager: UnknownRecord): GrapheneFuelView[] {
  const fuels = requireRecord(manager["Fuels"], "GrapheneManager.Fuels");
  return Object.values(fuels).map((entry, index) => {
    const path = `GrapheneManager.Fuels[${index}]`;
    const fuel = requireRecord(entry, path);
    const id = fuel["id"];
    if (typeof id !== "string") {
      throw new TypeError(`${path}.id must be a string`);
    }
    const cost = requireRecord(fuel["cost"], `${path}.cost`);
    const resource = requireRecord(cost["resource"], `${path}.cost.resource`);
    return Object.freeze({
      id,
      storageRatio: requireNumber(
        resource["storageRatio"],
        `${path}.cost.resource.storageRatio`,
      ),
      rateOfChange: requireNumber(
        resource["rateOfChange"],
        `${path}.cost.resource.rateOfChange`,
      ),
      currentQuantity: requireNumber(
        resource["currentQuantity"],
        `${path}.cost.resource.currentQuantity`,
      ),
      isUnlocked: callBoolean(resource, "isUnlocked", `${path}.cost.resource`),
      costQuantity: requireNumber(cost["quantity"], `${path}.cost.quantity`),
      costMinRateOfChange: requireNumber(
        cost["minRateOfChange"],
        `${path}.cost.minRateOfChange`,
      ),
      currentFuelCount: callNumber(
        manager,
        "fueledCount",
        "GrapheneManager",
        fuel,
      ),
    });
  });
}

export function readGrapheneInput(
  dependencies: GrapheneReaderDependencies,
): GrapheneInput {
  const manager = requireRecord(
    dependencies.getGrapheneManager(),
    "GrapheneManager",
  );
  // Legacy returns immediately when the industry is not initialised.
  if (!callBoolean(manager, "initIndustry", "GrapheneManager")) {
    return Object.freeze({
      initialised: false,
      maxOperating: 0,
      grapheneUseful: false,
      consumptionBalanceMin: dependencies.consumptionBalanceMin,
      fuels: Object.freeze([]),
    });
  }
  const resources = requireRecord(dependencies.getResources(), "resources");
  const graphene = requireRecord(resources["Graphene"], "resources.Graphene");

  return Object.freeze({
    initialised: true,
    maxOperating: callNumber(manager, "maxOperating", "GrapheneManager"),
    grapheneUseful: callBoolean(graphene, "isUseful", "resources.Graphene"),
    consumptionBalanceMin: dependencies.consumptionBalanceMin,
    fuels: Object.freeze(readFuels(manager)),
  });
}
