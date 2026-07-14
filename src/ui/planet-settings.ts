import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface PlanetSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createPlanetSettings({
  getDependency,
  getOverride,
}: PlanetSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const addTableInput = liveFunction(() => getDependency("addTableInput"));
  const biomeList = liveObject(() => getDependency("biomeList"));
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const buildTableLabel = liveFunction(() => getDependency("buildTableLabel"));
  const document = liveObject(() => getDependency("document"));
  const extraList = liveObject(() => getDependency("extraList"));
  const game = liveObject(() => getDependency("game"));
  const resetPlanetSettings = liveFunction(() =>
    getDependency("resetPlanetSettings"),
  );
  const traitList = liveObject(() => getDependency("traitList"));
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildPlanetSettingsImpl() {
    let sectionId = "planet";
    let sectionName = "Planet Weighting";

    let resetFunction = function () {
      resetPlanetSettings(true);
      updateSettingsFromState();
      updatePlanetSettingsContent();
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updatePlanetSettingsContent,
    );
  }

  function updatePlanetSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_planetContent");
    currentNode.empty().off("*");

    currentNode.append(`
          <span>Planet Weighting = Biome Weighting + Trait Weighting + (Extras Intensity * Extras Weightings)</span>
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:20%">Biome</th>
              <th class="has-text-warning" style="width:calc(40% / 3)">Weighting</th>
              <th class="has-text-warning" style="width:20%">Trait</th>
              <th class="has-text-warning" style="width:calc(40% / 3)">Weighting</th>
              <th class="has-text-warning" style="width:20%">Extra</th>
              <th class="has-text-warning" style="width:calc(40% / 3)">Weighting</th>
            </tr>
            <tbody id="script_planetTableBody"></tbody>
          </table>`);

    let tableBodyNode = $("#script_planetTableBody");
    let newTableBodyText = "";

    let tableSize = Math.max(
      biomeList.length,
      traitList.length,
      extraList.length,
    );
    for (let i = 0; i < tableSize; i++) {
      newTableBodyText += `<tr><td id="script_planet_${i}" style="width:20%"></td><td style="width:calc(40% / 3);border-right-width:1px"></td><td style="width:20%"></td><td style="width:calc(40% / 3);border-right-width:1px"></td><td style="width:20%"></td><td style="width:calc(40% / 3)"></td>/tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    for (let i = 0; i < tableSize; i++) {
      let tableElement = $("#script_planet_" + i);

      if (i < biomeList.length) {
        tableElement.append(
          buildTableLabel(game.loc("biome_" + biomeList[i] + "_name")),
        );
        tableElement = tableElement.next();
        addTableInput(tableElement, "biome_w_" + biomeList[i]);
      } else {
        tableElement = tableElement.next();
      }
      tableElement = tableElement.next();

      if (i < traitList.length) {
        tableElement.append(
          buildTableLabel(i == 0 ? "None" : game.loc("planet_" + traitList[i])),
        );
        tableElement = tableElement.next();
        addTableInput(tableElement, "trait_w_" + traitList[i]);
      } else {
        tableElement = tableElement.next();
      }
      tableElement = tableElement.next();

      if (i < extraList.length) {
        tableElement.append(buildTableLabel(extraList[i]));
        tableElement = tableElement.next();
        addTableInput(tableElement, "extra_w_" + extraList[i]);
      }
    }

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildPlanetSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildPlanetSettings") ?? buildPlanetSettingsImpl;
    return implementation.apply(this, args);
  }

  function updatePlanetSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updatePlanetSettingsContent") ??
      updatePlanetSettingsContentImpl;
    return implementation.apply(this, args);
  }

  return { buildPlanetSettings, updatePlanetSettingsContent };
}
