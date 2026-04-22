const { GoogleGenAI } = require("@google/genai");
const geminiApiKey =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!geminiApiKey) {
  throw new Error(
    "Missing Gemini API key. Set GEMINI_API_KEY (or GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY) in your environment."
  );
}

const ai = new GoogleGenAI({ apiKey: geminiApiKey });
const GEMINI_MODELS = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || 'gemini-2.5-flash,gemini-2.0-flash,gemini-pro-latest')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';

function normalizeAiError(error) {
  const status = error?.status || error?.code;
  const message = error?.message || 'Gemini API request failed';
  const retryDelayMatch = message.match(/(?:Please\s+)?retry\s+in\s+([\d.]+)s/i);

  return {
    status,
    message,
    retryAfterSeconds: retryDelayMatch ? Math.ceil(Number(retryDelayMatch[1])) : null
  };
}

function wrapAiError(error) {
  const normalized = normalizeAiError(error);
  const wrappedError = new Error(normalized.message);
  wrappedError.status = normalized.status;
  wrappedError.retryAfterSeconds = normalized.retryAfterSeconds;
  wrappedError.isQuotaError = Number(normalized.status) === 429;
  return wrappedError;
}

function isModelFallbackCandidate(error) {
  const status = Number(error?.status);
  const message = String(error?.message || '');
  return (
    status === 429 ||
    status === 404 ||
    /not found|not supported|unavailable/i.test(message)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateResponse(content) {
  let lastError = null;

  for (const model of GEMINI_MODELS) {
    const modelCandidates = model.startsWith('models/')
      ? [model]
      : [model, `models/${model}`];

    for (const modelName of modelCandidates) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: content,
      });

      if (!response?.text) {
        throw new Error('Gemini returned an empty response');
      }

      return response.text;
    } catch (error) {
      const wrappedError = wrapAiError(error);

      // Retry once for short quota windows before failing over models.
      if (wrappedError.isQuotaError && wrappedError.retryAfterSeconds && wrappedError.retryAfterSeconds <= 8) {
        await sleep(wrappedError.retryAfterSeconds * 1000);
        try {
          const retryResponse = await ai.models.generateContent({
            model: modelName,
            contents: content,
          });

          if (retryResponse?.text) {
            return retryResponse.text;
          }
        } catch (retryError) {
          lastError = wrapAiError(retryError);
          if (!isModelFallbackCandidate(lastError)) {
            throw lastError;
          }
          continue;
        }
      }

      lastError = wrappedError;
      if (!isModelFallbackCandidate(wrappedError)) {
        throw wrappedError;
      }
    }
    }
  }

  throw lastError || new Error('Gemini API request failed');
}

async function generateVector(content){
  try {
    const response = await ai.models.embedContent({
       model: GEMINI_EMBEDDING_MODEL,
       contents: content,
       config: {
        outputDimensionality: 768
       }
    })
    return response.embeddings[0].values;
  } catch (error) {
    throw wrapAiError(error);
  }
}

module.exports = {
  generateResponse,
  generateVector
};