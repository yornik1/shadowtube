import { create } from "zustand";
import {
  clearProxyUrlOverride,
  getCardMode,
  getFlag,
  setFlag,
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
  /** Создавать карточки из фраз автоматически при открытии перевода. */
  autoCards: boolean;
  /** Прятать текст чанка до тапа — упражнение на слух вместо чтения вслух. */
  hideText: boolean;
  availableModels: GeminiModelInfo[];
  loaded: boolean;
  load: () => Promise<void>;
  saveKey: (key: string) => Promise<void>;
  saveModel: (model: string) => Promise<void>;
  saveProxyUrl: (url: string) => Promise<void>;
  clearProxyUrl: () => Promise<void>;
  saveCardMode: (mode: CardMode) => Promise<void>;
  saveAutoCards: (value: boolean) => Promise<void>;
  saveHideText: (value: boolean) => Promise<void>;
  setAvailableModels: (models: GeminiModelInfo[]) => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  geminiKey: null,
  geminiModel: DEFAULT_MODEL,
  proxyUrlOverride: null,
  cardMode: DEFAULT_CARD_MODE,
  // Автокарточки включены по умолчанию: смысл фичи в том, чтобы словарь
  // наполнялся сам, иначе она просто не сработает — руками добавлять лень.
  autoCards: true,
  hideText: false,
  availableModels: [],
  loaded: false,
  load: async () => {
    const [key, model, proxyUrlOverride, cardMode, autoCards, hideText] =
      await Promise.all([
        getGeminiKey(),
        getGeminiModel(),
        getProxyUrlOverride(),
        getCardMode(),
        getFlag("autoCards"),
        getFlag("hideText"),
      ]);
    set({
      geminiKey: key,
      geminiModel: model ?? DEFAULT_MODEL,
      proxyUrlOverride,
      cardMode: isCardMode(cardMode) ? cardMode : DEFAULT_CARD_MODE,
      autoCards: autoCards ?? true,
      hideText: hideText ?? false,
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
  saveAutoCards: async (value: boolean) => {
    await setFlag("autoCards", value);
    set({ autoCards: value });
  },
  saveHideText: async (value: boolean) => {
    await setFlag("hideText", value);
    set({ hideText: value });
  },
  setAvailableModels: (models) => set({ availableModels: models }),
}));
