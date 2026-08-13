/**
 * Characterization-only runtime surface. This module is imported by the test
 * bundle entry, never by the production userscript entry.
 */
export function createRuntimeTestSurface() {
  const contexts = new Map();
  const parts = [];

  return {
    add(part) {
      parts.push(part);
    },
    addContext(name, part, publicName = name) {
      const setterName = `set${publicName[0].toUpperCase()}${publicName.slice(1)}TestContext`;
      parts.push({
        ...part,
        [setterName]: (context) => contexts.set(name, context),
      });
    },
    getContext(name) {
      return contexts.get(name);
    },
    setContext(name, context) {
      contexts.set(name, context);
    },
    finish() {
      return Object.assign({}, ...parts);
    },
  };
}
