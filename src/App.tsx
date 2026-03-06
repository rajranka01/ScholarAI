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
  Search,
  LogOut,
  User as UserIcon,
  Trash2,
  StickyNote,
  X,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as d3 from 'd3';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { User, Document, Message, Note, GraphData } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('scholar_token'));
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // App State
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'graph' | 'library' | 'notes'>('chat');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const graphRef = useRef<SVGSVGElement>(null);

  // Initialize
  useEffect(() => {
    if (token) {
      fetchUser();
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      fetchDocuments();
      fetchNotes();
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === 'graph' && user) {
      renderGraph();
    }
  }, [activeTab, documents]);

  // Auth Functions
  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        handleLogout();
      }
    } catch (err) {
      handleLogout();
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm),
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('scholar_token', data.token);
      } else {
        setAuthError(data.error);
      }
    } catch (err) {
      setAuthError("Connection failed");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('scholar_token');
    setDocuments([]);
    setMessages([]);
    setNotes([]);
  };

  // Data Functions
  const fetchDocuments = async () => {
    const res = await fetch('/api/documents', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    setDocuments(data);
  };

  const fetchNotes = async () => {
    const res = await fetch('/api/notes', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    setNotes(data);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', e.target.files[0]);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        fetchDocuments();
      }
    } catch (error) {
      console.error('Upload failed', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!confirm("Delete this document and its notes?")) return;
    await fetch(`/api/documents/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    fetchDocuments();
    fetchNotes();
    if (selectedDocId === id) setSelectedDocId(null);
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
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: input, docId: selectedDocId }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
    } catch (error) {
      console.error('Chat failed', error);
    } finally {
      setIsChatting(false);
    }
  };

  const handleAddNote = async (content: string) => {
    await fetch('/api/notes', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ docId: selectedDocId, content }),
    });
    fetchNotes();
  };

  const renderGraph = async () => {
    if (!graphRef.current) return;
    const res = await fetch('/api/graph', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data: GraphData = await res.json();

    const width = 800;
    const height = 600;

    const svg = d3.select(graphRef.current);
    svg.selectAll("*").remove();

    const simulation = d3.forceSimulation(data.nodes as any)
      .force("link", d3.forceLink(data.links).id((d: any) => d.id))
      .force("charge", d3.forceManyBody().strength(-150))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg.append("g")
      .attr("stroke", "#E5E7EB")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(data.links)
      .join("line");

    const node = svg.append("g")
      .selectAll("circle")
      .data(data.nodes)
      .join("circle")
      .attr("r", 10)
      .attr("fill", (d: any) => d.group === 1 ? "#4f46e5" : "#10b981")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    svg.append("g")
      .selectAll("text")
      .data(data.nodes)
      .join("text")
      .attr("dx", 14)
      .attr("dy", ".35em")
      .text((d: any) => d.id)
      .style("font-size", "12px")
      .style("font-weight", "500")
      .style("fill", "#374151");

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

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden"
        >
          <div className="p-8 text-center bg-indigo-600 text-white">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
              <BookOpen size={32} />
            </div>
            <h1 className="text-2xl font-bold">ScholarAI</h1>
            <p className="text-indigo-100 text-sm mt-1">Your Advanced Research Partner</p>
          </div>
          
          <div className="p-8">
            <div className="flex bg-gray-100 p-1 rounded-xl mb-8">
              <button 
                onClick={() => setAuthMode('login')}
                className={cn(
                  "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                  authMode === 'login' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                Login
              </button>
              <button 
                onClick={() => setAuthMode('register')}
                className={cn(
                  "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                  authMode === 'register' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Full Name</label>
                  <input 
                    type="text" 
                    required
                    value={authForm.name}
                    onChange={e => setAuthForm({...authForm, name: e.target.value})}
                    placeholder="John Doe"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Email Address</label>
                <input 
                  type="email" 
                  required
                  value={authForm.email}
                  onChange={e => setAuthForm({...authForm, email: e.target.value})}
                  placeholder="name@example.com"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Password</label>
                <input 
                  type="password" 
                  required
                  value={authForm.password}
                  onChange={e => setAuthForm({...authForm, password: e.target.value})}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                />
              </div>

              {authError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl text-sm animate-shake">
                  <AlertCircle size={16} />
                  {authError}
                </div>
              )}

              <button 
                type="submit"
                disabled={isAuthLoading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
              >
                {isAuthLoading ? <Loader2 className="animate-spin" size={20} /> : (authMode === 'login' ? 'Sign In' : 'Create Account')}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    );
  }

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
          <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider flex justify-between items-center">
            <span>Library</span>
            <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[10px]">{documents.length}</span>
          </div>
          {documents.map(doc => (
            <div key={doc.id} className="group relative">
              <button 
                onClick={() => {
                  setSelectedDocId(doc.id);
                  setActiveTab('chat');
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors",
                  selectedDocId === doc.id ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"
                )}
              >
                <FileText size={18} className={cn(selectedDocId === doc.id ? "text-indigo-600" : "text-gray-400")} />
                <span className="truncate flex-1 text-left">{doc.name}</span>
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteDoc(doc.id);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {documents.length === 0 && (
            <div className="px-3 py-8 text-center">
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-300">
                <FileText size={20} />
              </div>
              <p className="text-sm text-gray-400">No documents yet</p>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-[#E5E7EB]">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl group relative">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
              {user.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-16 bg-white border-b border-[#E5E7EB] flex items-center justify-between px-8 shrink-0">
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
            <button 
              onClick={() => setActiveTab('notes')}
              className={cn(
                "text-sm font-medium transition-colors relative py-5",
                activeTab === 'notes' ? "text-indigo-600" : "text-gray-500 hover:text-gray-700"
              )}
            >
              My Notes
              {activeTab === 'notes' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
            </button>
          </div>
          
          <div className="flex items-center gap-4">
            {selectedDocId && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium border border-indigo-100">
                <FileText size={12} />
                Focused: {documents.find(d => d.id === selectedDocId)?.name}
                <button onClick={() => setSelectedDocId(null)} className="hover:text-indigo-900">
                  <X size={12} />
                </button>
              </div>
            )}
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
                <div className="flex-1 overflow-y-auto p-8 space-y-6 scroll-smooth">
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
                        <button onClick={() => setInput("Summarize the key findings of my latest paper")} className="p-4 text-sm text-left border border-gray-200 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50/30 transition-all group">
                          <p className="font-semibold mb-1 group-hover:text-indigo-600">Summarize findings</p>
                          <p className="text-xs text-gray-400">Get a quick overview of results</p>
                        </button>
                        <button onClick={() => setInput("What is the methodology used in these studies?")} className="p-4 text-sm text-left border border-gray-200 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50/30 transition-all group">
                          <p className="font-semibold mb-1 group-hover:text-indigo-600">Extract methodology</p>
                          <p className="text-xs text-gray-400">Understand the approach</p>
                        </button>
                      </div>
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <div key={i} className={cn(
                      "flex gap-4 max-w-4xl",
                      msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                    )}>
                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                        msg.role === 'user' ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-indigo-600"
                      )}>
                        {msg.role === 'user' ? <UserIcon size={18} /> : <Quote size={16} />}
                      </div>
                      <div className={cn(
                        "p-5 rounded-2xl text-sm leading-relaxed relative group",
                        msg.role === 'user' ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 shadow-sm"
                      )}>
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                        {msg.role === 'assistant' && (
                          <button 
                            onClick={() => handleAddNote(msg.content)}
                            className="absolute -right-12 top-0 p-2 text-gray-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Save as note"
                          >
                            <StickyNote size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {isChatting && (
                    <div className="flex gap-4 max-w-3xl">
                      <div className="w-9 h-9 bg-white border border-gray-200 text-indigo-600 rounded-xl flex items-center justify-center animate-pulse">
                        <Loader2 className="animate-spin" size={16} />
                      </div>
                      <div className="p-5 bg-white border border-gray-200 rounded-2xl shadow-sm">
                        <div className="flex gap-1.5">
                          <div className="w-2 h-2 bg-indigo-200 rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]" />
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
                      placeholder={selectedDocId ? "Ask about this document..." : "Ask about your research library..."}
                      className="w-full p-5 pr-16 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none h-28 text-sm transition-all"
                    />
                    <button 
                      onClick={handleSendMessage}
                      disabled={!input.trim() || isChatting}
                      className="absolute right-4 bottom-4 p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-100"
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
                <div className="mb-6 flex justify-between items-end">
                  <div>
                    <h2 className="text-2xl font-bold">Research Knowledge Graph</h2>
                    <p className="text-sm text-gray-500">Visualizing connections between documents and extracted concepts.</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2 text-xs font-medium text-gray-600 bg-white px-3 py-1.5 rounded-full border border-gray-100">
                      <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" /> Documents
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-gray-600 bg-white px-3 py-1.5 rounded-full border border-gray-100">
                      <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" /> Concepts
                    </div>
                  </div>
                </div>
                <div className="flex-1 bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden relative">
                  <svg ref={graphRef} className="w-full h-full" />
                </div>
              </motion.div>
            )}

            {activeTab === 'notes' && (
              <motion.div 
                key="notes"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full flex flex-col p-8 overflow-y-auto"
              >
                <div className="mb-8">
                  <h2 className="text-2xl font-bold">Research Notes</h2>
                  <p className="text-sm text-gray-500">Saved insights and synthesized information from your chat sessions.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {notes.map(note => (
                    <motion.div 
                      key={note.id}
                      layout
                      className="bg-white border border-gray-200 p-6 rounded-3xl shadow-sm hover:shadow-md transition-shadow relative group"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-widest mb-4">
                        <StickyNote size={14} />
                        Note
                      </div>
                      <div className="prose prose-sm max-w-none text-gray-700 line-clamp-6">
                        <ReactMarkdown>{note.content}</ReactMarkdown>
                      </div>
                      <div className="mt-6 pt-4 border-t border-gray-50 flex justify-between items-center">
                        <span className="text-[10px] text-gray-400 font-medium">
                          {new Date(note.created_at).toLocaleDateString()}
                        </span>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(note.content);
                              alert("Copied to clipboard!");
                            }}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
                          >
                            <Quote size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {notes.length === 0 && (
                    <div className="col-span-full py-20 text-center">
                      <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center mx-auto mb-6 text-gray-300">
                        <StickyNote size={40} />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">No notes yet</h3>
                      <p className="text-gray-500 max-w-xs mx-auto mt-2">
                        Save insights from your research chat to see them here.
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
