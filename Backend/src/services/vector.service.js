const { Pinecone } = require('@pinecone-database/pinecone');

const pineconeApiKey = process.env.PINECONE_API_KEY;
const pineconeIndexName = process.env.PINECONE_INDEX_NAME || 'cohort-chat-gpt';

let pineconeReady = Boolean(pineconeApiKey);
let pineconeWarningLogged = false;

const pc = pineconeReady
  ? new Pinecone({
      apiKey: pineconeApiKey
    })
  : null;

const cohortChatGptIndex = pc ? pc.Index(pineconeIndexName) : null;

function logVectorFallback(reason) {
  if (pineconeWarningLogged) {
    return;
  }

  pineconeWarningLogged = true;
  console.warn('Pinecone vector memory disabled:', reason);
}

async function createMemory({vectors, metadata, messageId}){
    if (!cohortChatGptIndex || !vectors || !messageId) {
        if (!cohortChatGptIndex) {
            logVectorFallback('missing API key or client not configured');
        }
        return null;
    }

    try {
        await cohortChatGptIndex.upsert([{
            id: messageId,
            values: vectors,
            metadata: metadata
        }]);
        return true;
    } catch (error) {
        pineconeReady = false;
        logVectorFallback(error?.message || 'upsert failed');
        return null;
    }
}

async function queryMemory({queryVector, limit = 5, metadata }){
    if (!cohortChatGptIndex || !queryVector) {
        if (!cohortChatGptIndex) {
            logVectorFallback('missing API key or client not configured');
        }
        return [];
    }

    try {
        const data = await cohortChatGptIndex.query({
            vector: queryVector,
            topK: limit,
            filter: metadata ? metadata : undefined,
            includeMetadata: true
        });

        return data.matches || [];
    } catch (error) {
        pineconeReady = false;
        logVectorFallback(error?.message || 'query failed');
        return [];
    }
}

module.exports = {createMemory, queryMemory}