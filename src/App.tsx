import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  FileText, 
  MessageSquare, 
  Network, 
  BookOpen, 
  Send, 
  Loader2, 
  Plus,
  ChevronRight,
  Quote,
  History,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as d3 from 'd3';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Document {
  id: string;
  name: string;
  created_at: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function App() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'graph' | 'library'>('chat');
  const graphRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (activeTab === 'graph') {
      renderGraph();
    }
  }, [activeTab, documents]);

  const fetchDocuments = async () => {
    const res = await fetch('/api/documents');
    const data = await res.json();
    setDocuments(data);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', e.target.files[0]);

    try {
      await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      fetchDocuments();
    } catch (error) {
      console.error('Upload failed', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isChatting) return;
    const userMsg = { role: 'user' as const, content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsChatting(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
    } catch (error) {
      console.error('Chat failed', error);
    } finally {
      setIsChatting(false);
    }
  };

  const renderGraph = async () => {
    if (!graphRef.current) return;
    const res = await fetch('/api/graph');
    const data = await res.json();

    const width = 800;
    const height = 600;

    const svg = d3.select(graphRef.current);
    svg.selectAll("*").remove();

    const simulation = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.links).id((d: any) => d.id))
      .force("charge", d3.forceManyBody().strength(-100))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(data.links)
      .join("line");

    const node = svg.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(data.nodes)
      .join("circle")
      .attr("r", 8)
      .attr("fill", (d: any) => d.group === 1 ? "#4f46e5" : "#10b981")
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    node.append("title").text((d: any) => d.id);

    svg.append("g")
      .selectAll("text")
      .data(data.nodes)
      .join("text")
      .attr("dx", 12)
      .attr("dy", ".35em")
      .text((d: any) => d.id)
      .style("font-size", "10px")
      .style("fill", "#666");

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("cx", (d: any) => d.x)
        .attr("cy", (d: any) => d.y);

      svg.selectAll("text")
        .attr("x", (d: any) => d.x)
        .attr("y", (d: any) => d.y);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
  };

  return (
    <div className="flex h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-[#E5E7EB] flex flex-col">
        <div className="p-6 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
              <BookOpen size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">ScholarAI</h1>
              <span className="text-[10px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-wider">v4.1.0</span>
            </div>
          </div>
          
          <label className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer transition-all shadow-sm">
            {isUploading ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
            <span className="font-medium">New Research</span>
            <input type="file" className="hidden" onChange={handleUpload} accept=".pdf,.docx,.txt" />
          </label>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Library
          </div>
          {documents.map(doc => (
            <button 
              key={doc.id}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors group"
            >
              <FileText size={18} className="text-gray-400 group-hover:text-indigo-500" />
              <span className="truncate flex-1 text-left">{doc.name}</span>
              <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 text-gray-400" />
            </button>
          ))}
          {documents.length === 0 && (
            <div className="px-3 py-8 text-center">
              <p className="text-sm text-gray-400">No documents yet</p>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-[#E5E7EB]">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
              RR
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Research Account</p>
              <p className="text-xs text-gray-500 truncate">Pro Plan</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-16 bg-white border-b border-[#E5E7EB] flex items-center justify-between px-8">
          <div className="flex items-center gap-8">
            <button 
              onClick={() => setActiveTab('chat')}
              className={cn(
                "text-sm font-medium transition-colors relative py-5",
                activeTab === 'chat' ? "text-indigo-600" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Research Chat
              {activeTab === 'chat' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
            </button>
            <button 
              onClick={() => setActiveTab('graph')}
              className={cn(
                "text-sm font-medium transition-colors relative py-5",
                activeTab === 'graph' ? "text-indigo-600" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Knowledge Graph
              {activeTab === 'graph' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
            </button>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search research..." 
                className="pl-10 pr-4 py-2 bg-gray-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 w-64"
              />
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {activeTab === 'chat' && (
              <motion.div 
                key="chat"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full flex flex-col"
              >
                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                  {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                      <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                        <MessageSquare size={32} />
                      </div>
                      <h2 className="text-2xl font-bold mb-2">Deep Research Assistant</h2>
                      <p className="text-gray-500 mb-8">
                        Upload your papers and ask complex questions. I can synthesize information across your entire library.
                      </p>
                      <div className="grid grid-cols-2 gap-3 w-full">
                        <button onClick={() => setInput("Summarize the key findings of my latest paper")} className="p-3 text-sm text-left border border-gray-200 rounded-xl hover:border-indigo-500 transition-colors">
                          Summarize key findings
                        </button>
                        <button onClick={() => setInput("What is the methodology used in these studies?")} className="p-3 text-sm text-left border border-gray-200 rounded-xl hover:border-indigo-500 transition-colors">
                          Extract methodology
                        </button>
                      </div>
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <div key={i} className={cn(
                      "flex gap-4 max-w-3xl",
                      msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                    )}>
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        msg.role === 'user' ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-indigo-600"
                      )}>
                        {msg.role === 'user' ? "U" : <Quote size={14} />}
                      </div>
                      <div className={cn(
                        "p-4 rounded-2xl text-sm leading-relaxed",
                        msg.role === 'user' ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 shadow-sm"
                      )}>
                        <ReactMarkdown>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ))}
                  {isChatting && (
                    <div className="flex gap-4 max-w-3xl">
                      <div className="w-8 h-8 bg-white border border-gray-200 text-indigo-600 rounded-lg flex items-center justify-center animate-pulse">
                        <Loader2 className="animate-spin" size={14} />
                      </div>
                      <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-sm">
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" />
                          <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-6 bg-white border-t border-gray-100">
                  <div className="max-w-4xl mx-auto relative">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                      placeholder="Ask about your research..."
                      className="w-full p-4 pr-16 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none h-24 text-sm"
                    />
                    <button 
                      onClick={handleSendMessage}
                      disabled={!input.trim() || isChatting}
                      className="absolute right-3 bottom-3 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'graph' && (
              <motion.div 
                key="graph"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col p-8"
              >
                <div className="mb-6">
                  <h2 className="text-xl font-bold">Research Knowledge Graph</h2>
                  <p className="text-sm text-gray-500">Visualizing connections between documents and extracted concepts.</p>
                </div>
                <div className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden relative">
                  <svg ref={graphRef} className="w-full h-full" />
                  <div className="absolute bottom-4 right-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <div className="w-3 h-3 bg-indigo-600 rounded-full" /> Documents
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <div className="w-3 h-3 bg-emerald-500 rounded-full" /> Concepts
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
