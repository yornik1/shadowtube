import { create } from "zustand";
import {
  clearProxyUrlOverride,
  getGeminiKey,
  getGeminiModel,
  getProxyUrlOverride,
  setGeminiKey,
  setGeminiModel,
  setProxyUrlOverride,
} from "@/src/secure/keychain";
import { DEFAULT_MODEL, type GeminiModelInfo } from "@/src/api/gemini";

type SettingsState = {
  geminiKey: string | null;
  geminiModel: string;
  proxyUrlOverride: string | null;
  availableModels: GeminiModelInfo[];
  loaded: boolean;
  load: () => Promise<void>;
  saveKey: (key: string) => Promise<void>;
  saveModel: (model: string) => Promise<void>;
  saveProxyUrl: (url: string) => Promise<void>;
  clearProxyUrl: () => Promise<void>;
  setAvailableModels: (models: GeminiModelInfo[]) => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  geminiKey: null,
  geminiModel: DEFAULT_MODEL,
  proxyUrlOverride: null,
  availableModels: [],
  loaded: false,
  load: async () => {
    const [key, model, proxyUrlOverride] = await Promise.all([
      getGeminiKey(),
      getGeminiModel(),
      getProxyUrlOverride(),
    ]);
    set({
      geminiKey: key,
      geminiModel: model ?? DEFAULT_MODEL,
      proxyUrlOverride,
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
  saveProxyUrl: async (url: string) => {
    const trimmed = url.trim();
    await setProxyUrlOverride(trimmed);
    set({ proxyUrlOverride: trimmed });
  },
  clearProxyUrl: async () => {
    await clearProxyUrlOverride();
    set({ proxyUrlOverride: null });
  },
  setAvailableModels: (models) => set({ availableModels: models }),
}));
