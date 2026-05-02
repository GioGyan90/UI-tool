import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { FileItem, LogEntry } from '../types';
import { RefreshCw, ExternalLink, Terminal, X, Smartphone, Tablet, Monitor, ChevronDown, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import html2canvas from 'html2canvas';

export interface PreviewHandle {
  refresh: () => void;
}

interface PreviewProps {
  files: FileItem[];
  onError: (error: string) => void;
  onLogsUpdate?: (logs: LogEntry[]) => void;
}

type DeviceSize = 'mobile' | 'tablet' | 'desktop';

const DEVICE_DIMENSIONS = {
  mobile: { width: '375px', height: '667px' },
  tablet: { width: '768px', height: '1024px' },
  desktop: { width: '100%', height: '100%' }
};

export const Preview = forwardRef<PreviewHandle, PreviewProps>(({ files, onError, onLogsUpdate }, ref) => {
  const [srcDoc, setSrcDoc] = useState('');
  const [key, setKey] = useState(0);
  const [showConsole, setShowConsole] = useState(false);
  const [deviceSize, setDeviceSize] = useState<DeviceSize>('desktop');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    refresh: () => setKey(prev => prev + 1)
  }));

  const generatePreviewContent = useCallback(() => {
    const htmlFile = files.find(f => f.name === 'index.html') || files.find(f => f.name.endsWith('.html')) || { content: '<h1>No index.html found</h1>' };
    const cssFiles = files.filter(f => f.name.endsWith('.css'));
    const jsFiles = files.filter(f => 
      f.name.endsWith('.js') || 
      f.name.endsWith('.ts') || 
      f.name.endsWith('.jsx') || 
      f.name.endsWith('.tsx')
    );

    let content = htmlFile.content;

    // Ensure basic structure if missing (case-insensitive check)
    if (!/<html/i.test(content)) {
      content = `<!DOCTYPE html>\n<html>\n<head></head>\n<body>\n${content}\n</body>\n</html>`;
    }
    if (!/<head/i.test(content)) {
      content = content.replace(/<html[^>]*>/i, '$&<head></head>');
    }
    if (!/<body/i.test(content)) {
      content = content.replace(/<\/head>/i, '$&<body>').replace(/<\/html>/i, '</body>$&');
    }

    // Inject Error Handling and Console Script FIRST
    const errorHandlingScript = `
      <script>
        (function() {
          const originalLog = console.log;
          const originalError = console.error;
          const originalWarn = console.warn;

          function sendToParent(type, args) {
            window.parent.postMessage({ 
              type: 'console', 
              logType: type, 
              message: Array.from(args).map(arg => {
                try {
                  return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
                } catch (e) {
                  return String(arg);
                }
              }).join(' ') 
            }, '*');
          }

          console.log = function() { sendToParent('log', arguments); originalLog.apply(console, arguments); };
          console.error = function() { sendToParent('error', arguments); originalError.apply(console, arguments); };
          console.warn = function() { sendToParent('warn', arguments); originalWarn.apply(console, arguments); };

          window.onerror = function(message, source, lineno, colno, error) {
            window.parent.postMessage({ type: 'error', message: message }, '*');
            return false;
          };
        })();
      </script>
    `;

    // Create Blob URLs for JS files to allow module imports
    const jsBlobMap: Record<string, string> = {};
    jsFiles.forEach(f => {
      const blob = new Blob([f.content], { type: 'text/javascript' });
      jsBlobMap[f.name] = URL.createObjectURL(blob);
    });

    // Map both exact name and prefixed with ./ or /
    const projectImports: Record<string, string> = {};
    jsFiles.forEach(f => {
      const url = jsBlobMap[f.name];
      const nameWithoutExt = f.name.replace(/\.(js|ts|jsx|tsx)$/, '');
      
      // Standard variations
      const variations = [
        f.name,
        `./${f.name}`,
        f.name.startsWith('/') ? f.name : `/${f.name}`,
        nameWithoutExt,
        `./${nameWithoutExt}`,
        nameWithoutExt.startsWith('/') ? nameWithoutExt : `/${nameWithoutExt}`
      ];

      variations.forEach(v => {
        projectImports[v] = url;
      });
    });

    // Inject External Libraries (Tailwind, Three.js)
    const tailwindScript = '<script src="https://cdn.tailwindcss.com"></script>';
    const threeJsScript = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.162.0/three.min.js"></script>';
    
    const imports = {
      "three": "https://unpkg.com/three@0.162.0/build/three.module.js",
      "three/examples/jsm/": "https://unpkg.com/three@0.162.0/examples/jsm/",
      ...projectImports
    };
    
    const importMap = `
      <script type="importmap">
      ${JSON.stringify({ imports }, null, 2)}
      </script>
    `;
    
    // Inject CSS
    const cssContent = cssFiles.map(f => `<style data-filename="${f.name}">${f.content}</style>`).join('\n');
    
    // Identify scripts already in HTML to avoid double-loading
    const scriptSrcRegex = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi;
    const scriptsInHtml = new Set<string>();
    let match;
    while ((match = scriptSrcRegex.exec(content)) !== null) {
      const src = match[1];
      const cleanSrc = src.replace(/^\.\//, '').replace(/^\//, '');
      scriptsInHtml.add(cleanSrc);
    }

    // Update existing script tags to be modules in HTML and point to Blob URLs
    content = content.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi, (match, p1, p2, p3) => {
      const cleanSrc = p2.replace(/^\.\//, '').replace(/^\//, '');
      if (jsFiles.find(f => f.name === cleanSrc)) {
        const blobUrl = jsBlobMap[cleanSrc];
        // Force type="module" so it respects importmap and allows imports
        const attrs = p1 + p3;
        const hasType = /type=["'][^"']+["']/i.test(attrs);
        const finalAttrs = hasType ? attrs.replace(/type=["'][^"']+["']/i, 'type="module"') : `${attrs} type="module"`;
        return `<script${finalAttrs} src="${blobUrl}"></script>`;
      }
      return match;
    });

    // Inject JS files that are NOT already in the HTML
    const jsContent = jsFiles
      .filter(f => !scriptsInHtml.has(f.name))
      .map(f => `<script type="module" data-filename="${f.name}">${f.content}</script>`)
      .join('\n');

    // Assemble final content using regex to find tags regardless of case or attributes
    content = content.replace(/<head[^>]*>/i, `$& \n${errorHandlingScript}\n${tailwindScript}\n${threeJsScript}\n${importMap}\n${cssContent}`);
    content = content.replace(/<\/body>/i, `${jsContent}\n$&`);

    return content;
  }, [files]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'error') {
        onError(event.data.message);
        setLogs(prev => [...prev, { type: 'error', message: event.data.message, timestamp: new Date().toLocaleTimeString() }]);
      } else if (event.data.type === 'console') {
        const newLog: LogEntry = { 
          type: event.data.logType, 
          message: event.data.message, 
          timestamp: new Date().toLocaleTimeString() 
        };
        setLogs(prev => [...prev, newLog]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onError]);

  useEffect(() => {
    onLogsUpdate?.(logs);
  }, [logs, onLogsUpdate]);

  useEffect(() => {
    setSrcDoc(generatePreviewContent());
    setLogs([]); // Clear logs on refresh
    onLogsUpdate?.([]);
  }, [generatePreviewContent, key]);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const openInNewWindow = () => {
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(srcDoc);
      newWindow.document.close();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Header */}
      <div className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/40"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/40"></div>
            <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/40"></div>
          </div>
          <span className="text-xs text-zinc-500 font-mono ml-2">Preview</span>
        </div>
        
        <div className="flex items-center gap-1">
          <div className="flex items-center bg-zinc-800 rounded-md p-0.5 mr-2">
            <button 
              onClick={() => setDeviceSize('mobile')}
              className={`p-1 rounded transition-all ${deviceSize === 'mobile' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Mobile View"
            >
              <Smartphone size={14} />
            </button>
            <button 
              onClick={() => setDeviceSize('tablet')}
              className={`p-1 rounded transition-all ${deviceSize === 'tablet' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Tablet View"
            >
              <Tablet size={14} />
            </button>
            <button 
              onClick={() => setDeviceSize('desktop')}
              className={`p-1 rounded transition-all ${deviceSize === 'desktop' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Desktop View"
            >
              <Monitor size={14} />
            </button>
          </div>

          <button 
            onClick={() => setKey(prev => prev + 1)}
            className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-md transition-all"
            title="Refresh Preview"
          >
            <RefreshCw size={14} />
          </button>
          <button 
            onClick={openInNewWindow}
            className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-md transition-all"
            title="Open in New Window"
          >
            <ExternalLink size={14} />
          </button>
          <button 
            onClick={() => setShowConsole(!showConsole)}
            className={`p-1.5 rounded-md transition-all flex items-center gap-1.5 px-2 ${
              showConsole ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
            title="Toggle Console"
          >
            <Terminal size={14} />
            <span className="text-[10px] font-bold uppercase">Console</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-auto bg-zinc-100 flex items-center justify-center p-4">
        <div 
          ref={iframeContainerRef}
          className="bg-white shadow-2xl transition-all duration-300 ease-in-out relative overflow-hidden"
          style={{
            width: DEVICE_DIMENSIONS[deviceSize].width,
            height: DEVICE_DIMENSIONS[deviceSize].height,
            maxWidth: '100%',
            maxHeight: '100%',
            border: deviceSize !== 'desktop' ? '12px solid #18181b' : 'none',
            borderRadius: deviceSize !== 'desktop' ? '24px' : '0',
          }}
        >
          <iframe
            key={key}
            srcDoc={srcDoc}
            className="w-full h-full border-none"
            title="Preview"
            sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
          />
        </div>

        {/* Console Overlay */}
        <AnimatePresence>
          {showConsole && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="absolute bottom-0 left-0 right-0 h-1/3 bg-zinc-950 border-t border-zinc-800 flex flex-col z-30"
            >
              <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-900 bg-zinc-900/50">
                <div className="flex items-center gap-2 text-zinc-400">
                  <Terminal size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Console Output</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setLogs([])} className="text-[10px] text-zinc-500 hover:text-zinc-300 uppercase font-bold">Clear</button>
                  <button onClick={() => setShowConsole(false)} className="text-zinc-500 hover:text-zinc-300">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1">
                {logs.length === 0 ? (
                  <div className="text-zinc-700 italic">No logs to display...</div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className={`flex gap-3 border-b border-zinc-900/50 pb-1 ${
                      log.type === 'error' ? 'text-red-400' : log.type === 'warn' ? 'text-yellow-400' : 'text-zinc-300'
                    }`}>
                      <span className="text-zinc-600 shrink-0">[{log.timestamp}]</span>
                      <span className="break-all whitespace-pre-wrap">{log.message}</span>
                    </div>
                  ))
                )}
                <div ref={consoleEndRef} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});
