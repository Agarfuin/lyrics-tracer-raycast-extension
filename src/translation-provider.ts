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

/**
 * Outcome of a single line translation.
 *
 * "already-english" is its own case because MyMemory rejects a request whose detected source
 * language equals the target, which is exactly how an English line reports itself.
 */
export type TranslationOutcome =
  | { status: "translated"; translation: EnglishTranslation }
  | { status: "already-english" }
  | { status: "failed"; message: string; quotaExceeded: boolean };

const MYMEMORY_TRANSLATE_URL = "https://api.mymemory.translated.net/get";
const MYMEMORY_PROVIDER: TranslationProvider = "mymemory";
const MYMEMORY_MAX_BYTES = 500;
const SAME_LANGUAGE_MARKER = "SELECT TWO DISTINCT LANGUAGES";
const QUOTA_MESSAGE =
  "MyMemory daily translation quota reached. Add a contact email in preferences or try again tomorrow.";

function isSameLanguageRejection(payload: MyMemoryTranslationResponse) {
  return (payload.responseDetails ?? "").toUpperCase().includes(SAME_LANGUAGE_MARKER);
}

function getMyMemoryErrorMessage(payload: MyMemoryTranslationResponse) {
  if (payload.quotaFinished) {
    return QUOTA_MESSAGE;
  }

  if (typeof payload.responseDetails === "string" && payload.responseDetails.trim().length > 0) {
    return payload.responseDetails;
  }

  return "MyMemory could not translate this line.";
}

export async function translateLine(text: string, preferences: TranslationPreferences): Promise<TranslationOutcome> {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return { status: "failed", message: "Nothing to translate.", quotaExceeded: false };
  }

  if (new TextEncoder().encode(normalizedText).length > MYMEMORY_MAX_BYTES) {
    return {
      status: "failed",
      message: "This line is too long for MyMemory's free translation endpoint.",
      quotaExceeded: false,
    };
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

  let payload: MyMemoryTranslationResponse;

  try {
    const response = await fetch(`${MYMEMORY_TRANSLATE_URL}?${query.toString()}`);
    payload = (await response.json()) as MyMemoryTranslationResponse;
  } catch {
    return { status: "failed", message: "Could not reach the translation service.", quotaExceeded: false };
  }

  if (isSameLanguageRejection(payload)) {
    return { status: "already-english" };
  }

  if (payload.quotaFinished) {
    return { status: "failed", message: QUOTA_MESSAGE, quotaExceeded: true };
  }

  const translatedText = payload.responseData?.translatedText?.trim();
  if ((payload.responseStatus ?? 200) !== 200 || !translatedText) {
    return { status: "failed", message: getMyMemoryErrorMessage(payload), quotaExceeded: false };
  }

  return {
    status: "translated",
    translation: {
      text: translatedText,
      detectedSourceLanguage: payload.responseData?.detectedLanguage?.trim(),
      provider: MYMEMORY_PROVIDER,
    },
  };
}

/**
 * Throwing wrapper kept for the single-line copy action, which wants an error to surface.
 */
export async function translateLineToEnglish(
  text: string,
  preferences: TranslationPreferences,
): Promise<EnglishTranslation> {
  const outcome = await translateLine(text, preferences);

  if (outcome.status === "translated") {
    return outcome.translation;
  }

  if (outcome.status === "already-english") {
    return { text: text.trim(), detectedSourceLanguage: "en", provider: MYMEMORY_PROVIDER };
  }

  throw new Error(outcome.message);
}
