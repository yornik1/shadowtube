import * as SecureStore from "expo-secure-store";

const GEMINI_KEY = "shadowtube_gemini_api_key";
const GEMINI_MODEL = "shadowtube_gemini_model";

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
