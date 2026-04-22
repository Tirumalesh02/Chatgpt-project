const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

function normalizeAiError(error) {
  const status = error?.status || error?.code;
  const message = error?.message || 'Gemini API request failed';
  const retryDelayMatch = message.match(/Please retry in\s+([\d.]+)s/i);

  return {
    status,
    message,
    retryAfterSeconds: retryDelayMatch ? Math.ceil(Number(retryDelayMatch[1])) : null
  };
}

async function generateResponse(content) {
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: content,
    });
    return response.text;
  } catch (error) {
    const normalized = normalizeAiError(error);
    const wrappedError = new Error(normalized.message);
    wrappedError.status = normalized.status;
    wrappedError.retryAfterSeconds = normalized.retryAfterSeconds;
    wrappedError.isQuotaError = Number(normalized.status) === 429;
    throw wrappedError;
  }
}

async function generateVector(content){
  try {
    const response = await ai.models.embedContent({
       model: 'gemini-embedding-001',
       contents: content,
       config: {
        outputDimensionality: 768
       }
    })
    return response.embeddings[0].values;
  } catch (error) {
    const normalized = normalizeAiError(error);
    const wrappedError = new Error(normalized.message);
    wrappedError.status = normalized.status;
    wrappedError.retryAfterSeconds = normalized.retryAfterSeconds;
    wrappedError.isQuotaError = Number(normalized.status) === 429;
    throw wrappedError;
  }
}

module.exports = {
  generateResponse,
  generateVector
};