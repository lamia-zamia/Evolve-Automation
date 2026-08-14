import { createGameFeatureVisibility } from "../adapters/browser/game-feature-visibility.ts";
import { createGameModal } from "../adapters/browser/game-modal.ts";
import { createSettingsStore } from "../adapters/storage/settings-store.ts";

type SettingsStorage = Parameters<typeof createSettingsStore>[0];
type MutationObserverProvider = Parameters<
  typeof createGameModal
>[0]["getMutationObserver"];

export interface RuntimeFoundationsControlDependencies {
  getDocument: () => Document;
  getMutationObserver: MutationObserverProvider;
  storage: SettingsStorage;
}

export function createRuntimeFoundationsControl({
  getDocument,
  getMutationObserver,
  storage,
}: RuntimeFoundationsControlDependencies) {
  const gameModal = createGameModal({ getDocument, getMutationObserver });
  const featureVisibility = createGameFeatureVisibility({ getDocument });
  const settingsStore = createSettingsStore(storage);
  return {
    gameModal,
    featureVisibility,
    settingsStore,
    settingsRaw: settingsStore.load(),
  };
}
