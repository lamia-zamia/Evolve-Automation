import type {
  CapturedGameMechanics,
  CapturedRoundedValue,
} from "../../../../ports/captured-game-mechanics.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";

interface NativeTradeQuote {
  readonly sellPrice: number;
  readonly sellQuantity: number;
  readonly buyPrice: number;
  readonly buyVolume: number;
}

function roundedTradeValue(
  value: CapturedRoundedValue | undefined,
  digits: number,
): number | undefined {
  if (
    value?.digits !== digits ||
    !Number.isFinite(value.receiver) ||
    !new RegExp(`^-?\\d+\\.\\d{${digits}}$`).test(value.text)
  )
    return undefined;
  const rounded = Number(value.text);
  return Number.isFinite(rounded) && rounded > 0 ? rounded : undefined;
}

function tradeRoundingPair(
  values: readonly CapturedRoundedValue[],
  firstDigits: number,
  lastDigits: number,
): readonly [CapturedRoundedValue, CapturedRoundedValue] | undefined {
  if (values.length < 2) return undefined;
  const first = values[values.length - 2];
  const last = values[values.length - 1];
  if (
    roundedTradeValue(first, firstDigits) === undefined ||
    roundedTradeValue(last, lastDigits) === undefined
  )
    return undefined;
  // A second terminal-shaped pair cannot be attributed to the one route tooltip call.
  for (let index = 0; index < values.length - 2; index += 1) {
    if (
      values[index]?.digits === firstDigits &&
      values[index + 1]?.digits === lastDigits
    )
      return undefined;
  }
  return [first!, last!];
}

function observeTradeRounding(
  root: unknown,
  resourceId: string,
  control: GameControlHandle,
  method: "aSell" | "aBuy" | "volume",
  firstDigits: number,
  lastDigits: number | undefined,
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
  mechanics: CapturedGameMechanics,
): readonly CapturedRoundedValue[] | undefined {
  if (
    rootState.readRoot() !== root ||
    controls.resolve(control.elementId)?.generation !== control.generation ||
    !control.methods.includes(method)
  )
    return undefined;
  let invoked = false;
  const scan = mechanics.readRoundedValues(() => {
    const result = controls.invoke(
      control,
      method,
      method === "volume" ? [] : [resourceId],
    );
    invoked = result.ok;
  });
  if (
    scan.kind !== "value" ||
    !invoked ||
    rootState.readRoot() !== root ||
    controls.resolve(control.elementId)?.generation !== control.generation ||
    !controls.resolve(control.elementId)?.methods.includes(method)
  )
    return undefined;
  if (lastDigits === undefined) {
    const value = scan.value.at(-1);
    return roundedTradeValue(value, firstDigits) !== undefined &&
      scan.value.slice(0, -1).every((entry) => entry.digits !== firstDigits)
      ? [value!]
      : undefined;
  }
  return tradeRoundingPair(scan.value, firstDigits, lastDigits);
}

/** Pinned resources.js: aSell ends in price(1), quantity(3); aBuy in volume(3), price(1). */
export function readCapturedTradeQuote(
  root: unknown,
  resourceId: string,
  control: GameControlHandle,
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
  mechanics: CapturedGameMechanics,
): NativeTradeQuote | undefined {
  const sell = observeTradeRounding(
    root,
    resourceId,
    control,
    "aSell",
    1,
    3,
    rootState,
    controls,
    mechanics,
  );
  if (sell === undefined) return undefined;
  const buy = observeTradeRounding(
    root,
    resourceId,
    control,
    "aBuy",
    3,
    1,
    rootState,
    controls,
    mechanics,
  );
  if (buy === undefined) return undefined;
  return Object.freeze({
    sellPrice: Number(sell[0]!.text),
    sellQuantity: sell[1]!.receiver,
    buyPrice: Number(buy[1]!.text),
    buyVolume: buy[0]!.receiver,
  });
}

/** Pinned resources.js: regional volume ends in blackMarketVolume(res).toFixed(2). */
export function readCapturedRegionalVolume(
  root: unknown,
  resourceId: string,
  control: GameControlHandle,
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
  mechanics: CapturedGameMechanics,
): number | undefined {
  const observed = observeTradeRounding(
    root,
    resourceId,
    control,
    "volume",
    2,
    undefined,
    rootState,
    controls,
    mechanics,
  );
  return observed?.[0]?.receiver;
}
