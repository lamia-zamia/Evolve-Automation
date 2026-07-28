type PropertyDefinition = {
  s: string;
  p: string;
};

type PropertyHelperDependencies = {
  getSettings: () => Record<string, unknown>;
};

export function createPropertyHelpers({
  getSettings,
}: PropertyHelperDependencies) {
  // Recursively traverse through object, wrapping all functions in getters
  function normalizeProperties<T extends object>(
    object: T,
    proto: unknown[] = [],
  ) {
    const record = object as Record<string, unknown>;
    for (const key in object) {
      const value = record[key];
      if (
        typeof value === "object" &&
        ((value as { constructor: unknown }).constructor === Object ||
          (value as { constructor: unknown }).constructor === Array ||
          proto.indexOf((value as { constructor: unknown }).constructor) !== -1)
      ) {
        record[key] = normalizeProperties(value as object, proto);
      }
      if (typeof record[key] === "function") {
        const fn = (record[key] as () => unknown).bind(object);
        Object.defineProperty(object, key, {
          configurable: true,
          enumerable: true,
          get: () => fn(),
        });
      }
    }
    return object;
  }

  // Add getters for setting properties
  function addProps<T extends object>(
    list: Record<string, T>,
    id: (item: T) => string,
    props: PropertyDefinition[],
  ) {
    for (const item of Object.values(list)) {
      for (const prop of props) {
        const settingKey = prop.s + id(item);
        const propertyKey = prop.p;
        Object.defineProperty(item, propertyKey, {
          configurable: true,
          enumerable: true,
          get: () => getSettings()[settingKey],
        });
      }
    }
    return list;
  }

  return { normalizeProperties, addProps };
}
