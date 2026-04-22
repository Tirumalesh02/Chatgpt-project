const {Server} = require('socket.io');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model');
const aiService = require("../services/ai.service");
const messageModel = require('../models/message.model');
const {createMemory, queryMemory} = require('../services/vector.service')

const ENABLE_VECTOR_MEMORY = process.env.ENABLE_VECTOR_MEMORY === 'true';

function initSocketServer(httpServer){
    let vectorBackoffUntil = 0;

    function buildContinuityReply(userText) {
        const trimmed = String(userText || '').trim();
        const preview = trimmed.length > 220 ? `${trimmed.slice(0, 220)}...` : trimmed;

        return [
            "I could not reach the AI provider right now, so here is a quick fallback response.",
            preview ? `Your message was: \"${preview}\".` : "I received your message.",
            "Please try again in about a minute for a full AI-generated answer."
        ].join(' ');
    }

    const io = new Server(httpServer, {
        cors: {
            origin: "http://localhost:5173",
            allowedHeaders: [ "Content-Type", "Authorization" ],
            credentials: true
        }
    })

    io.use(async(socket, next) =>{
        const cookies = cookie.parse(socket.handshake.headers?.cookie || '');
        if(!cookies.token){
            return next(new Error('Authentication error'));
        }
        try{
            const decoded = jwt.verify(cookies.token, process.env.JWT_SECRET);
            const user = await userModel.findById(decoded.userId);
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

                const fallbackMessage = buildContinuityReply(messagePayload?.content);

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

                socket.emit('ai-error', {
                    status: error?.status || 500,
                    message: error?.message || 'AI provider request failed',
                    retryAfterSeconds: error?.retryAfterSeconds || null,
                    chat: messagePayload?.chat
                });
            }
        })
    })
}

module.exports = initSocketServer;