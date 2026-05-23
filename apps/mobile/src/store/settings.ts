import { create } from "zustand";
import { getGeminiKey, setGeminiKey, getGeminiModel, setGeminiModel } from "@/src/secure/keychain";
import { DEFAULT_MODEL, type GeminiModelInfo } from "@/src/api/gemini";

type SettingsState = {
  geminiKey: string | null;
  geminiModel: string;
  availableModels: GeminiModelInfo[];
  loaded: boolean;
  load: () => Promise<void>;
  saveKey: (key: string) => Promise<void>;
  saveModel: (model: string) => Promise<void>;
  setAvailableModels: (models: GeminiModelInfo[]) => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  geminiKey: null,
  geminiModel: DEFAULT_MODEL,
  availableModels: [],
  loaded: false,
  load: async () => {
    const [key, model] = await Promise.all([getGeminiKey(), getGeminiModel()]);
    set({
      geminiKey: key,
      geminiModel: model ?? DEFAULT_MODEL,
      loaded: true,
    });
  },
  saveKey: async (key: string) => {
    await setGeminiKey(key);
    set({ geminiKey: key, availableModels: [] });
  },
  saveModel: async (model: string) => {
    await setGeminiModel(model);
    set({ geminiModel: model });
  },
  setAvailableModels: (models) => set({ availableModels: models }),
}));
