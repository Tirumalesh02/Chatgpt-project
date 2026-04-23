const {Server} = require('socket.io');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model');
const aiService = require("../services/ai.service");
const messageModel = require('../models/message.model');
const {createMemory, queryMemory} = require('../services/vector.service')

const ENABLE_VECTOR_MEMORY = process.env.ENABLE_VECTOR_MEMORY === 'true';
const SOCKET_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'https://chatgpt-project-0vpi.onrender.com'
];

function normalizeToken(rawToken) {
    if (!rawToken) return null;
    if (rawToken.startsWith('Bearer ')) return rawToken.slice(7);
    return rawToken;
}

function extractSocketToken(socket) {
    const cookies = cookie.parse(socket.handshake.headers?.cookie || '');
    if (cookies.token) return cookies.token;

    const authToken = normalizeToken(socket.handshake.auth?.token);
    if (authToken) return authToken;

    const authHeader = normalizeToken(socket.handshake.headers?.authorization);
    if (authHeader) return authHeader;

    const xAuthToken = normalizeToken(socket.handshake.headers?.['x-auth-token']);
    if (xAuthToken) return xAuthToken;

    const legacyAuthToken = normalizeToken(socket.handshake.headers?.['auth-token']);
    if (legacyAuthToken) return legacyAuthToken;

    return null;
}

function initSocketServer(httpServer){
    let vectorBackoffUntil = 0;

    function buildLocalReply(userText) {
        const trimmed = String(userText || '').trim();
        const normalized = trimmed.toLowerCase();

        if (!trimmed) {
            return 'I am ready. Send me your question and I will help right away.';
        }

        if (/^(hi|hello|hey|hii|yo)\b/.test(normalized)) {
            return 'Hello. I can help with your project review, debugging, explanations, or quick answers.';
        }

        if (/(quota|error|issue|problem|bug|not working|failed)/.test(normalized)) {
            return 'I can still help. Share the part that is failing, and I will guide you through the fix.';
        }

        const preview = trimmed.length > 180 ? `${trimmed.slice(0, 180)}...` : trimmed;

        return [
            'Here is a concise reply based on your message.',
            preview ? `You said: "${preview}".` : 'I received your message.',
            'If you want, send a more specific question and I will keep it short and useful.'
        ].join(' ');
    }

    const io = new Server(httpServer, {
        cors: {
            origin: (origin, callback) => {
                if (!origin) return callback(null, true);
                if (SOCKET_ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
                return callback(new Error(`Socket CORS not allowed: ${origin}`));
            },
            allowedHeaders: [ "Content-Type", "Authorization" ],
            credentials: true
        }
    })

    io.use(async(socket, next) =>{
        const token = extractSocketToken(socket);
        if(!token){
            return next(new Error('Authentication error'));
        }
        try{
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await userModel.findById(decoded.userId);
            if (!user) {
                return next(new Error('Authentication error'));
            }
            socket.user = user;
            next();

        }catch(err){
            next(new Error('Authentication error'))
        }
    })

    io.on('connection', (socket)=>{
        // console.log('New socket connection:', socket.id);
        // console.log('User info:', socket.user);

        async function safeGenerateVector(text) {
            if (!ENABLE_VECTOR_MEMORY) {
                return null;
            }

            if (Date.now() < vectorBackoffUntil) {
                return null;
            }

            try {
                return await aiService.generateVector(text);
            } catch (error) {
                console.warn('vector generation skipped:', {
                    status: error?.status,
                    message: error?.message
                });

                if (error?.isQuotaError) {
                    const retryAfterSeconds = Number(error?.retryAfterSeconds) || 60;
                    vectorBackoffUntil = Date.now() + retryAfterSeconds * 1000;
                }

                return null;
            }
        }

        socket.on('ai-message', async(messagePayload)=>{
            try {
                const message = await messageModel.create({
                    chat: messagePayload.chat,
                    user: socket.user._id,
                    content: messagePayload.content,
                    role: 'user'
                });

                const vectors = await safeGenerateVector(messagePayload.content);

                if (vectors) {
                    await createMemory({
                        vectors,
                        messageId: message._id,
                        metadata: {
                            chat: messagePayload.chat,
                            user: socket.user._id,
                            text: messagePayload.content
                        }

                    });
                }

                const chatHistory = await messageModel.find({
                    chat: messagePayload.chat
                }).sort({ createdAt: -1 }).limit(20).lean().then(messages => messages.reverse());

                const memory = vectors
                    ? await queryMemory({
                        queryVector: vectors,
                        limit: 3,
                        metadata: {
                            user: socket.user._id,
                        }
                    })
                    : [];

                const stm = chatHistory.map(item =>{
                    return {
                        role: item.role,
                        parts:[{text: item.content}]
                    }
                })

                const ltm = [
                    {
                        role: 'user',
                        parts: [{
                            text: `these are some previous messages from the chat, use them to generate a response
                            ${memory.map(item => item.metadata.text).join('\n')}
                    `}]
                    }
                ]


                const response = await aiService.generateResponse([...ltm, ...stm]);


                socket.emit('ai-response', {
                    content: response,
                    chat: messagePayload.chat
                });


                const responseMessage = await messageModel.create({
                    chat: messagePayload.chat,
                    user: socket.user._id,
                    content: response,
                    role: 'model'
                });

                const responseVectors = await safeGenerateVector(response);
                if (responseVectors) {
                    await createMemory({
                        vectors: responseVectors,
                        messageId: responseMessage._id,
                        metadata: {
                            chat: messagePayload.chat,
                            user: socket.user._id,
                            text: response
                        }
                    });
                }
            } catch (error) {
                console.error('ai-message failed:', {
                    status: error?.status,
                    retryAfterSeconds: error?.retryAfterSeconds,
                    message: error?.message
                });

                const fallbackMessage = buildLocalReply(messagePayload?.content);

                socket.emit('ai-response', {
                    content: fallbackMessage,
                    chat: messagePayload?.chat
                });

                try {
                    await messageModel.create({
                        chat: messagePayload.chat,
                        user: socket.user._id,
                        content: fallbackMessage,
                        role: 'model'
                    });
                } catch (persistError) {
                    console.warn('Failed to persist continuity fallback response:', persistError?.message);
                }
            }
        })
    })
}

module.exports = initSocketServer;