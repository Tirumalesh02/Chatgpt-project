import React, { useEffect, useState, useRef, useCallback } from 'react';
import '../styles/home-animations.css';
import { io } from "socket.io-client";
import ChatMobileBar from '../components/chat/ChatMobileBar.jsx';
import ChatSidebar from '../components/chat/ChatSidebar.jsx';
import ChatMessages from '../components/chat/ChatMessages.jsx';
import ChatComposer from '../components/chat/ChatComposer.jsx';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { startNewChat, selectChat, setInput, sendingStarted, sendingFinished, setChats, setMessagesForChat } from '../store/chatSlice.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://chatgpt-project-0vpi.onrender.com';

function getAuthToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('auth.token') : null;
}

function authConfig() {
  const token = getAuthToken();
  return {
    withCredentials: true,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  };
}

const Home = () => {
  const dispatch = useDispatch();
  const chats = useSelector(state => state.chat.chats);
  const activeChatId = useSelector(state => state.chat.activeChatId);
  const input = useSelector(state => state.chat.input);
  const isSending = useSelector(state => state.chat.isSending);
  const [ sidebarOpen, setSidebarOpen ] = React.useState(false);
  const [ socket, setSocket ] = useState(null);

  const activeChat = chats.find(c => c._id === activeChatId) || null;
  const messages = activeChat?.messages || [];
  const activeChatIdRef = useRef(activeChatId);
  const chatsRef = useRef(chats);
  useEffect(()=>{ activeChatIdRef.current = activeChatId; }, [activeChatId]);
  useEffect(()=>{ chatsRef.current = chats; }, [chats]);

  const getMessages = useCallback(async (chatId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chat/${chatId}`, authConfig());
      const mapped = (response.data.messages || []).map(m => ({ type: m.role === 'user' ? 'user' : 'ai', content: m.content }));
      dispatch(setMessagesForChat({ chatId, messages: mapped }));
    } catch (err) {
      console.warn("Failed to load messages for chat", chatId, err?.response?.status);
    }
  }, [dispatch]);

  const handleNewChat = async () => {
    // Prompt user for title of new chat, fallback to 'New Chat'
    let title = window.prompt('Enter a title for the new chat:', '');
    if (title) title = title.trim();
    if (!title) return

  const response = await axios.post(`${API_BASE_URL}/api/chat`, { title }, authConfig());
    // Insert chat first so container exists before messages
    dispatch(startNewChat(response.data.chat));
    await getMessages(response.data.chat._id);
    setSidebarOpen(false);
  }

  // Ensure at least one chat exists initially
  useEffect(() => {
  axios.get(`${API_BASE_URL}/api/chat`, authConfig())
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

    tempSocket.on('connect_error', (error) => {
      console.warn('Socket connection failed', error?.message);
      dispatch(sendingFinished());
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
    if (!trimmed || !activeChatId || isSending) return;
    dispatch(sendingStarted());
  const base = (activeChat?.messages || []);
  const newMessages = [ ...base, { type: 'user', content: trimmed } ];
  dispatch(setMessagesForChat({ chatId: activeChatId, messages: newMessages }));
    dispatch(setInput(''));
    if (!socket) {
      dispatch(sendingFinished());
      return;
    }
    socket.emit("ai-message", { chat: activeChatId, content: trimmed });
  };

return (
  <div className="chat-layout minimal">
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
      {
        activeChatId &&
        <ChatComposer
          input={input}
          setInput={(v) => dispatch(setInput(v))}
          onSend={sendMessage}
          isSending={isSending}
        />}
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
