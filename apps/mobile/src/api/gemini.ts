import type { TranslationResult } from "@shadowtube/shared";

const MODEL = "gemini-2.0-flash";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export async function translateWord(
  apiKey: string,
  word: string,
  context: string,
): Promise<TranslationResult> {
  const prompt = `You are an English tutor helping a Russian speaker.
Translate the word or short phrase "${word}" from English to Russian.
Use this sentence as context: "${context}"
Respond ONLY with valid JSON: {"translation":"...","partOfSpeech":"...","example":"..."}`;

  const url = `${BASE}/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Gemini error ${res.status}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("Empty Gemini response");

  const parsed = JSON.parse(raw) as TranslationResult;
  if (!parsed.translation) throw new Error("Invalid translation response");
  return parsed;
}

export async function testApiKey(apiKey: string): Promise<boolean> {
  try {
    await translateWord(apiKey, "hello", "Hello, how are you?");
    return true;
  } catch {
    return false;
  }
}
