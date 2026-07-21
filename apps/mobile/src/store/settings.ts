import { create } from "zustand";
import {
  clearProxyUrlOverride,
  getCardMode,
  getGeminiKey,
  getGeminiModel,
  getProxyUrlOverride,
  setCardMode,
  setGeminiKey,
  setGeminiModel,
  setProxyUrlOverride,
} from "@/src/secure/keychain";
import { DEFAULT_MODEL, type GeminiModelInfo } from "@/src/api/gemini";
import {
  DEFAULT_CARD_MODE,
  isCardMode,
  type CardMode,
} from "@/src/srs/cardModes";

type SettingsState = {
  geminiKey: string | null;
  geminiModel: string;
  proxyUrlOverride: string | null;
  /** Как показывать карточки повторения. */
  cardMode: CardMode;
  availableModels: GeminiModelInfo[];
  loaded: boolean;
  load: () => Promise<void>;
  saveKey: (key: string) => Promise<void>;
  saveModel: (model: string) => Promise<void>;
  saveProxyUrl: (url: string) => Promise<void>;
  clearProxyUrl: () => Promise<void>;
  saveCardMode: (mode: CardMode) => Promise<void>;
  setAvailableModels: (models: GeminiModelInfo[]) => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  geminiKey: null,
  geminiModel: DEFAULT_MODEL,
  proxyUrlOverride: null,
  cardMode: DEFAULT_CARD_MODE,
  availableModels: [],
  loaded: false,
  load: async () => {
    const [key, model, proxyUrlOverride, cardMode] = await Promise.all([
      getGeminiKey(),
      getGeminiModel(),
      getProxyUrlOverride(),
      getCardMode(),
    ]);
    set({
      geminiKey: key,
      geminiModel: model ?? DEFAULT_MODEL,
      proxyUrlOverride,
      cardMode: isCardMode(cardMode) ? cardMode : DEFAULT_CARD_MODE,
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
  saveCardMode: async (mode: CardMode) => {
    await setCardMode(mode);
    set({ cardMode: mode });
  },
  setAvailableModels: (models) => set({ availableModels: models }),
}));
