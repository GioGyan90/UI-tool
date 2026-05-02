import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { FileExplorer } from './components/FileExplorer';
import { CodeEditor } from './components/CodeEditor';
import { Preview, PreviewHandle } from './components/Preview';
import { PromptInput } from './components/PromptInput';
import { ChatAssistant } from './components/ChatAssistant';
import { FileItem, ChatMessage, LogEntry } from './types';
import { generateCode, fixCode, reviewCode } from './services/gemini';
import { Bug, Terminal, XCircle, ChevronLeft, ChevronRight, GripVertical, Monitor, RefreshCw, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const INITIAL_FILES: FileItem[] = [
  {
    name: 'index.html',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Playground</title>
</head>
<body class="bg-zinc-900 min-h-screen flex items-center justify-center text-white">
    <div class="text-center space-y-6 max-w-2xl px-4">
        <h1 class="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            AI Web UI Playground
        </h1>
        <p class="text-zinc-400 text-lg">
            Describe your UI below to get started! 
            <br/>
            <span class="text-zinc-500 text-sm mt-2 block">
                Built-in support for <b>Tailwind CSS</b> and <b>Three.js</b>.
            </span>
        </p>
    </div>
</body>
</html>`,
    language: 'html'
  }
];

export default function App() {
  const previewRef = useRef<PreviewHandle>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [files, setFiles] = useState<FileItem[]>(INITIAL_FILES);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoFixing, setAutoFixing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Hello! I can help you build and debug your web UI. What are we creating today?' }
  ]);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantHeight, setAssistantHeight] = useState(500);
  const [isResizing, setIsResizing] = useState(false);
  const [generationStep, setGenerationStep] = useState<'idle' | 'analyzing' | 'delegating' | 'integrating' | 'finalizing'>('idle');

  const [pendingUpdate, setPendingUpdate] = useState<{ 
    files: FileItem[], 
    thinking: string, 
    visualTask?: string 
  } | null>(null);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY - 40; // Offset from bottom
      if (newHeight > 200 && newHeight < window.innerHeight - 100) {
        setAssistantHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const [focusFiles, setFocusFiles] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const toggleFocusFile = useCallback((fileName: string) => {
    setFocusFiles(prev => 
      prev.includes(fileName) ? prev.filter(f => f !== fileName) : [...prev, fileName]
    );
    // Also open the prompt input if it's not open, to show the tag
    setIsPromptOpen(true);
  }, []);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setAutoFixing(false);
  }, []);

  // Console log suppression during generation
  useEffect(() => {
    if (generationStep !== 'idle' && generationStep !== 'finalizing') {
      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;
      
      console.log = () => {};
      console.warn = () => {};
      console.error = () => {};
      
      return () => {
        console.log = originalLog;
        console.warn = originalWarn;
        console.error = originalError;
      };
    }
  }, [generationStep]);

  const handleVisualTaskComplete = useCallback((visualFiles: FileItem[]) => {
    if (pendingUpdate) {
      setGenerationStep('integrating');
      
      // Artificial delay to show integration step
      setTimeout(() => {
        setFiles(prev => {
          const merged = [...pendingUpdate.files];
          visualFiles.forEach(vf => {
            const idx = merged.findIndex(f => f.name === vf.name);
            if (idx >= 0) merged[idx] = vf;
            else merged.push(vf);
          });
          if (selectedProject) {
            saveFilesToServer(selectedProject, merged);
          }
          return merged;
        });

        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `Visual task completed. I've integrated the assets into the codebase and finalized the design.`,
          thinking: pendingUpdate.thinking,
          visualTask: pendingUpdate.visualTask
        }]);

        setPendingUpdate(null);
        setGenerationStep('finalizing');
        
        // Final refresh and console resume
        setTimeout(() => {
          setGenerationStep('idle');
          if (previewRef.current) {
            previewRef.current.refresh(); // Use the exposed method
          }
        }, 1000);
      }, 800);
    }
  }, [pendingUpdate, selectedProject]);

  // Load files when project changes
  useEffect(() => {
    if (selectedProject) {
      fetch(`/api/folders/${selectedProject}/files`)
        .then(res => res.json())
        .then(data => {
          if (data && data.length > 0) {
            setFiles(data);
            setActiveFileIndex(0);
          } else {
            setFiles([]);
            setActiveFileIndex(-1);
          }
        })
        .catch(err => {
          console.error('Failed to load project files:', err);
          setFiles([]);
          setActiveFileIndex(-1);
        });
    } else {
      setFiles(INITIAL_FILES);
      setActiveFileIndex(0);
    }
  }, [selectedProject]);

  // Save files to server
  const saveFilesToServer = async (project: string, currentFiles: FileItem[]) => {
    try {
      await fetch(`/api/folders/${project}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: currentFiles }),
      });
    } catch (err) {
      console.error('Failed to save files to server:', err);
    }
  };

  const handleGenerate = async (prompt: string, attachments?: { name: string; content: string; type: string }[], focusFiles?: string[]) => {
    handleStop(); // Cancel any existing generation
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    setIsGenerating(true);
    setGenerationStep('analyzing');
    setError(null);
    
    // If focus files are provided, prepend them to the prompt to guide the AI
    const enhancedPrompt = focusFiles && focusFiles.length > 0 
      ? `[FOCUS FILES: ${focusFiles.join(', ')}]\n\n${prompt}`
      : prompt;

    const userMessage: ChatMessage = { role: 'user', content: prompt, attachments };
    const currentHistory = [...messages];
    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await generateCode(enhancedPrompt, files, currentHistory, attachments, controller.signal);
      if (response.files.length > 0) {
        const isRedesign = prompt.toLowerCase().includes('complete redesign') || 
                          prompt.toLowerCase().includes('completely redesign') ||
                          prompt.includes('重新做整体设计');
        
        let updatedFiles: FileItem[];
        if (isRedesign) {
          updatedFiles = response.files;
        } else {
          updatedFiles = [...files];
          response.files.forEach(nf => {
            const idx = updatedFiles.findIndex(f => f.name === nf.name);
            if (idx >= 0) updatedFiles[idx] = nf;
            else updatedFiles.push(nf);
          });
        }

        setFiles(updatedFiles);
        setActiveFileIndex(0);

        setGenerationStep('finalizing');
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `I've updated the code based on your request.`,
          thinking: response.thinking,
          visualTask: response.visualTask
        }]);
        
        if (selectedProject) {
          saveFilesToServer(selectedProject, updatedFiles);
        }
        
        if (response.visualTask) {
          setIsAssistantOpen(true);
        }

        setTimeout(() => setGenerationStep('idle'), 800);
      }
    } catch (err: any) {
      if (err.message === 'Aborted') {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Generation stopped by user.' }]);
      } else {
        console.error(err);
        setError('Failed to generate code. Please try again.');
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handleReview = async () => {
    handleStop();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsGenerating(true);
    setError(null);
    setMessages(prev => [...prev, { role: 'user', content: 'Please review the code.' }]);
    
    try {
      const response = await reviewCode(files, controller.signal);
      if (response.files.length > 0) {
        const updatedFiles = [...files];
        response.files.forEach(nf => {
          const idx = updatedFiles.findIndex(f => f.name === nf.name);
          if (idx >= 0) updatedFiles[idx] = nf;
          else updatedFiles.push(nf);
        });

        setFiles(updatedFiles);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: 'I have reviewed the code and made some improvements.',
          thinking: response.thinking 
        }]);
        if (selectedProject) {
          saveFilesToServer(selectedProject, updatedFiles);
        }
      }
    } catch (err: any) {
      if (err.message === 'Aborted') {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Review stopped by user.' }]);
      } else {
        console.error(err);
        setError('Failed to review code.');
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handlePreviewError = useCallback(async (errorMessage: string) => {
    if (autoFixing) return;
    
    handleStop();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(`Runtime Error: ${errorMessage}`);
    setAutoFixing(true);
    setMessages(prev => [...prev, { role: 'assistant', content: `Detected an error: ${errorMessage}. I'm fixing it now...` }]);
    
    try {
      const response = await fixCode(errorMessage, files, controller.signal);
      if (response.files.length > 0) {
        const updatedFiles = [...files];
        response.files.forEach(nf => {
          const idx = updatedFiles.findIndex(f => f.name === nf.name);
          if (idx >= 0) updatedFiles[idx] = nf;
          else updatedFiles.push(nf);
        });

        setFiles(updatedFiles);
        setError(null);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: 'I have fixed the runtime error.',
          thinking: response.thinking 
        }]);
        if (selectedProject) {
          saveFilesToServer(selectedProject, updatedFiles);
        }
      }
    } catch (err: any) {
      if (err.message === 'Aborted') {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Auto-fix stopped by user.' }]);
      } else {
        console.error('Auto-fix failed:', err);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setAutoFixing(false);
        abortControllerRef.current = null;
      }
    }
  }, [files, autoFixing, selectedProject, handleStop]);

  const updateActiveFileContent = (content: string) => {
    if (files.length === 0 || activeFileIndex < 0 || activeFileIndex >= files.length) return;
    const newFiles = [...files];
    newFiles[activeFileIndex].content = content;
    setFiles(newFiles);
    if (selectedProject) {
      saveFilesToServer(selectedProject, newFiles);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Top Section: Explorer, Editor, Preview */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left: Explorer & Projects */}
          <Panel defaultSize={20} minSize={15} collapsible={true} className="border-r border-zinc-800">
            <FileExplorer 
              files={files} 
              activeFileIndex={activeFileIndex} 
              onSelectFile={setActiveFileIndex}
              onUploadFiles={async (newFiles, projectName) => {
                const targetProject = projectName || selectedProject;
                
                // If we only have the initial default file, replace it
                const isInitial = files.length === 1 && 
                                 files[0].name === 'index.html' && 
                                 files[0].content.includes('AI Web UI Playground');
                
                const updatedFiles = isInitial ? [...newFiles] : [...files, ...newFiles];
                
                setFiles(updatedFiles);
                setActiveFileIndex(0); // Reset to first file of upload

                if (targetProject) {
                  if (projectName && projectName !== selectedProject) {
                    setSelectedProject(projectName);
                  }
                  await saveFilesToServer(targetProject, updatedFiles);
                }
              }}
              selectedProject={selectedProject}
              onSelectProject={setSelectedProject}
              onProjectRenamed={(oldName, newName) => {
                if (selectedProject === oldName) setSelectedProject(newName);
              }}
              onProjectDeleted={(name) => {
                if (selectedProject === name) {
                  setSelectedProject(null);
                  setFiles([]);
                }
              }}
              focusFiles={focusFiles}
              onToggleFocusFile={toggleFocusFile}
              onUpdateFiles={(newFiles) => {
                setFiles(newFiles);
                if (selectedProject) {
                  saveFilesToServer(selectedProject, newFiles);
                }
              }}
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-zinc-900 hover:bg-blue-600 transition-colors flex items-center justify-center">
            <div className="w-0.5 h-4 bg-zinc-700 rounded-full"></div>
          </PanelResizeHandle>

          {/* Middle: Editor */}
          <Panel defaultSize={40} minSize={20} collapsible={true} className="border-r border-zinc-800 bg-zinc-950">
            {files.length > 0 ? (
              <CodeEditor 
                content={files[activeFileIndex]?.content || ''} 
                language={files[activeFileIndex]?.language || 'javascript'} 
                onChange={updateActiveFileContent}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center border border-zinc-800">
                  <Terminal size={32} className="text-zinc-700" />
                </div>
                <div>
                  <h3 className="text-zinc-300 font-medium">No files found</h3>
                  <p className="text-sm mt-1">Start by describing your UI in the chat below.</p>
                </div>
              </div>
            )}
          </Panel>

          <PanelResizeHandle className="w-1 bg-zinc-900 hover:bg-blue-600 transition-colors flex items-center justify-center">
            <div className="w-0.5 h-4 bg-zinc-700 rounded-full"></div>
          </PanelResizeHandle>

          {/* Right: Preview */}
          <Panel defaultSize={40} minSize={20} collapsible={true} className="bg-white overflow-hidden flex flex-col relative border-l border-zinc-200">
            <AnimatePresence>
              {generationStep !== 'idle' && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-50 bg-zinc-950/40 backdrop-blur-[2px] flex items-center justify-center pointer-events-none"
                >
                  <div className="bg-zinc-900/90 border border-zinc-800 p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4 text-center max-w-[240px]">
                    <div className="relative">
                      <div className="w-16 h-16 border-4 border-blue-500/20 rounded-full animate-[spin_4s_linear_infinite]" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div
                          animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                        >
                          <RefreshCw size={24} className="text-blue-400" />
                        </motion.div>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-[11px] font-bold text-white mb-1 uppercase tracking-widest leading-tight">
                        {generationStep === 'analyzing' ? 'Project Reasoning' : 
                         generationStep === 'delegating' ? 'Asset Synthesis' :
                         generationStep === 'integrating' ? 'Sync Assets' :
                         'Finalizing'}
                      </h3>
                      <p className="text-[9px] text-zinc-500 font-medium">
                        Coordination in progress...
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {files.length > 0 ? (
              <Preview 
                ref={previewRef} 
                files={files} 
                onError={handlePreviewError} 
                onLogsUpdate={setLogs}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center bg-zinc-50 text-zinc-400 p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
                  <Monitor size={40} className="text-zinc-200" />
                </div>
                <h3 className="text-zinc-600 font-medium">Preview Unavailable</h3>
                <p className="text-sm mt-1 max-w-xs">Create or upload files to see the live preview here.</p>
              </div>
            )}
            
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-4 left-4 right-4 bg-red-900/90 border border-red-500/50 p-4 rounded-xl backdrop-blur-sm shadow-2xl z-20"
                >
                  <div className="flex items-start gap-3">
                    <XCircle className="text-red-400 shrink-0 mt-0.5" size={20} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-100">{error}</p>
                      {autoFixing && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-red-300">
                          <Bug size={14} className="animate-bounce" />
                          <span>AI is automatically fixing this bug...</span>
                        </div>
                      )}
                    </div>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
                      <XCircle size={18} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Panel>
        </PanelGroup>
      </div>

      {/* Bottom Section: Prompt Input */}
      <PromptInput 
        onGenerate={handleGenerate} 
        onReview={handleReview}
        onStop={handleStop}
        isGenerating={isGenerating || autoFixing} 
        messages={messages}
        isOpen={isPromptOpen}
        setIsOpen={setIsPromptOpen}
        availableFiles={files.map(f => f.name)}
        focusFiles={focusFiles}
        onToggleFocusFile={toggleFocusFile}
        generationStep={generationStep}
        height={assistantHeight}
        onStartResizing={startResizing}
      />

      {/* Visual Assistant */}
      <ChatAssistant 
        files={files}
        onUpdateFiles={(newFiles) => {
          setFiles(prev => {
            const updated = [...prev];
            newFiles.forEach(nf => {
              const idx = updated.findIndex(f => f.name === nf.name);
              if (idx >= 0) updated[idx] = nf;
              else updated.push(nf);
            });
            if (selectedProject) {
              saveFilesToServer(selectedProject, updated);
            }
            return updated;
          });
        }}
        isOpen={isAssistantOpen}
        setIsOpen={setIsAssistantOpen}
        height={assistantHeight}
        onStartResizing={startResizing}
      />
    </div>
  );
}
