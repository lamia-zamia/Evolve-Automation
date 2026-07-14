import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface ProjectSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createProjectSettings({
  getDependency,
  getOverride,
}: ProjectSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const ProjectManager = liveObject(() => getDependency("ProjectManager"));
  const addSettingsNumber = liveFunction(() =>
    getDependency("addSettingsNumber"),
  );
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const addTableInput = liveFunction(() => getDependency("addTableInput"));
  const addTableToggle = liveFunction(() => getDependency("addTableToggle"));
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const buildTableLabel = liveFunction(() => getDependency("buildTableLabel"));
  const document = liveObject(() => getDependency("document"));
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resetProjectSettings = liveFunction(() =>
    getDependency("resetProjectSettings"),
  );
  const settingsRaw = liveObject(() => getDependency("settingsRaw"));
  const sorterHelper = liveFunction(() => getDependency("sorterHelper"));
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildProjectSettingsImpl() {
    let sectionId = "project";
    let sectionName = "A.R.P.A.";

    let resetFunction = function () {
      resetProjectSettings(true);
      updateSettingsFromState();
      updateProjectSettingsContent();

      resetCheckbox("autoARPA");
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateProjectSettingsContent,
    );
  }

  function updateProjectSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_projectContent");
    currentNode.empty().off("*");

    addSettingsToggle(
      currentNode,
      "arpaScaleWeighting",
      "Scale weighting with progress",
      "Projects weighting scales  with current progress, making script more eager to spend resources on finishing nearly constructed projects.",
    );
    addSettingsNumber(
      currentNode,
      "arpaStep",
      "Preferred progress step",
      "Projects will be weighted and build in this steps. Increasing number can speed up constructing. Step will be adjusted down when preferred step above remaining amount, or surpass storage caps. Weightings below will be multiplied by current step. Projects builded by triggers will always have maximum possible step.",
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:25%">Project</th>
              <th class="has-text-warning" style="width:25%">Auto Build</th>
              <th class="has-text-warning" style="width:25%">Max Build</th>
              <th class="has-text-warning" style="width:25%">Weighting</th>
            </tr>
            <tbody id="script_projectTableBody"></tbody>
          </table>`);

    let tableBodyNode = $("#script_projectTableBody");
    let newTableBodyText = "";

    for (let i = 0; i < ProjectManager.priorityList.length; i++) {
      const project = ProjectManager.priorityList[i];
      newTableBodyText += `<tr value="${project.id}" class="script-draggable"><td id="script_${project.id}" style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other projects settings rows
    for (let i = 0; i < ProjectManager.priorityList.length; i++) {
      const project = ProjectManager.priorityList[i];
      let projectElement = $("#script_" + project.id);

      projectElement.append(buildTableLabel(project.name));

      projectElement = projectElement.next();
      addTableToggle(projectElement, "arpa_" + project.id);

      projectElement = projectElement.next();
      addTableInput(projectElement, "arpa_m_" + project.id);

      projectElement = projectElement.next();
      addTableInput(projectElement, "arpa_w_" + project.id);
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: sorterHelper,
      update: function () {
        let projectIds = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        for (let i = 0; i < projectIds.length; i++) {
          settingsRaw["arpa_p_" + projectIds[i]] = i;
        }

        ProjectManager.sortByPriority();
        updateSettingsFromState();
      },
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildProjectSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildProjectSettings") ?? buildProjectSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateProjectSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateProjectSettingsContent") ??
      updateProjectSettingsContentImpl;
    return implementation.apply(this, args);
  }

  return { buildProjectSettings, updateProjectSettingsContent };
}
