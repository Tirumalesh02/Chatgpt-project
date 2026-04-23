import React, { useEffect, useState, useRef, useCallback } from 'react';
import '../styles/home-animations.css';
import { io } from "socket.io-client";
import ChatMobileBar from '../components/chat/ChatMobileBar.jsx';
import ChatSidebar from '../components/chat/ChatSidebar.jsx';
import ChatMessages from '../components/chat/ChatMessages.jsx';
import ChatComposer from '../components/chat/ChatComposer.jsx';
import ConnectionStatus from '../components/ConnectionStatus.jsx';
import { useDispatch, useSelector } from 'react-redux';
import { useAuth } from '../AuthContext.jsx';
import axios from 'axios';
import { startNewChat, selectChat, setInput, sendingStarted, sendingFinished, setChats, setMessagesForChat } from '../store/chatSlice.js';
import { getApiBaseUrl, getAuthConfig, getAuthToken } from '../config/api.js';

const API_BASE_URL = getApiBaseUrl();

const Home = () => {
  const dispatch = useDispatch();
  const chats = useSelector(state => state.chat.chats);
  const activeChatId = useSelector(state => state.chat.activeChatId);
  const input = useSelector(state => state.chat.input);
  const isSending = useSelector(state => state.chat.isSending);
  const { user } = useAuth();
  const [ sidebarOpen, setSidebarOpen ] = React.useState(false);
  const [ socket, setSocket ] = useState(null);
  const [ socketConnected, setSocketConnected ] = useState(false);

  const activeChat = chats.find(c => c._id === activeChatId) || null;
  const messages = activeChat?.messages || [];
  const activeChatIdRef = useRef(activeChatId);
  const chatsRef = useRef(chats);
  useEffect(()=>{ activeChatIdRef.current = activeChatId; }, [activeChatId]);
  useEffect(()=>{ chatsRef.current = chats; }, [chats]);

  const getMessages = useCallback(async (chatId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chat/${chatId}`, getAuthConfig());
      const mapped = (response.data.messages || []).map(m => ({ type: m.role === 'user' ? 'user' : 'ai', content: m.content }));
      dispatch(setMessagesForChat({ chatId, messages: mapped }));
    } catch (err) {
      console.warn("Failed to load messages for chat", chatId, err?.response?.status);
    }
  }, [dispatch]);

  const createChatWithTitle = useCallback(async (title) => {
    const response = await axios.post(`${API_BASE_URL}/api/chat`, { title }, getAuthConfig());
    const chat = response?.data?.chat;
    if (!chat?._id) {
      throw new Error('Chat creation failed');
    }
    dispatch(startNewChat(chat));
    return chat._id;
  }, [dispatch]);

  const handleNewChat = async () => {
    // Prompt user for title of new chat, fallback to 'New Chat'
    let title = window.prompt('Enter a title for the new chat:', '');
    if (title) title = title.trim();
    if (!title) return;

    const newChatId = await createChatWithTitle(title);
    await getMessages(newChatId);
    setSidebarOpen(false);
  };

  // Ensure at least one chat exists initially
  useEffect(() => {
  axios.get(`${API_BASE_URL}/api/chat`, getAuthConfig())
      .then(async (response) => {
        const list = response.data.chats || [];
        dispatch(setChats(list));
        if(list.length > 0 && !activeChatIdRef.current){
          const first = list[0];
          dispatch(selectChat(first._id));
          await getMessages(first._id);
        }
      })
      .catch((err)=>{
        console.warn("Failed to load chats", err?.response?.status, err?.response?.data);
      });

    const token = getAuthToken();

  const tempSocket = io(`${API_BASE_URL}/`, {
      withCredentials: true,
      auth: token ? { token: `Bearer ${token}` } : undefined,
    })

    tempSocket.on('connect', () => {
      console.log('Socket connected');
      setSocketConnected(true);
    });

    tempSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setSocketConnected(false);
    });

    tempSocket.on('connect_error', (error) => {
      console.warn('Socket connection failed', error?.message);
      dispatch(sendingFinished());
      setSocketConnected(false);
    });

    tempSocket.on("ai-response", (messagePayload) => {
      const targetChatId = messagePayload.chat || activeChatIdRef.current;
      if(!targetChatId) return;
      const currentChats = chatsRef.current || [];
      const target = currentChats.find(c => c._id === targetChatId);
      const currentMsgs = target?.messages || [];
      const updated = [ ...currentMsgs, { type: 'ai', content: messagePayload.content } ];
      dispatch(setMessagesForChat({ chatId: targetChatId, messages: updated }));
      dispatch(sendingFinished());
    });

    setSocket(tempSocket);

    return () => {
      tempSocket.disconnect();
    };

  }, [dispatch, getMessages]);

  const sendMessage = async () => {

    const trimmed = input.trim();
    console.log("Sending message:", trimmed);
    if (!trimmed || isSending) return;

    let targetChatId = activeChatId;

    if (!targetChatId) {
      try {
        const autoTitle = trimmed.slice(0, 40) || 'New Chat';
        targetChatId = await createChatWithTitle(autoTitle);
      } catch (error) {
        console.warn('Unable to create chat before send', error?.message);
        alert('Unable to create chat. Please login again and retry.');
        return;
      }
    }

    dispatch(sendingStarted());
  const base = (activeChat?.messages || []);
  const newMessages = [ ...base, { type: 'user', content: trimmed } ];
  dispatch(setMessagesForChat({ chatId: targetChatId, messages: newMessages }));
    dispatch(setInput(''));
    if (!socket) {
      dispatch(sendingFinished());
      return;
    }
    socket.emit("ai-message", { chat: targetChatId, content: trimmed });
  };

return (
  <div className="chat-layout minimal">
    <ConnectionStatus socketConnected={socketConnected} isAuthenticated={!!user} isSending={isSending} />
    <ChatMobileBar
      onToggleSidebar={() => setSidebarOpen(o => !o)}
      onNewChat={handleNewChat}
    />
    <ChatSidebar
      chats={chats}
      activeChatId={activeChatId}
      onSelectChat={(id) => {
        dispatch(selectChat(id));
        setSidebarOpen(false);
        getMessages(id);
      }}
      onNewChat={handleNewChat}
      open={sidebarOpen}
    />
    <main className="chat-main" role="main">
      {messages.length === 0 && (
        <div className="chat-welcome" aria-hidden="true">
          <div className="chip">Project Review Mode</div>
          <h1>MEM GPT</h1>
          <p>Ask a question, paste context, or request a quick explanation. Your chats are saved on the left so you can continue anytime.</p>
        </div>
      )}
      <ChatMessages messages={messages} isSending={isSending} />
      <ChatComposer
        input={input}
        setInput={(v) => dispatch(setInput(v))}
        onSend={sendMessage}
        isSending={isSending}
      />
    </main>
    {sidebarOpen && (
      <button
        className="sidebar-backdrop"
        aria-label="Close sidebar"
        onClick={() => setSidebarOpen(false)}
      />
    )}
  </div>
);
};

export default Home;
