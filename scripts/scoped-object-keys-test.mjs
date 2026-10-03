import assert from "node:assert/strict";
import vm from "node:vm";
import { observeScopedObjectKeys } from "../src/adapters/evolve/scoped-object-keys.ts";

function scopedKeysTestRealm() {
  const context = vm.createContext({});
  const pageObject = vm.runInContext("Object", context);
  assert.notEqual(pageObject, Object);
  return { context, pageObject, page: { Object: pageObject } };
}

// Preserve the original function's answer identity, receiver, all arguments and descriptor flags.
{
  const { context, pageObject, page } = scopedKeysTestRealm();
  const candidate = vm.runInContext("({ alpha: 1 })", context);
  const unrelated = vm.runInContext("({ beta: 2 })", context);
  const answer = vm.runInContext('["native answer"]', context);
  const calls = [];
  const original = function (...args) {
    calls.push({ receiver: this, args });
    return answer;
  };
  Object.defineProperty(pageObject, "keys", {
    value: original,
    enumerable: true,
    writable: false,
    configurable: true,
  });
  const descriptor = Object.getOwnPropertyDescriptor(pageObject, "keys");
  const inspected = [];
  assert.equal(
    observeScopedObjectKeys(
      page,
      (argument) => inspected.push(argument),
      () => {
        assert.notEqual(pageObject.keys, original);
        assert.equal(
          Reflect.apply(pageObject.keys, candidate, [candidate, "extra", 9]),
          answer,
        );
        assert.equal(
          Reflect.apply(pageObject.keys, unrelated, [unrelated]),
          answer,
        );
      },
    ),
    true,
  );
  assert.deepEqual(calls, [
    { receiver: candidate, args: [candidate, "extra", 9] },
    { receiver: unrelated, args: [unrelated] },
  ]);
  assert.deepEqual(inspected, [candidate, unrelated]);
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(pageObject, "keys"),
    descriptor,
  );
}

// Ordinary page-realm Object.keys answers, including unrelated objects, keep their native shape.
{
  const { context, pageObject, page } = scopedKeysTestRealm();
  const object = vm.runInContext("({ one: 1, two: 2 })", context);
  const descriptor = Object.getOwnPropertyDescriptor(pageObject, "keys");
  const seen = [];
  assert.equal(
    observeScopedObjectKeys(
      page,
      (value) => seen.push(value),
      () => {
        const answer = pageObject.keys(object);
        assert.deepEqual(Array.from(answer), ["one", "two"]);
        assert.equal(
          Object.getPrototypeOf(answer),
          vm.runInContext("Array.prototype", context),
        );
        assert.deepEqual(Array.from(pageObject.keys("ab")), ["0", "1"]);
      },
    ),
    true,
  );
  assert.deepEqual(seen, [object, "ab"]);
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(pageObject, "keys"),
    descriptor,
  );
}

// Inspector, original function and protected draw exceptions all restore the exact descriptor.
for (const failure of ["inspector", "original", "draw"]) {
  const { pageObject, page } = scopedKeysTestRealm();
  let inspected = false;
  if (failure === "original") {
    Object.defineProperty(pageObject, "keys", {
      ...Object.getOwnPropertyDescriptor(pageObject, "keys"),
      value() {
        throw new Error("original keys failed");
      },
    });
  }
  const descriptor = Object.getOwnPropertyDescriptor(pageObject, "keys");
  assert.equal(
    observeScopedObjectKeys(
      page,
      () => {
        inspected = true;
        if (failure === "inspector") throw new Error("inspection failed");
      },
      () => {
        if (failure === "draw") throw new Error("draw failed");
        pageObject.keys({ a: 1 });
      },
    ),
    false,
  );
  assert.equal(inspected, failure === "inspector");
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(pageObject, "keys"),
    descriptor,
  );
  // Failure also releases the ownership guard.
  assert.equal(
    observeScopedObjectKeys(
      page,
      () => {},
      () => {},
    ),
    true,
  );
}

// Synchronous nesting is refused across page-window wrappers sharing one page Object.
{
  const { pageObject, page } = scopedKeysTestRealm();
  let nestedDraws = 0;
  assert.equal(
    observeScopedObjectKeys(
      page,
      () => {},
      () => {
        const wrapper = pageObject.keys;
        assert.equal(
          observeScopedObjectKeys(
            { Object: pageObject },
            () => {},
            () => {
              nestedDraws += 1;
            },
          ),
          false,
        );
        assert.equal(pageObject.keys, wrapper);
      },
    ),
    true,
  );
  assert.equal(nestedDraws, 0);
}

// A replacement hook owns its property: cleanup cannot overwrite it and reports failure.
{
  const { pageObject, page } = scopedKeysTestRealm();
  const replacement = () => ["replacement"];
  assert.equal(
    observeScopedObjectKeys(
      page,
      () => {},
      () => {
        Object.defineProperty(pageObject, "keys", {
          ...Object.getOwnPropertyDescriptor(pageObject, "keys"),
          value: replacement,
        });
      },
    ),
    false,
  );
  assert.equal(pageObject.keys, replacement);
}

// A descriptor restoration rejected by the page owner is unavailable, even after a good draw.
{
  const { pageObject } = scopedKeysTestRealm();
  const descriptor = Object.getOwnPropertyDescriptor(pageObject, "keys");
  let definitions = 0;
  const guardedPageObject = new Proxy(pageObject, {
    defineProperty(target, key, value) {
      definitions += 1;
      if (definitions === 2) throw new Error("restoration denied");
      return Reflect.defineProperty(target, key, value);
    },
  });
  assert.equal(
    observeScopedObjectKeys(
      { Object: guardedPageObject },
      () => {},
      () => {
        guardedPageObject.keys({ a: 1 });
      },
    ),
    false,
  );
  assert.equal(definitions, 2);
  Object.defineProperty(pageObject, "keys", descriptor);
  assert.equal(
    observeScopedObjectKeys(
      { Object: guardedPageObject },
      () => {},
      () => {},
    ),
    true,
  );
}

for (const invalidPage of [undefined, {}, { Object: null }, { Object: 7 }]) {
  assert.equal(
    observeScopedObjectKeys(
      invalidPage,
      () => {},
      () => {
        assert.fail("an unavailable page Object must not draw");
      },
    ),
    false,
  );
}
for (const inaccessible of ["nonconfigurable", "accessor"]) {
  const { pageObject, page } = scopedKeysTestRealm();
  const descriptor =
    inaccessible === "accessor"
      ? {
          get: () => () => [],
          set: undefined,
          configurable: true,
          enumerable: false,
        }
      : {
          value: pageObject.keys,
          writable: true,
          configurable: false,
          enumerable: false,
        };
  Object.defineProperty(pageObject, "keys", descriptor);
  assert.equal(
    observeScopedObjectKeys(
      page,
      () => {},
      () => {
        assert.fail("unreplaceable keys must not draw");
      },
    ),
    false,
  );
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(pageObject, "keys"),
    descriptor,
  );
}

console.log("Scoped page Object.keys transaction tests passed");
