export interface FileItem {
  name: string;
  content: string;
  language: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  attachments?: { name: string; content: string; type: string }[];
  generatedFiles?: FileItem[];
  visualTask?: string;
}

export interface LogEntry {
  type: 'log' | 'error' | 'warn';
  message: string;
  timestamp: string;
}

export interface AIResponse {
  files: FileItem[];
  thinking: string;
  visualTask?: string;
}
