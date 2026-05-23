import { create } from "zustand";
import { getGeminiKey, setGeminiKey } from "@/src/secure/keychain";

type SettingsState = {
  geminiKey: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  saveKey: (key: string) => Promise<void>;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  geminiKey: null,
  loaded: false,
  load: async () => {
    const key = await getGeminiKey();
    set({ geminiKey: key, loaded: true });
  },
  saveKey: async (key: string) => {
    await setGeminiKey(key);
    set({ geminiKey: key });
  },
}));
