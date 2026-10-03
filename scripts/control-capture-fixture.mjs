import { installVueCapture } from "../src/adapters/evolve/vue-capture.ts";

/** Retain each fixture's game effects and handles while real capture owns generation authority. */
export function withControlCaptureAuthority(registry) {
  const vue = { createApp: () => ({}) };
  const capture = installVueCapture({ Vue: vue });
  const mirrored = new Map();

  function mirror(elementId) {
    const original = registry.resolve(elementId);
    if (original === undefined) return undefined;
    let entry = mirrored.get(elementId);
    if (entry === undefined || entry.generation !== original.generation) {
      vue.createApp({
        el: elementId.startsWith("#") ? elementId : `#${elementId}`,
        methods: {
          fixtureInvoke(handle, method, args) {
            return registry.invoke(handle, method, args);
          },
        },
      });
      const generations = entry?.generations ?? new Map();
      generations.set(original.generation, capture.controls.resolve(elementId));
      entry = { generation: original.generation, generations };
      mirrored.set(elementId, entry);
    }
    return original;
  }

  function mirrorAll() {
    for (const elementId of registry.capturedElementIds()) mirror(elementId);
  }

  return {
    ...registry,
    checkpoint() {
      mirrorAll();
      return capture.controls.checkpoint();
    },
    rejectChanges(checkpoint, through) {
      mirrorAll();
      capture.controls.rejectChanges(checkpoint, through);
    },
    resolve(elementId) {
      const original = mirror(elementId);
      return capture.controls.resolve(elementId) === undefined
        ? undefined
        : original;
    },
    invoke(handle, method, args = []) {
      mirror(handle.elementId);
      const retained = mirrored
        .get(handle.elementId)
        ?.generations.get(handle.generation);
      if (retained === undefined)
        return { ok: false, reason: "unknown-control" };
      const result = capture.controls.invoke(retained, "fixtureInvoke", [
        handle,
        method,
        args,
      ]);
      return result.ok ? result.value : result;
    },
  };
}
