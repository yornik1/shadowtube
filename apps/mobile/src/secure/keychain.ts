import * as SecureStore from "expo-secure-store";

const GEMINI_KEY = "shadowtube_gemini_api_key";
const GEMINI_MODEL = "shadowtube_gemini_model";
const PROXY_URL_OVERRIDE = "shadowtube_proxy_url_override";
const CARD_MODE = "shadowtube_card_mode";

export async function getGeminiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(GEMINI_KEY);
}

export async function setGeminiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(GEMINI_KEY, key.trim());
}

export async function getGeminiModel(): Promise<string | null> {
  return SecureStore.getItemAsync(GEMINI_MODEL);
}

export async function setGeminiModel(model: string): Promise<void> {
  await SecureStore.setItemAsync(GEMINI_MODEL, model.trim());
}

export async function clearGeminiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(GEMINI_KEY);
}

export async function getProxyUrlOverride(): Promise<string | null> {
  return SecureStore.getItemAsync(PROXY_URL_OVERRIDE);
}

export async function setProxyUrlOverride(url: string): Promise<void> {
  await SecureStore.setItemAsync(PROXY_URL_OVERRIDE, url.trim());
}

export async function clearProxyUrlOverride(): Promise<void> {
  await SecureStore.deleteItemAsync(PROXY_URL_OVERRIDE);
}

export async function getCardMode(): Promise<string | null> {
  return SecureStore.getItemAsync(CARD_MODE);
}

export async function setCardMode(mode: string): Promise<void> {
  await SecureStore.setItemAsync(CARD_MODE, mode);
}
