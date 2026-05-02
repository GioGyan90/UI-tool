import React, { useState, useRef, useEffect } from 'react';
import { X, Paintbrush, Sparkles, FileText, Check, Send, Loader2, AlertCircle, FolderTree, Box, SlidersHorizontal, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { FileItem } from '../types';

interface VisualParam {
  name: string;
  value: number | string;
  min?: number;
  max?: number;
  step?: number;
  file: string;
  originalLine: string;
}

interface ChatAssistantProps {
  files: FileItem[];
  onUpdateFiles: (files: FileItem[]) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  height?: number;
  onStartResizing?: (e: React.MouseEvent) => void;
}

export const ChatAssistant: React.FC<ChatAssistantProps> = ({ 
  files, onUpdateFiles, isOpen, setIsOpen, height = 500, onStartResizing 
}) => {
  const [focusedFiles, setFocusedFiles] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [visualParams, setVisualParams] = useState<VisualParam[]>([]);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string, params?: VisualParam[] }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isGenerating, isOrganizing]);

  const toggleFileFocus = (name: string) => {
    setFocusedFiles(prev => 
      prev.includes(name) 
        ? prev.filter(n => n !== name) 
        : [...prev, name]
    );
  };

  const handleOrganizeParameters = async () => {
    if (isGenerating || isOrganizing) return;
    setIsGenerating(true);
    const text = 'Identify adjustable visual parameters (colors, scale, position, speed, etc) in focus files.';
    setMessages(prev => [...prev, { role: 'user', content: text }]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const targetFiles = files.filter(f => focusedFiles.includes(f.name));
      
      if (targetFiles.length === 0) {
        setMessages(prev => [...prev, { role: 'assistant', content: "Please select files to analyze for visual parameters." }]);
        setIsGenerating(false);
        return;
      }

      const fileContext = targetFiles.map(f => `FILE: ${f.name}\nCONTENT:\n${f.content}`).join('\n\n---\n\n');
      
      const systemInstruction = `Extract adjustable numeric or color constants from the code as "Visual Parameters".
For each parameter, provide:
- name: descriptive name
- value: current value
- min/max/step: sensible bounds for sliders (if numeric)
- file: filename
- originalLine: the EXACT line of code where this constant is defined.
Return a JSON object with a "params" array.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Analyze these files for visual parameters:\n${fileContext}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              params: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    value: { type: Type.STRING },
                    min: { type: Type.NUMBER },
                    max: { type: Type.NUMBER },
                    step: { type: Type.NUMBER },
                    file: { type: Type.STRING },
                    originalLine: { type: Type.STRING }
                  },
                  required: ["name", "value", "file", "originalLine"]
                }
              }
            }
          }
        }
      });

      const result = JSON.parse(response.text || '{"params":[]}');
      const params = result.params.map((p: any) => ({
        ...p,
        value: !isNaN(Number(p.value)) ? Number(p.value) : p.value
      }));

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `I've found ${params.length} adjustable parameters. You can tweak them below:`,
        params 
      }]);

    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Failed to extract parameters: " + err.message }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const updateParamValue = (param: VisualParam, newValue: number | string) => {
    // Optimistically update the files
    const updatedFiles = files.map(f => {
      if (f.name === param.file) {
        // Simple string replacement for the value on the specific line
        // This is a naive implementation but works for single constants on a line
        const regex = new RegExp(String(param.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const newContent = f.content.replace(param.originalLine, param.originalLine.replace(regex, String(newValue)));
        
        // Update the originalLine reference for the next change
        param.originalLine = param.originalLine.replace(regex, String(newValue));
        param.value = newValue;
        
        return { ...f, content: newContent };
      }
      return f;
    });

    onUpdateFiles(updatedFiles);
  };

  const handleOrganizeAssets = async () => {
    if (isOrganizing) return;
    setIsOrganizing(true);
    setMessages(prev => [...prev, { role: 'user', content: 'Organize project assets into folders.' }]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const systemInstruction = `You are a Senior Frontend Architect and 3D Specialist. 
Your task is to refactor the current codebase to be more organized and professional.
1. Identify all 3D assets (Three.js models, materials, lights), JS animations (GSAP, Framer Motion), and UI components.
2. Extract these into a meaningful folder structure:
   - /src/assets/models.ts - for 3D object definitions
   - /src/assets/animations.ts - for reusable animation logic
   - /src/components/ - for clean UI separation
3. Update all imports and calls in the main files to use these new locations.
4. RETURN the COMPLETE new list of files as a JSON array of objects conforming to the FileItem interface: { name: string, content: string, language: string }.
5. Maintain the exact same functionality, just with a better structure.
Current Project Files:
${JSON.stringify(files, null, 2)}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: "Refactor this project to organize assets and split modules. Return exactly the JSON array of new FileItem objects.",
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                content: { type: Type.STRING },
                language: { type: Type.STRING }
              },
              required: ["name", "content", "language"]
            }
          }
        }
      });

      const refactoredFiles = JSON.parse(response.text || '[]') as FileItem[];
      
      if (refactoredFiles.length > 0) {
        onUpdateFiles(refactoredFiles);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "Successfully reorganized your project! I've moved 3D assets, animations, and components into dedicated folders while keeping everything connected." 
        }]);
      } else {
        throw new Error("No files returned from reorganization.");
      }

    } catch (err: any) {
      console.error('Organization Error:', err);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Refactoring failed: ${err.message || 'Unknown error'}` 
      }]);
    } finally {
      setIsOrganizing(false);
    }
  };

  const handleSend = async () => {
    if (!prompt.trim() || isGenerating) return;

    const currentPrompt = prompt;
    setPrompt('');
    setMessages(prev => [...prev, { role: 'user', content: currentPrompt }]);
    setIsGenerating(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const targetFiles = files.filter(f => focusedFiles.includes(f.name));
      
      if (targetFiles.length === 0) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "Please select at least one file from the list above to modify." 
        }]);
        setIsGenerating(false);
        return;
      }

      const fileContext = targetFiles.map(f => `FILE: ${f.name}\nCONTENT:\n${f.content}`).join('\n\n---\n\n');
      
      const systemInstruction = `You are a Visual UI Designer and Frontend Expert. 
Your task is to modify the provided code to improve its visual appeal, layout, or functionality based on user instructions.
ONLY return the modified file contents in a JSON object where keys are filenames and values are the NEW COMPLETE code for that file.
Do not include any markdown formatting around the JSON.
Current files context:
${fileContext}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: currentPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: targetFiles.reduce((acc: any, f) => {
              acc[f.name] = { type: Type.STRING };
              return acc;
            }, {})
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      
      const updatedFiles = files.map(f => {
        if (result[f.name]) {
          return { ...f, content: result[f.name] };
        }
        return f;
      });

      onUpdateFiles(updatedFiles);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `I've updated ${Object.keys(result).join(', ')} for you. Take a look at the preview!` 
      }]);

    } catch (err: any) {
      console.error('Visual Assistant Error:', err);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Error: ${err.message || 'Something went wrong while modifying the code.'}` 
      }]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed bottom-8 left-[96px] z-[60]" ref={containerRef}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20, transformOrigin: 'bottom left' }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            style={{ height: `${height}px` }}
            className="absolute bottom-20 left-0 w-[450px] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onMouseDown={(e) => e.stopPropagation()} 
          >
            {/* Resize Handle */}
            <div 
              onMouseDown={onStartResizing}
              className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-indigo-500/30 active:bg-indigo-500 transition-colors z-[100]"
            />
            
            {/* Header */}
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg">
                  <Paintbrush size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Visual Designer</h3>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Refactor & Refine</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={handleOrganizeParameters}
                  disabled={isOrganizing || isGenerating}
                  title="Organize Visual Parameters"
                  className="p-1.5 hover:bg-zinc-800 rounded-lg text-pink-400 disabled:opacity-50 transition-colors"
                >
                  <SlidersHorizontal size={18} />
                </button>
                <button 
                  onClick={handleOrganizeAssets}
                  disabled={isOrganizing || isGenerating}
                  title="Organize Assets"
                  className="p-1.5 hover:bg-zinc-800 rounded-lg text-indigo-400 disabled:opacity-50 transition-colors"
                >
                  <FolderTree size={18} />
                </button>
                <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* File Selector */}
            <div className="p-3 bg-black/20 border-b border-zinc-800 relative">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-zinc-500 uppercase font-black flex items-center gap-1.5">
                  <FileText size={10} /> Focus Files
                </p>
                {focusedFiles.length > 0 && (
                  <button 
                    onClick={() => setFocusedFiles([])}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    Clear Select
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto pr-1">
                {files.map(file => (
                  <button
                    key={file.name}
                    onClick={() => toggleFileFocus(file.name)}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all flex items-center gap-1.5 border ${
                      focusedFiles.includes(file.name)
                        ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400'
                        : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:border-zinc-500'
                    }`}
                  >
                    {focusedFiles.includes(file.name) && <Check size={10} />}
                    <span className="truncate max-w-[120px]">{file.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-zinc-800" ref={scrollRef}>
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-indigo-500/[0.02] rounded-3xl border border-dashed border-indigo-500/10">
                  <div className="w-12 h-12 bg-indigo-600/10 rounded-full flex items-center justify-center mb-4">
                    <Box className="w-6 h-6 text-indigo-500/50" />
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed max-w-[200px]">
                    Select files to focus on, or use <SlidersHorizontal size={12} className="inline text-pink-500 mx-0.5" /> to tweak visual parameters.
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} gap-2`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                  }`}>
                    {msg.content}
                  </div>
                  
                  {msg.params && msg.params.length > 0 && (
                    <div className="w-full max-w-[95%] bg-zinc-950/50 border border-zinc-800/50 rounded-2xl p-4 mt-1 space-y-4 shadow-inner">
                      {msg.params.map((p, idx) => (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight flex items-center gap-1.5">
                              {typeof p.value === 'string' && p.value.startsWith('#') ? (
                                <div className="w-2.5 h-2.5 rounded-full border border-white/10" style={{ backgroundColor: String(p.value) }} />
                              ) : (
                                <div className="w-1 h-1 bg-pink-500 rounded-full" />
                              )}
                              {p.name}
                            </span>
                            <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 rounded uppercase">{p.value}</span>
                          </div>
                          
                          {typeof p.value === 'number' ? (
                            <input 
                              type="range"
                              min={p.min ?? 0}
                              max={p.max ?? 10}
                              step={p.step ?? 0.1}
                              value={p.value}
                              onChange={(e) => updateParamValue(p, Number(e.target.value))}
                              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                          ) : typeof p.value === 'string' && p.value.startsWith('#') ? (
                            <input 
                              type="color"
                              value={p.value}
                              onChange={(e) => updateParamValue(p, e.target.value)}
                              className="w-full h-6 bg-transparent border-none cursor-pointer overflow-hidden rounded"
                            />
                          ) : (
                            <input 
                              type="text"
                              value={p.value}
                              onChange={(e) => updateParamValue(p, e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-[10px] text-zinc-400"
                            />
                          )}
                          <p className="text-[8px] text-zinc-600 font-mono italic">{p.file}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {(isGenerating || isOrganizing) && (
                <div className="flex justify-start">
                  <div className="bg-zinc-800 text-zinc-500 px-3 py-2 rounded-2xl text-xs flex items-center gap-2 italic">
                    <Loader2 size={14} className="animate-spin" />
                    {isOrganizing ? 'Restructuring project...' : 'Refining code...'}
                  </div>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="p-4 bg-zinc-950/80 border-t border-zinc-800 backdrop-blur-md">
              <div className="relative group">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={focusedFiles.length > 0 ? "Ask for changes..." : "Select files to begin..."}
                  disabled={isGenerating || isOrganizing}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
                <button
                  onClick={handleSend}
                  disabled={!prompt.trim() || isGenerating || isOrganizing}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-600/20"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300 relative group overflow-hidden ${
          isOpen ? 'bg-zinc-800 text-zinc-500' : 'bg-indigo-600 text-white shadow-indigo-600/20'
        }`}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div key="close" initial={{ rotate: -90 }} animate={{ rotate: 0 }} exit={{ rotate: 90 }}>
              <X size={24} />
            </motion.div>
          ) : (
            <motion.div key="bot" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
              <Paintbrush size={24} className="group-hover:rotate-12 transition-transform" />
            </motion.div>
          )}
        </AnimatePresence>
        {!isOpen && focusedFiles.length > 0 && (
          <div className="absolute top-2 right-2 w-2 h-2 bg-pink-500 rounded-full animate-pulse" />
        )}
      </motion.button>
    </div>
  );
};
