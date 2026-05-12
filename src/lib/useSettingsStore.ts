type SettingsState = {
  vibrateEnabled: boolean;
};

const settingsState: SettingsState = {
  vibrateEnabled: true,
};

export function useSettingsStore<T>(selector: (state: SettingsState) => T): T {
  return selector(settingsState);
}
