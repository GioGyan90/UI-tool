import React, { useState, useRef, useEffect } from 'react';
import { Send, Wand2, SearchCode, Bot, X, Paperclip, Image as ImageIcon, ChevronDown, ChevronUp, Camera, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatMessage } from '../types';

interface PromptInputProps {
  onGenerate: (prompt: string, attachments?: { name: string; content: string; type: string }[], focusFiles?: string[]) => void;
  onReview: () => void;
  onStop: () => void;
  isGenerating: boolean;
  messages: ChatMessage[];
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  availableFiles: string[];
  focusFiles: string[];
  onToggleFocusFile: (fileName: string) => void;
  generationStep?: 'idle' | 'analyzing' | 'delegating' | 'integrating' | 'finalizing';
  height?: number;
  onStartResizing?: (e: React.MouseEvent) => void;
}

export const PromptInput: React.FC<PromptInputProps> = ({ 
  onGenerate, onReview, onStop, isGenerating, messages, isOpen, setIsOpen, availableFiles, focusFiles, onToggleFocusFile,
  generationStep = 'idle', height = 500, onStartResizing
}) => {
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<{ name: string; content: string; type: string }[]>([]);
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<number[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const toggleThinking = (index: number) => {
    setExpandedThinking(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((prompt.trim() || attachments.length > 0) && !isGenerating) {
      onGenerate(prompt, attachments, focusFiles);
      setPrompt('');
      setAttachments([]);
      // We keep focusFiles for the next prompt if the user wants, 
      // but usually it's better to clear or let them clear manually.
      // The user said "点击文件后...可以点击叉子关掉", implying manual control.
    }
  };

  const toggleFocusFile = (fileName: string) => {
    onToggleFocusFile(fileName);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments = [...attachments];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        const reader = new FileReader();
        const content = await new Promise<string>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
        newAttachments.push({ name: file.name, content, type: file.type });
      } else {
        const content = await file.text();
        newAttachments.push({ name: file.name, content, type: file.type });
      }
    }
    setAttachments(newAttachments);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed bottom-8 left-8 z-50" ref={containerRef}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20, transformOrigin: 'bottom left' }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            style={{ height: `${height}px` }}
            className="absolute bottom-20 left-0 w-[400px] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Resize Handle */}
            <div 
              onMouseDown={onStartResizing}
              className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-blue-500/30 active:bg-blue-500 transition-colors z-[100]"
            />
            {/* Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950 shrink-0 relative z-10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <Bot size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-zinc-100">AI Assistant</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Online</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isGenerating && (
                  <button
                    type="button"
                    onClick={onStop}
                    className="flex items-center gap-1 px-2 py-1 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded border border-red-500/30 transition-all text-[10px] font-medium"
                    title="Stop Generation"
                  >
                    <X size={10} />
                    <span>Stop</span>
                  </button>
                )}
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px] scrollbar-thin scrollbar-thumb-zinc-800">
              {isGenerating && generationStep !== 'idle' && (
                <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="relative">
                      <div className="w-10 h-10 border-2 border-blue-500/30 rounded-full animate-[spin_3s_linear_infinite]" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Wand2 size={16} className="text-blue-400 animate-pulse" />
                      </div>
                    </div>
                    <div>
                      <h4 className="text-[11px] font-bold text-blue-300 uppercase tracking-wider">Multi-Step Task</h4>
                      <p className="text-[10px] text-zinc-500">Processing complex request...</p>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {[
                      { step: 'analyzing', label: 'Analyzing Codebase', desc: 'Understanding dependencies and structures' },
                      { step: 'delegating', label: 'Visual Delegating', desc: 'Synthesizing 3D assets and graphics' },
                      { step: 'integrating', label: 'Asset Integration', desc: 'Mounting assets into the code' },
                      { step: 'finalizing', label: 'Finalizing Design', desc: 'Polishing and verifying output' }
                    ].map((s, idx, arr) => {
                      const isPast = arr.findIndex(item => item.step === generationStep) > idx;
                      const isCurrent = generationStep === s.step;
                      const isFuture = !isPast && !isCurrent;
                      
                      return (
                        <div key={s.step} className="flex items-start gap-3 relative">
                          {idx !== arr.length - 1 && (
                            <div className={`absolute left-[7px] top-4 bottom-[-16px] w-[2px] transition-colors ${isPast ? 'bg-blue-500' : 'bg-zinc-800'}`} />
                          )}
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center z-10 transition-all ${
                            isPast ? 'bg-blue-500' : isCurrent ? 'bg-blue-600 ring-4 ring-blue-600/20' : 'bg-zinc-800'
                          }`}>
                            {isPast && <Check size={10} className="text-white" />}
                            {isCurrent && <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
                          </div>
                          <div className="flex-1 -mt-0.5">
                            <span className={`text-[11px] font-medium block ${isCurrent ? 'text-blue-300' : isFuture ? 'text-zinc-600' : 'text-zinc-400'}`}>
                              {s.label}
                            </span>
                            {isCurrent && <span className="text-[9px] text-blue-300/60 lowercase">{s.desc}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : 'bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-tl-none'
                  }`}>
                    {msg.content}
                    
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {msg.attachments.map((file, fIdx) => (
                          <div key={fIdx} className="bg-black/20 p-1 rounded flex flex-col gap-1">
                            {file.type.startsWith('image/') ? (
                              <img src={file.content} alt={file.name} className="max-w-[150px] max-h-[150px] rounded object-contain" />
                            ) : (
                              <div className="flex items-center gap-1 text-[9px]">
                                <Paperclip size={8} />
                                <span className="truncate max-w-[80px]">{file.name}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {msg.thinking && (
                    <div className="mt-2 w-full max-w-[90%]">
                      <button 
                        onClick={() => toggleThinking(idx)}
                        className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors mb-1"
                      >
                        <Wand2 size={10} />
                        <span>AI Thought Process</span>
                        {expandedThinking.includes(idx) ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                      
                      <AnimatePresence>
                        {expandedThinking.includes(idx) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="bg-zinc-800/30 border-l-2 border-zinc-700 p-2 text-[11px] text-zinc-400 italic leading-relaxed rounded-r-md">
                              {msg.thinking}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-zinc-900/80 border-t border-zinc-800">
              {/* Focus Files Tags */}
              {focusFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {focusFiles.map((file) => (
                    <div key={file} className="flex items-center gap-1.5 px-2 py-1 bg-blue-900/30 border border-blue-500/30 rounded-md text-[10px] text-blue-300">
                      <SearchCode size={10} />
                      <span className="truncate max-w-[120px]">{file}</span>
                      <button 
                        onClick={() => onToggleFocusFile(file)}
                        className="p-0.5 hover:bg-blue-800/50 rounded-full transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {attachments.map((file, idx) => (
                    <div key={idx} className="group relative flex items-center gap-2 bg-zinc-800 border border-zinc-700 px-2 py-1 rounded-md text-[10px] text-zinc-300">
                      {file.type.startsWith('image/') ? (
                        <img src={file.content} alt={file.name} className="w-8 h-8 object-cover rounded" />
                      ) : file.type === 'application/pdf' ? (
                        <div className="w-8 h-8 bg-red-900/20 rounded flex items-center justify-center text-red-500">
                          <span className="text-[8px] font-bold">PDF</span>
                        </div>
                      ) : (
                        <Paperclip size={10} />
                      )}
                      <span className="truncate max-w-[100px]">{file.name}</span>
                      <button 
                        onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                        className="p-0.5 hover:bg-zinc-700 rounded-full"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="relative">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Type your request..."
                    className="w-full bg-zinc-800 text-zinc-100 rounded-xl p-3 pr-10 min-h-[80px] border border-zinc-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all resize-none text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={(!prompt.trim() && attachments.length === 0) || isGenerating}
                    className={`absolute bottom-3 right-3 p-1.5 rounded-lg transition-all ${
                      (prompt.trim() || attachments.length > 0) && !isGenerating 
                        ? 'bg-blue-600 text-white hover:bg-blue-500' 
                        : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                    }`}
                  >
                    <Send size={16} />
                  </button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors"
                      title="Upload Files"
                    >
                      <Paperclip size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors"
                      title="Upload Images"
                    >
                      <ImageIcon size={18} />
                    </button>
                    <div className="w-px h-4 bg-zinc-800 mx-1"></div>
                    
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowFileSelector(!showFileSelector)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs ${
                          showFileSelector 
                            ? 'bg-blue-600 border-blue-500 text-white' 
                            : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                        }`}
                      >
                        <SearchCode size={14} />
                        <span>Focus Files</span>
                      </button>

                      <AnimatePresence>
                        {showFileSelector && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute bottom-full left-0 mb-2 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-[60]"
                          >
                            <div className="p-2 border-b border-zinc-700 bg-zinc-900/50 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                              Select Focus Files
                            </div>
                            <div className="max-h-48 overflow-y-auto p-1">
                              {availableFiles.map(file => (
                                <button
                                  key={file}
                                  type="button"
                                  onClick={() => onToggleFocusFile(file)}
                                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-between ${
                                    focusFiles.includes(file)
                                      ? 'bg-blue-600/20 text-blue-400'
                                      : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                                  }`}
                                >
                                  <span className="truncate">{file}</span>
                                  {focusFiles.includes(file) && <Check size={12} />}
                                </button>
                              ))}
                              {availableFiles.length === 0 && (
                                <div className="p-3 text-[10px] text-zinc-600 italic">No files available</div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="w-px h-4 bg-zinc-800 mx-1"></div>
                    <button
                      type="button"
                      onClick={onReview}
                      disabled={isGenerating}
                      className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 transition-all text-xs disabled:opacity-50"
                    >
                      <SearchCode size={14} />
                      <span>Review Bug</span>
                    </button>
                  </div>
                  
                  {isGenerating && (
                    <div className="flex items-center gap-2 text-blue-400 text-[10px] animate-pulse font-medium">
                      <Wand2 size={12} className="animate-spin" />
                      <span>
                        {generationStep === 'analyzing' ? 'Reasoning...' : 
                         generationStep === 'delegating' ? 'Waiting for Assets...' :
                         generationStep === 'integrating' ? 'Merging Code...' :
                         'Finalizing...'}
                      </span>
                    </div>
                  )}
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  multiple 
                  accept="image/*,application/pdf,.txt,.js,.ts,.tsx,.html,.css,.json,.md"
                />
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Bubble Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300 ${
          isOpen ? 'bg-zinc-800 text-zinc-400 rotate-90' : 'bg-blue-600 text-white'
        }`}
      >
        {isOpen ? <X size={28} /> : <Bot size={28} />}
      </motion.button>
    </div>
  );
};
