"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from 'react-markdown';

type SubAgent = {
  name: string;
  instruction: string;
  status: 'pending' | 'running' | 'done' | 'error';
  content?: string;
};

type Message = {
    role: 'user' | 'agent';
    content: string; // The main text
    subAgents?: SubAgent[];
};

export default function Home() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [fileStatus, setFileStatus] = useState<string | null>(null);
    const [agentType, setAgentType] = useState<'research' | 'story' | 'summary'>('research');
    
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

        // Add a placeholder message for the agent
        setMessages(prev => [...prev, { role: 'agent', content: "", subAgents: [] }]);

        try {
            const res = await fetch("http://localhost:8000/api/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMsg, agent_type: agentType }),
            });
            
            setIsLoading(false);
            
            if (!res.body) throw new Error("No response body");
            
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                
                buffer = lines.pop() || "";
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.replace('data: ', '').trim();
                        if (!dataStr) continue;
                        
                        try {
                            const event = JSON.parse(dataStr);
                            
                            setMessages(prev => {
                                const newMessages = [...prev];
                                const lastIndex = newMessages.length - 1;
                                const lastMessage = { ...newMessages[lastIndex] };
                                if (!lastMessage.subAgents) lastMessage.subAgents = [];
                                
                                if (event.type === 'plan') {
                                    lastMessage.subAgents = event.agents.map((a: any) => ({
                                        name: a.name,
                                        instruction: a.instruction,
                                        status: 'pending'
                                    }));
                                } else if (event.type === 'agent_start') {
                                    if (lastMessage.subAgents) {
                                        lastMessage.subAgents = lastMessage.subAgents.map(a => 
                                            a.name === event.name ? { ...a, status: 'running' } : a
                                        );
                                    }
                                } else if (event.type === 'agent_result') {
                                    if (lastMessage.subAgents) {
                                        lastMessage.subAgents = lastMessage.subAgents.map(a => 
                                            a.name === event.name ? { ...a, status: 'done', content: event.content } : a
                                        );
                                    }
                                } else if (event.type === 'main_start') {
                                    // Main agent is about to stream
                                } else if (event.type === 'main_chunk') {
                                    lastMessage.content += event.content;
                                } else if (event.type === 'error') {
                                    lastMessage.content += `\n\n**Error:** ${event.content}`;
                                }
                                
                                newMessages[lastIndex] = lastMessage;
                                return newMessages;
                            });
                        } catch (e) {
                            console.error("Error parsing JSON:", e, "Raw:", dataStr);
                        }
                    }
                }
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

    const currentSubAgents = messages.length > 0 && messages[messages.length - 1].role === 'agent' 
        ? messages[messages.length - 1].subAgents 
        : [];

    return (
        <main className="flex h-screen bg-[#0d1117] text-gray-200 font-sans">
            {/* Sidebar extended to 28rem */}
            <aside className="w-[28rem] bg-[#161b22] border-r border-[#30363d] flex flex-col p-6 shadow-2xl z-20 overflow-hidden">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-6 tracking-wide flex-shrink-0">
                    Orbit Agent
                </h1>
                
                {/* Agent Mode Selector */}
                <div className="flex flex-col gap-2 mb-6">
                    <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Select Agent Mode</h2>
                    <div className="flex bg-[#0d1117] p-1 rounded-lg border border-[#30363d] shadow-inner">
                        <button 
                            onClick={() => setAgentType('research')} 
                            className={`flex-1 text-xs py-2 rounded-md font-semibold transition-all duration-200 ${agentType === 'research' ? 'bg-[#21262d] text-white shadow-md border-t border-[#30363d]' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            Researcher
                        </button>
                        <button 
                            onClick={() => setAgentType('story')} 
                            className={`flex-1 text-xs py-2 rounded-md font-semibold transition-all duration-200 ${agentType === 'story' ? 'bg-[#21262d] text-white shadow-md border-t border-[#30363d]' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            Story Teller
                        </button>
                        <button 
                            onClick={() => setAgentType('summary')} 
                            className={`flex-1 text-xs py-2 rounded-md font-semibold transition-all duration-200 ${agentType === 'summary' ? 'bg-[#21262d] text-white shadow-md border-t border-[#30363d]' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            Summarizer
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-4 mb-6">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Knowledge Base</h2>
                    <label className="flex items-center justify-center p-3 border border-dashed border-[#30363d] rounded-xl cursor-pointer hover:border-blue-500 hover:bg-[#1f242c] transition-all group">
                        <svg className="w-5 h-5 mr-3 text-gray-500 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                        <span className="text-xs font-medium text-gray-400 group-hover:text-gray-200 transition-colors">Upload Context PDF</span>
                        <input type="file" className="hidden" accept=".pdf" onChange={handleUpload} />
                    </label>
                    {fileStatus && (
                        <div className="text-[10px] text-blue-400 p-2 bg-[#1c2128] rounded-lg border border-blue-900/50 flex justify-center items-center gap-2">
                            {fileStatus}
                        </div>
                    )}
                </div>

                {/* Active Sub-Agents UI (only relevant in research mode really) */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-4">
                    <div className="flex justify-between items-center sticky top-0 bg-[#161b22] py-2 z-10 border-b border-[#30363d]">
                        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
                            Live Agent Activity
                        </h2>
                    </div>
                    
                    {(!currentSubAgents || currentSubAgents.length === 0) ? (
                        <div className="text-sm text-gray-500 italic p-4 text-center border border-dashed border-[#30363d] rounded-xl mt-2 bg-[#0d1117]/30">
                            {agentType === 'research' ? 'Waiting for query...' : `Sub-agents disabled in ${agentType === 'story' ? 'Story' : 'Summary'} mode.`}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4 mt-2">
                            {currentSubAgents.map((agent, agentIdx) => (
                                <div key={agentIdx} className={`rounded-xl border transition-all duration-300 overflow-hidden flex flex-col ${
                                    agent.status === 'running' ? 'bg-[#1c2128] border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 
                                    agent.status === 'done' ? 'bg-[#161b22] border-green-500/30' : 
                                    'bg-[#0d1117] border-[#30363d] opacity-50'
                                }`}>
                                    {/* Header */}
                                    <div className={`p-4 flex items-center gap-3 border-b ${agent.status === 'running' ? 'border-blue-900/30' : 'border-[#30363d]/50'}`}>
                                        {agent.status === 'running' && (
                                            <div className="flex space-x-1">
                                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                                            </div>
                                        )}
                                        {agent.status === 'done' && (
                                            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                        )}
                                        {agent.status === 'pending' && (
                                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                        )}
                                        <span className={`font-semibold text-sm truncate ${agent.status === 'running' ? 'text-blue-300' : 'text-gray-300'}`}>
                                            {agent.name}
                                        </span>
                                    </div>
                                    
                                    {/* Task Instruction */}
                                    <div className="p-4 bg-[#0d1117]/50">
                                        <div className="text-[10px] uppercase font-bold text-gray-500 mb-1">Assigned Task</div>
                                        <div className="text-xs text-gray-300 leading-relaxed font-medium">
                                            {agent.instruction}
                                        </div>
                                    </div>

                                    {/* Output */}
                                    {agent.status === 'done' && agent.content && (
                                        <div className="p-4 bg-[#0a0d12] border-t border-[#30363d]/50">
                                            <div className="text-[10px] uppercase font-bold text-green-500/80 mb-2">Research Output</div>
                                            <div className="text-xs text-gray-400 font-mono leading-relaxed max-h-48 overflow-y-auto custom-scrollbar break-words whitespace-pre-wrap">
                                                {agent.content}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="mt-4 flex-shrink-0 border-t border-[#30363d] pt-4">
                    <p className="text-xs text-gray-500 text-center">Orbit System v4.0.0 (Multi-Mode)</p>
                </div>
            </aside>

            {/* Chat Area */}
            <section className="flex-1 flex flex-col relative min-w-0">
                <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6 z-10 scroll-smooth custom-scrollbar">
                    {messages.length === 0 && (
                        <div className="flex h-full items-center justify-center flex-col text-gray-500 space-y-4 opacity-50">
                            <svg className="w-16 h-16 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                            <p className="text-lg font-light tracking-wider">How can I assist you today?</p>
                        </div>
                    )}
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in duration-300 w-full`}>
                            {msg.role === 'user' && (
                                <div className="max-w-[75%] p-5 rounded-2xl shadow-lg leading-relaxed bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-tr-sm">
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                </div>
                            )}

                            {msg.role === 'agent' && (
                                <div className="w-full max-w-4xl space-y-4">
                                    {/* Main Agent Response */}
                                    <div className="p-5 rounded-2xl shadow-lg leading-relaxed bg-[#161b22] border border-[#30363d] text-gray-200 rounded-tl-sm min-h-[60px]">
                                        {msg.content === "" && (!msg.subAgents || msg.subAgents.every(a => a.status === 'pending') || msg.subAgents.some(a => a.status === 'running')) ? (
                                            <div className="flex items-center space-x-3 text-gray-500">
                                                <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                <span className="text-sm animate-pulse">
                                                    {agentType === 'story' 
                                                        ? "Orbit Storyteller is crafting a tale..." 
                                                        : agentType === 'summary' 
                                                        ? "Orbit Summarizer is reading..." 
                                                        : "Orbit Main Agent is actively organizing sub-agents (see left panel for detailed metrics)..."}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="prose prose-invert max-w-none prose-sm md:prose-base">
                                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
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

                <div className="p-6 bg-[#0d1117]/80 backdrop-blur-md border-t border-[#30363d] z-10 w-full">
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
                                placeholder={`Input text for ${agentType === 'story' ? 'the Storyteller...' : agentType === 'summary' ? 'the Summarizer...' : 'the Researcher...'}`}
                                className="flex-1 bg-transparent text-gray-200 placeholder-gray-500 outline-none p-3 resize-none h-[52px] max-h-32 focus:ring-0 leading-relaxed custom-scrollbar"
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
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: #30363d;
                    border-radius: 10px;
                }
            `}</style>
        </main>
    );
}
