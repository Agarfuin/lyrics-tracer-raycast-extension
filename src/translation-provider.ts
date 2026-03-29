import { EnglishTranslation, TranslationProvider } from "./types";

type TranslationPreferences = {
  translationContactEmail?: string;
};

type MyMemoryTranslationResponse = {
  responseData?: {
    translatedText?: string;
    detectedLanguage?: string;
    match?: number;
  };
  responseDetails?: string;
  responseStatus?: number;
  quotaFinished?: boolean;
};

const MYMEMORY_TRANSLATE_URL = "https://api.mymemory.translated.net/get";
const MYMEMORY_PROVIDER: TranslationProvider = "mymemory";

function getMyMemoryErrorMessage(payload: MyMemoryTranslationResponse) {
  if (payload.quotaFinished) {
    return "MyMemory daily translation quota reached. Add a contact email in preferences or try again tomorrow.";
  }

  if (typeof payload.responseDetails === "string" && payload.responseDetails.trim().length > 0) {
    return payload.responseDetails;
  }

  return "MyMemory could not translate this line.";
}

export async function translateLineToEnglish(
  text: string,
  preferences: TranslationPreferences,
): Promise<EnglishTranslation> {
  const normalizedText = text.trim();
  if (!normalizedText) {
    throw new Error("Nothing to translate.");
  }

  if (new TextEncoder().encode(normalizedText).length > 500) {
    throw new Error("This line is too long for MyMemory's free translation endpoint.");
  }

  const query = new URLSearchParams({
    langpair: "autodetect|en",
    mt: "1",
    q: normalizedText,
  });

  const contactEmail = preferences.translationContactEmail?.trim();
  if (contactEmail) {
    query.set("de", contactEmail);
  }

  const response = await fetch(`${MYMEMORY_TRANSLATE_URL}?${query.toString()}`);

  if (!response.ok) {
    throw new Error(`Translation failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as MyMemoryTranslationResponse;
  if ((payload.responseStatus ?? 200) !== 200 || payload.quotaFinished) {
    throw new Error(getMyMemoryErrorMessage(payload));
  }

  const translatedText = payload.responseData?.translatedText?.trim();

  if (!translatedText) {
    throw new Error(getMyMemoryErrorMessage(payload));
  }

  return {
    text: translatedText,
    detectedSourceLanguage: payload.responseData?.detectedLanguage?.trim(),
    provider: MYMEMORY_PROVIDER,
  };
}
