import React, { useRef, useState, useEffect } from 'react';
import { FileCode, Download, Folder, Upload, Edit2, Check, X, Plus, ChevronDown, ChevronRight, Trash2, SearchCode, GripVertical, FilePlus, FolderPlus, RotateCw, Eraser } from 'lucide-react';
import { FileItem } from '../types';
import JSZip from 'jszip';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, useDroppable } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface FileExplorerProps {
  files: FileItem[];
  activeFileIndex: number;
  onSelectFile: (index: number) => void;
  onUploadFiles: (newFiles: FileItem[], projectName?: string) => Promise<void>;
  selectedProject: string | null;
  onSelectProject: (name: string) => void;
  onProjectRenamed: (oldName: string, newName: string) => void;
  onProjectDeleted: (name: string) => void;
  focusFiles: string[];
  onToggleFocusFile: (fileName: string) => void;
  onUpdateFiles: (files: FileItem[]) => void;
}

const DroppableFolder: React.FC<{
  id: string;
  name: string;
  depth: number;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ id, name, depth, isExpanded, onToggle, children }) => {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className="flex flex-col">
      <div 
        className={`flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer group/subfolder transition-all ${
          isOver ? 'bg-blue-600/20 text-blue-400' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={onToggle}
      >
        <div className="w-4 h-4 flex items-center justify-center">
          {isExpanded ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
        </div>
        <Folder size={14} className={isOver ? 'text-blue-400' : 'text-zinc-500 group-hover/subfolder:text-zinc-400'} />
        <span className="truncate flex-1 font-medium">{name}</span>
      </div>
      {isExpanded && (
        <div 
          className="ml-[15px] border-l border-zinc-800/50 flex flex-col gap-0.5 mt-0.5"
          style={{ marginLeft: `${depth * 12 + 15}px`, paddingLeft: '4px' }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

const SortableFileItem: React.FC<{ 
  file: FileItem, 
  index: number, 
  activeFileIndex: number, 
  onSelectFile: (idx: number) => void, 
  onToggleFocusFile: (name: string) => void, 
  focusFiles: string[],
  depth?: number
}> = ({ 
  file, 
  index, 
  activeFileIndex, 
  onSelectFile, 
  onToggleFocusFile, 
  focusFiles,
  depth = 0
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: file.name });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const fileName = file.name.split('/').pop() || file.name;

  return (
    <div 
      ref={setNodeRef} 
      className={`group/file flex items-center gap-1 rounded-md transition-colors ${
        index === activeFileIndex 
          ? 'bg-zinc-800/80 text-white border border-zinc-700/50' 
          : 'text-zinc-500 hover:bg-zinc-800/30'
      }`}
      style={{ ...style, paddingLeft: depth > 0 ? '0px' : `${depth * 12}px` }}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="p-1 px-1.5 cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 opacity-0 group-hover/file:opacity-100 transition-opacity"
      >
        <GripVertical size={12} />
      </div>
      <button
        onClick={() => onSelectFile(index)}
        className="flex-1 flex items-center gap-2 py-1.5 text-xs text-left min-w-0"
      >
        <FileCode size={14} className={index === activeFileIndex ? 'text-blue-400' : 'text-zinc-500'} />
        <span className="truncate flex-1">{fileName}</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFocusFile(file.name);
        }}
        className={`p-1.5 mr-1 rounded-md transition-all opacity-0 group-hover/file:opacity-100 ${
          focusFiles.includes(file.name)
            ? 'bg-blue-600/20 text-blue-400 opacity-100'
            : 'text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300'
        }`}
        title={focusFiles.includes(file.name) ? "Remove from AI Focus" : "Add to AI Focus"}
      >
        <SearchCode size={12} />
      </button>
    </div>
  );
};

export const FileExplorer: React.FC<FileExplorerProps> = ({ 
  files, 
  activeFileIndex, 
  onSelectFile, 
  onUploadFiles,
  selectedProject,
  onSelectProject,
  onProjectRenamed,
  onProjectDeleted,
  focusFiles,
  onToggleFocusFile,
  onUpdateFiles
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const singleFileInputRef = useRef<HTMLInputElement>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState<string | null>(null);
  const [addingSubfolder, setAddingSubfolder] = useState<string | null>(null);
  const [subfolderName, setSubfolderName] = useState('');
  const [addingFile, setAddingFile] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchFolders = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch('/api/folders');
      const data = await response.json();
      setFolders(data);
      // Remove auto-selection of first project
      // if (data.length > 0 && !selectedProject) {
      //   onSelectProject(data[0]);
      // }
      // Expand the selected project by default
      if (selectedProject) {
        setExpandedFolders(prev => new Set(prev).add(selectedProject));
      }
    } catch (e) {
      console.error('Failed to fetch folders:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      setExpandedFolders(prev => new Set(prev).add(selectedProject));
    }
  }, [selectedProject]);

  const handleCreateProject = async () => {
    try {
      const response = await fetch('/api/folders/create', { method: 'POST' });
      const data = await response.json();
      await fetchFolders();
      onSelectProject(data.name);
    } catch (e) {
      console.error('Failed to create project:', e);
    }
  };

  const handleRename = async (oldName: string) => {
    if (!newName || newName === oldName) {
      setEditingFolder(null);
      return;
    }
    try {
      const response = await fetch('/api/folders/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName, newName }),
      });
      if (response.ok) {
        await fetchFolders();
        onProjectRenamed(oldName, newName);
        setError(null);
      } else {
        const err = await response.json();
        setError(err.error || 'Failed to rename');
      }
    } catch (e) {
      console.error('Failed to rename:', e);
      setError('Failed to rename folder');
    } finally {
      setEditingFolder(null);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      const response = await fetch('/api/folders/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (response.ok) {
        await fetchFolders();
        onProjectDeleted(name);
        setError(null);
      } else {
        const err = await response.json();
        setError(err.error || 'Failed to delete');
      }
    } catch (e) {
      console.error('Failed to delete:', e);
      setError('Failed to delete project');
    } finally {
      setDeletingFolder(null);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Are you sure you want to delete all current projects? This cannot be undone.")) return;
    try {
      const response = await fetch('/api/folders/clear', { method: 'POST' });
      if (response.ok) {
        await fetchFolders();
        onProjectDeleted(""); // Clear current selection
        setError(null);
      }
    } catch (e) {
      console.error('Failed to clear projects:', e);
      setError('Failed to clear workspace');
    }
  };

  const downloadProject = async () => {
    const zip = new JSZip();
    files.forEach(file => {
      zip.file(file.name, file.content);
    });
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedProject || 'web-ui-project'}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleFolder = (folder: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folder)) {
      newExpanded.delete(folder);
    } else {
      newExpanded.add(folder);
    }
    setExpandedFolders(newExpanded);
    onSelectProject(folder);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    let detectedProjectName = '';
    const newFiles: FileItem[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      // Skip system files and common ignored directories if any
      if (file.name.startsWith('.') || file.webkitRelativePath.includes('node_modules')) continue;
      
      if (!detectedProjectName && file.webkitRelativePath) {
        detectedProjectName = file.webkitRelativePath.split('/')[0];
      }

      const content = await file.text();
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      let language = 'javascript';
      if (extension === 'html') language = 'html';
      else if (extension === 'css') language = 'css';
      else if (extension === 'json') language = 'json';
      else if (extension === 'md') language = 'markdown';

      newFiles.push({
        name: file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name,
        content,
        language
      });
    }

    if (newFiles.length > 0) {
      await onUploadFiles(newFiles, detectedProjectName || undefined);
      // Refresh folders to show the newly uploaded project
      fetchFolders();
    }
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSingleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !selectedProject) return;

    const newFiles: FileItem[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const content = await file.text();
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      let language = 'javascript';
      if (extension === 'html') language = 'html';
      else if (extension === 'css') language = 'css';
      else if (extension === 'json') language = 'json';
      else if (extension === 'md') language = 'markdown';

      newFiles.push({
        name: file.name,
        content,
        language
      });
    }

    if (newFiles.length > 0) {
      await onUploadFiles(newFiles);
      fetchFolders();
    }
    
    if (singleFileInputRef.current) singleFileInputRef.current.value = '';
    setShowAddMenu(null);
  };

  const handleCreateSubfolder = async (folder: string) => {
    if (!subfolderName || !selectedProject) return;
    
    const newFile: FileItem = {
      name: `${subfolderName}/.keep`,
      content: '',
      language: 'text'
    };
    
    await onUploadFiles([newFile]);
    setAddingSubfolder(null);
    setSubfolderName('');
    setShowAddMenu(null);
  };

  const handleCreateFile = async (folder: string) => {
    if (!newFileName || !selectedProject) return;
    
    let fileName = newFileName;
    if (!fileName.includes('.')) {
      fileName += '.md';
    }
    
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    let language = 'javascript';
    if (extension === 'html') language = 'html';
    else if (extension === 'css') language = 'css';
    else if (extension === 'json') language = 'json';
    else if (extension === 'md' || extension === 'markdown') language = 'markdown';
    else if (extension === 'txt') language = 'text';

    const newFile: FileItem = {
      name: fileName,
      content: '',
      language
    };
    
    await onUploadFiles([newFile]);
    setAddingFile(null);
    setNewFileName('');
    setShowAddMenu(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const activeId = active.id as string;
      const overId = over.id as string;

      // Check if we dropped onto a folder
      if (overId.endsWith('/')) {
        const fileName = activeId.split('/').pop() || activeId;
        const newPath = overId + fileName;
        
        const newFiles = files.map(f => {
          if (f.name === activeId) {
            return { ...f, name: newPath };
          }
          return f;
        });
        onUpdateFiles(newFiles);
        return;
      }

      const oldIndex = files.findIndex(f => f.name === activeId);
      const newIndex = files.findIndex(f => f.name === overId);
      
      const newFiles = arrayMove(files, oldIndex, newIndex);
      onUpdateFiles(newFiles);
    }
  };

  const renderFileTree = () => {
    interface TreeNode {
      type: 'file' | 'folder';
      index?: number;
      file?: FileItem;
      children?: { [key: string]: TreeNode };
    }
    
    const tree: { [key: string]: TreeNode } = {};
    files.forEach((file, index) => {
      const parts = file.name.split('/');
      let current = tree;
      parts.forEach((part, i) => {
        if (i === parts.length - 1) {
          current[part] = { type: 'file', index, file };
        } else {
          if (!current[part]) current[part] = { type: 'folder', children: {} };
          current = current[part].children!;
        }
      });
    });

    const renderNode = (name: string, node: TreeNode, path = '', depth = 0) => {
      const fullPath = path ? `${path}/${name}` : name;
      
      if (node.type === 'file' && node.file !== undefined && node.index !== undefined) {
        return (
          <SortableFileItem 
            key={fullPath}
            file={node.file}
            index={node.index}
            activeFileIndex={activeFileIndex}
            onSelectFile={onSelectFile}
            onToggleFocusFile={onToggleFocusFile}
            focusFiles={focusFiles}
            depth={depth}
          />
        );
      }

      if (node.type === 'folder' && node.children) {
        const isExpanded = expandedFolders.has(fullPath);
        return (
          <DroppableFolder 
            key={fullPath}
            id={fullPath + '/'}
            name={name}
            depth={depth}
            isExpanded={isExpanded}
            onToggle={() => {
              const newExpanded = new Set(expandedFolders);
              if (newExpanded.has(fullPath)) newExpanded.delete(fullPath);
              else newExpanded.add(fullPath);
              setExpandedFolders(newExpanded);
            }}
          >
            {Object.entries(node.children)
              .sort(([aName, aNode], [bName, bNode]) => {
                // Folders first, then files
                if (aNode.type !== bNode.type) return aNode.type === 'folder' ? -1 : 1;
                return aName.localeCompare(bName);
              })
              .map(([childName, childNode]) => 
                renderNode(childName, childNode, fullPath, 0) // depth 0 because container handles margin/border
              )}
          </DroppableFolder>
        );
      }
      return null;
    };

    return (
      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext 
          items={files.map(f => f.name)}
          strategy={verticalListSortingStrategy}
        >
          {Object.entries(tree).map(([name, node]) => renderNode(name, node))}
        </SortableContext>
      </DndContext>
    );
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-r border-zinc-800 w-full">
      <div className="p-4 flex items-center justify-between border-b border-zinc-800">
        <div className="flex items-center gap-2 text-zinc-400 font-medium">
          <Folder size={18} />
          <span className="text-xs font-bold uppercase tracking-widest">Project Files</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={fetchFolders}
            className={`p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Refresh Projects"
            disabled={isRefreshing}
          >
            <RotateCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={handleCreateProject}
            className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
            title="New Project"
          >
            <Plus size={18} />
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
            title="Upload Folder"
          >
            <Upload size={18} />
          </button>
          <button 
            onClick={downloadProject}
            className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
            title="Download Project"
          >
            <Download size={18} />
          </button>
          <button 
            onClick={handleClearAll}
            className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-red-400 transition-colors"
            title="Clear Workspace"
          >
            <Eraser size={18} />
          </button>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileUpload}
          // @ts-ignore
          webkitdirectory=""
          directory=""
          multiple
        />
        <input
          type="file"
          ref={singleFileInputRef}
          className="hidden"
          onChange={handleSingleFileUpload}
          multiple
        />
      </div>
      
      {error && (
        <div className="mx-2 mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded-lg flex items-center justify-between gap-2">
          <p className="text-[10px] text-red-200 truncate">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
            <X size={10} />
          </button>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto py-2 px-3 space-y-1 scrollbar-thin scrollbar-thumb-zinc-800">
        {!selectedProject && files.length > 0 && (
          <div className="flex flex-col mb-4">
            <div 
              className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/40 text-zinc-300 cursor-pointer hover:bg-zinc-800/60 transition-colors"
              onClick={() => {
                const welcomeKey = 'welcome-special-folder';
                const newExpanded = new Set(expandedFolders);
                if (newExpanded.has(welcomeKey)) newExpanded.delete(welcomeKey);
                else newExpanded.add(welcomeKey);
                setExpandedFolders(newExpanded);
              }}
            >
              <div className="w-4 h-4 flex items-center justify-center">
                {expandedFolders.has('welcome-special-folder') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
              <Folder size={14} className="text-blue-400" />
              <span className="text-xs truncate font-semibold">Current Workspace</span>
            </div>
            {expandedFolders.has('welcome-special-folder') && (
              <div className="ml-[15px] border-l border-zinc-800/50 pl-2 mt-1 flex flex-col gap-0.5">
                {renderFileTree()}
              </div>
            )}
          </div>
        )}
        
        {folders.length > 0 && (
          <div className="px-1 py-2 mb-2">
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2 mb-2">Projects</h4>
            <div className="space-y-1">
              {folders.map((folder) => (
                <div key={folder} className="flex flex-col">
                  <div
                    className={`group flex items-center justify-between p-2 rounded-lg transition-all cursor-pointer ${
                      selectedProject === folder ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-zinc-700/50' : 'text-zinc-500 hover:bg-zinc-800/30 hover:text-zinc-300'
                    }`}
                    onClick={() => toggleFolder(folder)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-4 h-4 flex items-center justify-center">
                        {expandedFolders.has(folder) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                      <Folder size={14} className={selectedProject === folder ? 'text-blue-400' : 'text-zinc-600'} />
                      <div className="flex-1 min-w-0">
                        {editingFolder === folder ? (
                          <input
                            autoFocus
                            className="bg-zinc-950 border border-blue-500 rounded px-1 outline-none text-xs w-full text-white"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(folder);
                              if (e.key === 'Escape') setEditingFolder(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="text-xs truncate font-medium">{folder}</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {editingFolder === folder ? (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRename(folder); }}
                            className="p-1 hover:bg-zinc-700 rounded text-green-400"
                          >
                            <Check size={12} />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowAddMenu(showAddMenu === folder ? null : folder);
                              }}
                              className={`p-1 hover:bg-zinc-700 rounded ${showAddMenu === folder ? 'bg-zinc-700 text-blue-400' : ''}`}
                              title="Add..."
                            >
                              <Plus size={12} />
                            </button>
                            
                            {showAddMenu === folder && (
                              <div className="absolute top-full right-0 mt-1 w-36 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl z-50 overflow-hidden ring-1 ring-white/5 animate-in fade-in zoom-in-95">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAddingFile(folder);
                                    setNewFileName('');
                                    setShowAddMenu(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-zinc-300 hover:bg-zinc-800 transition-colors"
                                >
                                  <FilePlus size={12} className="text-zinc-500" />
                                  <span>New File</span>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAddingSubfolder(folder);
                                    setSubfolderName('');
                                    setShowAddMenu(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-zinc-300 hover:bg-zinc-800 transition-colors"
                                >
                                  <FolderPlus size={12} className="text-zinc-500" />
                                  <span>New Subfolder</span>
                                </button>
                                <div className="h-[1px] bg-zinc-800 mx-2 my-1" />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    singleFileInputRef.current?.click();
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-zinc-300 hover:bg-zinc-800 transition-colors"
                                >
                                  <Upload size={12} className="text-zinc-500" />
                                  <span>Upload Local File</span>
                                </button>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingFolder(folder);
                              setNewName(folder);
                            }}
                            className="p-1 hover:bg-zinc-700 rounded text-zinc-500 hover:text-zinc-300"
                            title="Rename"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingFolder(folder);
                            }}
                            className="p-1 hover:bg-zinc-700 rounded text-zinc-500 hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expansion Content (Files within project) */}
                  {expandedFolders.has(folder) && selectedProject === folder && (
                    <div className="ml-[15px] border-l border-zinc-800/50 pl-2 mt-1 flex flex-col gap-0.5 animate-in slide-in-from-top-1 duration-200">
                      {renderFileTree()}
                    </div>
                  )}

                  {/* Context-aware inputs */}
                  {addingSubfolder === folder && (
                    <div className="ml-6 mr-2 mt-1 p-2 bg-zinc-800/50 border border-zinc-700 rounded-lg flex items-center gap-2 ring-1 ring-blue-500/30">
                      <Folder size={12} className="text-blue-400" />
                      <input
                        autoFocus
                        className="bg-transparent border-none outline-none text-[11px] flex-1 text-white placeholder-zinc-500"
                        placeholder="Folder name..."
                        value={subfolderName}
                        onChange={(e) => setSubfolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateSubfolder(folder);
                          if (e.key === 'Escape') setAddingSubfolder(null);
                        }}
                      />
                      <button onClick={() => handleCreateSubfolder(folder)} className="text-blue-400">
                        <Check size={12} />
                      </button>
                    </div>
                  )}

                  {addingFile === folder && (
                    <div className="ml-6 mr-2 mt-1 p-2 bg-zinc-800/50 border border-zinc-700 rounded-lg flex items-center gap-2 ring-1 ring-blue-500/30">
                      <FileCode size={12} className="text-blue-400" />
                      <input
                        autoFocus
                        className="bg-transparent border-none outline-none text-[11px] flex-1 text-white placeholder-zinc-500"
                        placeholder="File name..."
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateFile(folder);
                          if (e.key === 'Escape') setAddingFile(null);
                        }}
                      />
                      <button onClick={() => handleCreateFile(folder)} className="text-blue-400">
                        <Check size={12} />
                      </button>
                    </div>
                  )}

                  {/* Delete Confirmation Overlay (Project-specific) */}
                  {deletingFolder === folder && (
                    <div className="ml-6 mr-2 mt-1 p-2 bg-red-900/10 border border-red-500/20 rounded-lg animate-in fade-in slide-in-from-top-1">
                      <p className="text-[10px] text-red-300 font-medium mb-2">Delete this project? All files will be lost.</p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(folder); }}
                          className="flex-1 py-1 text-[10px] bg-red-600/80 hover:bg-red-500 text-white rounded transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletingFolder(null); }}
                          className="flex-1 py-1 text-[10px] bg-zinc-800 text-zinc-400 rounded transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
