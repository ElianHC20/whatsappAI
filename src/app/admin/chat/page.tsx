"use client";
import { useState, useEffect, useRef } from "react";

export default function LiveChat() {
  const BOT_ID = "+12056275972"; 

  const [chats, setChats] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const loadChatsList = async () => {
    try {
        const res = await fetch(`/api/admin/chat?botId=${encodeURIComponent(BOT_ID)}`, { cache: 'no-store' });
        const data = await res.json();
        if (Array.isArray(data)) setChats(data);
    } catch (e) { console.error(e); }
  };

  const refreshActiveChatMessages = async (currentChatId?: string) => {
    const idToFetch = currentChatId || selectedChat?.id;
    if (!idToFetch) return;
    try {
        const res = await fetch(`/api/admin/chat?botId=${encodeURIComponent(BOT_ID)}&chatId=${encodeURIComponent(idToFetch)}`, { cache: 'no-store' });
        const data = await res.json();
        setMessages(data.messages || []);
    } catch (e) { console.error(e); }
  };

  const handleSelectChat = (chat: any) => {
    setSelectedChat(chat);
    setMessages([]);
    refreshActiveChatMessages(chat.id);
    setTimeout(scrollToBottom, 200);
  };

  const sendMessage = async (e: any) => {
    e.preventDefault();
    if(!inputText.trim()) return;
    const tempMsg = { role: 'assistant', content: inputText, esHumano: true, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, tempMsg]); 
    const textoEnviar = inputText;
    setInputText("");
    await fetch('/api/admin/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ botId: BOT_ID, chatId: selectedChat.id, mensaje: textoEnviar })
    });
    refreshActiveChatMessages();
  };

  const toggleModo = async (accion: 'silenciar' | 'reactivar') => {
      const nuevoEstadoHumano = accion === 'silenciar';
      setSelectedChat((prev: any) => ({ ...prev, modo_humano: nuevoEstadoHumano }));
      await fetch('/api/admin/chat', {
          method: 'POST',
          body: JSON.stringify({ botId: BOT_ID, chatId: selectedChat.id, accion: accion === 'silenciar' ? 'activar_humano' : 'reactivar_bot' })
      });
      loadChatsList(); 
  };

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };

  useEffect(() => {
    loadChatsList();
    const intervalList = setInterval(() => { loadChatsList(); }, 4000);
    const intervalMessages = setInterval(() => { if (selectedChat) refreshActiveChatMessages(); }, 2000);
    return () => { clearInterval(intervalList); clearInterval(intervalMessages); };
  }, [selectedChat]); 

  useEffect(() => { scrollToBottom(); }, [messages.length]);

  return (
    <div className="flex h-screen bg-gray-100 font-sans text-gray-800">
      <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 bg-indigo-900 text-white font-bold flex justify-between items-center shadow-md">
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                <span>Chats ({chats.length})</span>
            </div>
            <button onClick={loadChatsList} className="text-xs bg-indigo-700 px-2 py-1 rounded hover:bg-indigo-600 transition">↻</button>
        </div>
        <div className="flex-1 overflow-y-auto">
            {chats.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">Esperando clientes...</div>}
            {chats.map(chat => (
                <div key={chat.id} onClick={() => handleSelectChat(chat)}
                    className={`p-4 border-b cursor-pointer transition-all hover:bg-gray-50 ${selectedChat?.id === chat.id ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''}`}>
                    <div className="flex justify-between items-center">
                        <span className="font-bold text-gray-800 truncate max-w-[65%]">{chat.profileName || chat.id}</span>
                        {chat.modo_humano && <span className="text-[9px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full border border-yellow-300 font-bold">TU</span>}
                    </div>
                    <div className="flex justify-between items-center mt-1">
                        <p className="text-sm text-gray-500 truncate w-3/4">{chat.lastMsg || "..."}</p>
                        {chat.unread && <span className="h-2 w-2 bg-blue-500 rounded-full"></span>}
                    </div>
                </div>
            ))}
        </div>
      </div>
      <div className="w-2/3 flex flex-col bg-slate-50 relative">
        {selectedChat ? (
            <>
                <div className="p-4 bg-white/90 backdrop-blur-sm border-b shadow-sm flex justify-between items-center sticky top-0 z-10">
                    <div>
                        <h2 className="font-bold text-lg text-indigo-900">{selectedChat.profileName || selectedChat.id}</h2>
                        <p className="text-xs text-gray-400 font-mono">{selectedChat.id}</p>
                    </div>
                    <div>
                        {selectedChat.modo_humano ? (
                            <button onClick={() => toggleModo('reactivar')} className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-xs font-bold border border-green-300 hover:bg-green-200 transition-all shadow-sm">REACTIVAR BOT</button>
                        ) : (
                            <button onClick={() => toggleModo('silenciar')} className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-xs font-bold border border-red-200 hover:bg-red-100 transition-all shadow-sm">INTERVENIR</button>
                        )}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-[75%] p-3 rounded-2xl text-sm shadow-sm ${m.role === 'user' ? 'bg-white text-gray-800 border border-gray-200 rounded-tl-none' : (m.esHumano ? 'bg-yellow-100 border border-yellow-200 text-yellow-900 rounded-tr-none' : 'bg-indigo-600 text-white rounded-tr-none')}`}>
                                <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                                <div className={`text-[10px] mt-1 flex gap-2 opacity-50 ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                                    <span>{m.role === 'assistant' ? (m.esHumano ? 'Tu' : 'Bot') : 'Cliente'}</span>
                                    <span>{m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
                <form onSubmit={sendMessage} className="p-4 bg-white border-t flex gap-3 shadow-lg">
                    <input className="flex-1 border border-gray-300 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                        placeholder={selectedChat.modo_humano ? "Escribe tu respuesta..." : "El bot esta respondiendo. Escribe para intervenir."}
                        value={inputText} onChange={e => setInputText(e.target.value)} />
                    <button type="submit" className="bg-indigo-900 text-white px-6 rounded-xl font-bold hover:bg-indigo-800 shadow-md">Enviar</button>
                </form>
            </>
        ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-slate-100">
                <p className="font-medium">Selecciona un chat</p>
                <p className="text-sm opacity-60">Los mensajes se actualizan automaticamente</p>
            </div>
        )}
      </div>
    </div>
  );
}