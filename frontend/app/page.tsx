"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from 'react-markdown';

export default function Home() {
    const [messages, setMessages] = useState<{ role: 'user' | 'agent', content: string }[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [fileStatus, setFileStatus] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append("file", file);

        setFileStatus("Uploading...");
        try {
            const res = await fetch("http://localhost:8000/api/upload", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            if (res.ok && !data.error) {
                setFileStatus(`Uploaded ${data.filename} (${data.chunks} chunks indexed)`);
            } else {
                setFileStatus(`Upload failed: ${data.error || 'Unknown error'}`);
            }
        } catch (error) {
            setFileStatus("Upload error.");
        }
    };

    const handleSend = async () => {
        if (!input.trim()) return;
        const userMsg = input.trim();
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setInput("");
        setIsLoading(true);

        // Add a placeholder for the streaming response
        setMessages(prev => [...prev, { role: 'agent', content: "" }]);

        try {
            const res = await fetch("http://localhost:8000/api/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMsg }),
            });
            
            setIsLoading(false); // Stop loading animation since we start receiving
            
            if (!res.body) throw new Error("No response body");
            
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                setMessages(prev => {
                    const newMessages = [...prev];
                    const lastIndex = newMessages.length - 1;
                    const lastMessage = { ...newMessages[lastIndex] };
                    if (lastMessage.role === 'agent') {
                        lastMessage.content += chunk;
                        newMessages[lastIndex] = lastMessage;
                    }
                    return newMessages;
                });
            }
        } catch (error) {
            setIsLoading(false);
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage.role === 'agent' && lastMessage.content === "") {
                    lastMessage.content = "Error connecting to server. Make sure the FastAPI backend is running.";
                }
                return newMessages;
            });
        }
    };

    return (
        <main className="flex h-screen bg-[#0d1117] text-gray-200 font-sans">
            {/* Sidebar */}
            <aside className="w-80 bg-[#161b22] border-r border-[#30363d] flex flex-col p-6 shadow-2xl z-10">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-8 tracking-wide">
                    Orbit Agent
                </h1>
                
                <div className="flex flex-col gap-4">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Knowledge Base</h2>
                    
                    <label className="flex items-center justify-center p-4 border-2 border-dashed border-[#30363d] rounded-xl cursor-pointer hover:border-blue-500 hover:bg-[#1f242c] transition-all duration-300 group">
                        <div className="text-center">
                            <svg className="w-8 h-8 mx-auto text-gray-500 group-hover:text-blue-400 transition-colors mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                            <span className="text-sm font-medium text-gray-400 group-hover:text-gray-200 transition-colors">Upload PDF</span>
                        </div>
                        <input type="file" className="hidden" accept=".pdf" onChange={handleUpload} />
                    </label>
                    {fileStatus && (
                        <div className="text-xs text-blue-400 p-3 bg-[#1c2128] rounded-lg border border-blue-900/50 flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                            {fileStatus}
                        </div>
                    )}
                </div>

                <div className="mt-auto">
                    <p className="text-xs text-gray-500">System v1.0.0 (Multi-Agent RAG)</p>
                </div>
            </aside>

            {/* Chat Area */}
            <section className="flex-1 flex flex-col relative">
                {/* Background Pattern */}
                <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-8 space-y-6 z-10 scroll-smooth">
                    {messages.length === 0 && (
                        <div className="flex h-full items-center justify-center flex-col text-gray-500 space-y-4 opacity-50">
                            <svg className="w-16 h-16 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                            <p className="text-lg font-light tracking-wider">How can I assist you today?</p>
                        </div>
                    )}
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-300`}>
                            <div className={`max-w-[75%] p-5 rounded-2xl shadow-lg leading-relaxed ${
                                msg.role === 'user' 
                                ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-tr-sm' 
                                : 'bg-[#161b22] border border-[#30363d] text-gray-200 rounded-tl-sm'
                            }`}>
                                <div className="prose prose-invert max-w-none">
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-[#161b22] border border-[#30363d] p-5 rounded-2xl rounded-tl-sm shadow-lg flex space-x-2">
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-6 bg-[#0d1117]/80 backdrop-blur-md border-t border-[#30363d] z-10">
                    <div className="max-w-4xl mx-auto relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
                        <div className="relative flex items-center gap-3 p-2 bg-[#161b22] border border-[#30363d] rounded-2xl shadow-xl">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder="Message the Agent..."
                                className="flex-1 bg-transparent text-gray-200 placeholder-gray-500 outline-none p-3 resize-none h-[52px] max-h-32 focus:ring-0 leading-relaxed"
                                rows={1}
                            />
                            <button 
                                onClick={handleSend}
                                disabled={isLoading || !input.trim()}
                                className="p-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-[#30363d] disabled:text-gray-500 transition-colors rounded-xl font-medium shadow-md group/btn"
                            >
                                <svg className="w-5 h-5 text-white group-disabled/btn:text-gray-500 transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
