import type {
  PlanetSelectionControls,
  ShapeshiftControls,
  UniverseSelectionControls,
} from "../../ports/progression-controls.ts";
import { requireFunction, requireRecord } from "../validation.ts";

export function createShapeshiftControls(
  getVueById: (id: string) => unknown,
): ShapeshiftControls {
  return Object.freeze({
    setShape(genus: string): boolean {
      const value = getVueById("sshifter");
      if (typeof value !== "object" || value === null) {
        return false;
      }
      const view = requireRecord(value, "shapeshift controls");
      if (typeof view["setShape"] !== "function") {
        return false;
      }
      const setShape = requireFunction(
        view["setShape"],
        "shapeshift controls.setShape",
      );
      Reflect.apply(setShape, view, [genus]);
      return true;
    },
  });
}

export function createUniverseSelectionControls(
  getDocument: () => unknown,
): UniverseSelectionControls {
  return Object.freeze({
    selectUniverse(name: string): boolean {
      const document = requireRecord(getDocument(), "document");
      const getElementById = requireFunction(
        document["getElementById"],
        "document.getElementById",
      );
      const value = Reflect.apply(getElementById, document, [`uni-${name}`]);
      if (typeof value !== "object" || value === null) {
        return false;
      }
      const action = requireRecord(value, `document#uni-${name}`);
      const children = action["children"];
      if (
        (typeof children !== "object" && !Array.isArray(children)) ||
        children === null
      ) {
        return false;
      }
      const first = (children as Record<number, unknown>)[0];
      if (typeof first !== "object" || first === null) {
        return false;
      }
      const child = requireRecord(first, `document#uni-${name}.children[0]`);
      if (typeof child["click"] !== "function") {
        return false;
      }
      const click = requireFunction(
        child["click"],
        `document#uni-${name}.children[0].click`,
      );
      Reflect.apply(click, child, []);
      return true;
    },
  });
}

export function createPlanetSelectionControls(
  getDocument: () => unknown,
  getMouseEventConstructor: () => unknown,
): PlanetSelectionControls {
  return Object.freeze({
    selectPlanet(elementId: string): boolean {
      const document = requireRecord(getDocument(), "document");
      const getElementById = requireFunction(
        document["getElementById"],
        "document.getElementById",
      );
      const value = Reflect.apply(getElementById, document, [elementId]);
      if (typeof value !== "object" || value === null) {
        return false;
      }
      const element = requireRecord(value, `document#${elementId}`);
      if (typeof element["dispatchEvent"] !== "function") {
        return false;
      }
      const children = element["children"];
      if (
        (typeof children !== "object" && !Array.isArray(children)) ||
        children === null
      ) {
        return false;
      }
      const first = (children as Record<number, unknown>)[0];
      if (typeof first !== "object" || first === null) {
        return false;
      }
      const child = requireRecord(first, `document#${elementId}.children[0]`);
      if (typeof child["click"] !== "function") {
        return false;
      }
      const MouseEventConstructor = getMouseEventConstructor();
      if (typeof MouseEventConstructor !== "function") {
        return false;
      }
      // The mouseover popper must exist before the click, or the game throws
      // while selecting the planet.
      const dispatchEvent = requireFunction(
        element["dispatchEvent"],
        `document#${elementId}.dispatchEvent`,
      );
      Reflect.apply(dispatchEvent, element, [
        Reflect.construct(
          MouseEventConstructor as new (...args: unknown[]) => unknown,
          ["mouseover", {}],
        ),
      ]);
      const click = requireFunction(
        child["click"],
        `document#${elementId}.children[0].click`,
      );
      Reflect.apply(click, child, []);
      return true;
    },
  });
}
