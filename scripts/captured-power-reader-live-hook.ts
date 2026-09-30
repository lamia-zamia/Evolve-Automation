const hook: Record<string, unknown> = {};
Object.defineProperty(globalThis, "__EA_TEST_HOOKS__", {
  configurable: true,
  enumerable: false,
  writable: true,
  value: hook,
});
