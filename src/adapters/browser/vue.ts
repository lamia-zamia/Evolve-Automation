// TRANSITIONAL: Support the current Vue 2 marker and the DeadSpace branch's Vue 3
// compatibility markers in one browser adapter. Replace this bridge with explicit
// game-facing ports when the upstream Vue 3 component contracts stabilize.

type BrowserRecord = Record<PropertyKey, unknown>;

export interface VueAdapterDependencies {
  readonly getWin: () => {
    readonly document: {
      readonly getElementById: (id: string) => unknown;
      readonly querySelector?: (selector: string) => unknown;
    };
  };
}

function asRecord(value: unknown): BrowserRecord | undefined {
  return (typeof value === "object" && value !== null) ||
    typeof value === "function"
    ? (value as BrowserRecord)
    : undefined;
}

function readProperty(owner: unknown, key: PropertyKey): unknown {
  return asRecord(owner)?.[key];
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function readVueProxy(element: unknown): unknown {
  const customProxy = readProperty(element, "__vue_proxy__");
  if (isPresent(customProxy)) {
    return customProxy;
  }

  const app = readProperty(element, "__vue_app__");
  const instance = readProperty(app, "_instance");
  const appProxy = readProperty(instance, "proxy");
  if (isPresent(appProxy)) {
    return appProxy;
  }

  const legacyVue = readProperty(element, "__vue__");
  return isPresent(legacyVue) ? legacyVue : undefined;
}

export function createVueAdapter({ getWin }: VueAdapterDependencies) {
  function getVueById(elementId: string): unknown {
    const element = getWin().document.getElementById(elementId);
    return readVueProxy(element);
  }

  function getMainVue(): unknown {
    const document = getWin().document;
    const querySelector = document.querySelector;
    if (typeof querySelector !== "function") {
      return undefined;
    }
    return readVueProxy(
      Reflect.apply(querySelector, document, ["#mainColumn > div:first-child"]),
    );
  }

  return Object.freeze({ getVueById, getMainVue });
}
