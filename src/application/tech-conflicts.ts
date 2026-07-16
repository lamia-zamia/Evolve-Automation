import type { TechConflict } from "../domain/tech-conflicts.ts";

export function formatTechConflict(
  conflict: Readonly<TechConflict>,
  formatNumber: (value: number) => string | number,
): string {
  switch (conflict.code) {
    case "ignored-research":
      return "Ignored research";
    case "reset-research":
      return "Reset research";
    case "saving-soul-gems":
      return "Saving up Soul Gems for prestige";
    case "retirement-fork":
      return "Progression fork to Retirement reset";
    case "retirement-preparation":
      return `Retirement preparation incomplete: ${conflict.missing.join(", ")}`;
    case "witch-demonic-fork":
      return "Progression fork to Witch Hunter's Demonic Infusion";
    case "matrix-fork":
      return "Progression fork to Matrix reset";
    case "apotheosis-fork":
      return "Progression fork to Apotheosis";
    case "vaccination-strategy":
      return "Undesirable Vaccination Strategy";
    case "dark-bomb-disabled":
      return "Dark Bomb disabled";
    case "prestige-unneeded":
      return "Not needed for current prestige";
    case "maximum-knowledge":
      return `${formatNumber(conflict.required)} Max Knowledge required`;
    case "banana-republic-guard":
      return "Banana Republic guard";
    case "cult-of-personality-guard":
      return "Cult of Personality achievement guard";
    case "unification-disabled":
      return "Unification disabled";
    case "stabilization-disabled":
      return "Blackhole stabilization disabled";
    case "stabilization-during-whitehole":
      return "Disabled during whitehole reset";
    case "stabilization-cooldown":
      return `On cooldown for ${conflict.seconds} more seconds`;
    case "second-evolution-guard":
      return "Second Evolution achievement guard";
    case "theology-path":
      return "Undesirable theology path";
  }
}
