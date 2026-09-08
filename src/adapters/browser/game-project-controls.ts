import type {
  GameProjectBuildRequest,
  GameProjectControlsPort,
} from "../../ports/game-project-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

export interface GameProjectControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;
}

export function createGameProjectControls({
  getVueById,
}: GameProjectControlsDependencies): GameProjectControlsPort {
  return Object.freeze({
    build({ elementId, projectId, steps }: GameProjectBuildRequest): boolean {
      const view = getVueById(elementId);
      if (!isRecord(view) || typeof view["build"] !== "function") {
        return false;
      }
      const buildProject = requireFunction(
        view["build"],
        `${elementId} Vue view.build`,
      );
      const purchase = () =>
        Reflect.apply(buildProject, view, [projectId, steps]);
      purchase();
      return true;
    },
  });
}
