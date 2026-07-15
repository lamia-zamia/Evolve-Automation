type Loose = any;

export function createDependencyResolver(
  overrides: Record<string, Loose>,
  dependencies: Record<string, () => Loose>,
) {
  return (name: string) => {
    if (Object.prototype.hasOwnProperty.call(overrides, name)) {
      return overrides[name];
    }
    return dependencies[name]?.();
  };
}

function propertyDescriptor(value: Loose, property: PropertyKey) {
  const object = Object(value);
  const descriptor = Object.getOwnPropertyDescriptor(object, property);
  return {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    writable: true,
    value: Reflect.get(object, property),
  };
}

export function liveObject(getValue: () => Loose): Loose {
  return new Proxy(
    {},
    {
      get: (_target, property) => {
        const value = getValue();
        if (property === Symbol.toPrimitive) return () => value;
        const result = Reflect.get(Object(value), property);
        return typeof result === "function" ? result.bind(value) : result;
      },
      set: (_target, property, value) =>
        Reflect.set(Object(getValue()), property, value),
      deleteProperty: (_target, property) =>
        Reflect.deleteProperty(Object(getValue()), property),
      has: (_target, property) => Reflect.has(Object(getValue()), property),
      ownKeys: () => Reflect.ownKeys(Object(getValue())),
      getOwnPropertyDescriptor: (_target, property) =>
        propertyDescriptor(getValue(), property),
      getPrototypeOf: () => Reflect.getPrototypeOf(Object(getValue())),
    },
  );
}

export function liveFunction(getValue: () => Loose): Loose {
  return new Proxy(function () {}, {
    apply: (_target, thisArg, argumentsList) =>
      Reflect.apply(getValue(), thisArg, argumentsList),
    construct: (_target, argumentsList, newTarget) =>
      Reflect.construct(getValue(), argumentsList, newTarget),
    get: (_target, property) => {
      if (property === Symbol.hasInstance) {
        return (value: Loose) => value instanceof getValue();
      }
      return Reflect.get(getValue(), property);
    },
    set: (_target, property, value) => Reflect.set(getValue(), property, value),
    has: (_target, property) => Reflect.has(getValue(), property),
    ownKeys: () => Reflect.ownKeys(getValue()),
    getOwnPropertyDescriptor: (_target, property) =>
      propertyDescriptor(getValue(), property),
    getPrototypeOf: () => Reflect.getPrototypeOf(getValue()),
  });
}
