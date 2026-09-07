import React, { useState, useRef, useEffect } from 'react'

const Container = () => {
  const [messages, setMessages] = useState([
    { id: 1, sender: 'assistant', text: 'I am your Personal Assistant. How can I help you today?' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);

  const [userId] = Date.now().toString(36) + Math.random().toString(36).substring(2, 8)

  const [loading, setLoading] = useState(false);


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || loading) return;

    // Append user message
    const userMsg = { id: Date.now(), sender: 'user', text: trimmedInput };
    setMessages(prev => [
      ...prev,
      userMsg
    ]);
    setInputValue('');
    setLoading(true);

    // Append temporary typing/waiting message or call server immediately
    try {
      const ans = await callToServer(trimmedInput);
      console.log("Answer from server: ", ans);
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, sender: 'assistant', text: ans }
      ]);
    } catch (error) {
      console.error("Error in handleSend: ", error);
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, sender: 'assistant', text: "Sorry, I encountered an error. Please try again." }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!loading) {
        handleSend();
      }
    }
  };

  // send to the server 
  const callToServer = async (messageText) => {
    try {
      const response = await fetch("http://localhost:3000/chat", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId: userId, message: messageText })
      });

      if (!response.ok) {
        console.error("Error in calling the server, status code: ", response.status);
        return "Sorry, there was an error processing your request on the server.";
      }
      const data = await response.json();
      return data.message;
    } catch (error) {
      console.error("Failed to connect to the server:", error);
      return "we are unable to process your request at the moment. Please try again later.";
    }
  };
  return (
    <div className="container mx-auto max-w-3xl min-h-screen flex flex-col justify-between pb-36 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 py-6 border-b border-neutral-800 sticky top-0 bg-neutral-900/90 backdrop-blur-md z-10">
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-lg shadow-md shadow-indigo-500/20">

          </div>
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-neutral-900 rounded-full"></span>
        </div>
        <div>
          <h2 className="font-semibold text-white tracking-wide">Testrix AI</h2>
          <p className="text-xs text-neutral-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Online & Ready
          </p>
        </div>
      </div>

      {/* Messages Section */}
      <div className="flex-1 overflow-y-auto py-6 space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] px-2 py-1 rounded-2xl shadow-md transition-all duration-200 ${msg.sender === 'user'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-tr-none shadow-indigo-600/10'
                : 'bg-neutral-800/80 text-neutral-100 rounded-tl-none border border-neutral-700/50'
                }`}
            >
              <p className="leading-relaxed text-sm md:text-base whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-neutral-800/80 text-neutral-400 px-4 py-3 rounded-2xl rounded-tl-none border border-neutral-700/50 flex items-center gap-1.5 shadow-md">
              <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom text area */}
      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-neutral-900 via-neutral-900/95 to-transparent pt-10 pb-6 flex justify-center px-4">
        <div className="bg-neutral-800/90 border border-neutral-700/50 p-2 rounded-2xl w-full max-w-3xl flex flex-col gap-2 shadow-2xl backdrop-blur-md">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            className="w-full text-white px-3 py-2 outline-none resize-none bg-transparent placeholder-neutral-500 text-sm md:text-base min-h-[44px] max-h-[160px] leading-relaxed disabled:opacity-50"
            placeholder={loading ? "Neeraj AI is thinking..." : "Type your message here..."}
            rows={1}
          />
          <div className="flex justify-end items-center px-2 pt-1 border-t border-neutral-700/30">
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || loading}
              className={`px-5 py-1.5 text-sm font-semibold rounded-xl cursor-pointer transition-all duration-200 ${inputValue.trim() && !loading
                ? 'bg-white text-black hover:bg-neutral-200 hover:scale-105 active:scale-95'
                : 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
                }`}
            >
              {loading ? 'Thinking...' : 'Ask'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Container