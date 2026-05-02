import { GoogleGenAI, Type } from "@google/genai";
import { ChatMessage, AIResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    files: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          content: { type: Type.STRING },
          language: { type: Type.STRING },
        },
        required: ["name", "content", "language"],
      },
    },
    thinking: { type: Type.STRING, description: "Detailed explanation of your reasoning and changes made." },
    visualTask: { type: Type.STRING, description: "Instruction for the Visual Assistant to create a 3D model or graphic. Use this if the project needs a new asset." },
  },
  required: ["files", "thinking"],
};

export const generateCode = async (prompt: string, currentFiles: any[], history: ChatMessage[] = [], attachments?: { name: string; content: string; type: string }[], signal?: AbortSignal): Promise<AIResponse> => {
  const model = "gemini-3-flash-preview";
  const systemInstruction = `You are an expert web developer. 
  Generate or update files (HTML, CSS, JS) for a web UI based on the user's request.
  Return the files in a JSON object format with 'files', 'thinking', and optional 'visualTask' properties.
  
  VISUAL COORDINATION:
  - DO NOT create a 'models/' folder by default for the first version.
  - RESPONSIBILITY: The AI Assistant is responsible for the FULL implementation (Logic + Visuals) in the first turn. Write Three.js scene code directly in 'main.js' or 'App.js' to ensure the app is functional immediately.
  - LATER OPTIMIZATION: Only suggest extracting models into separate files (e.g., 'robot.js') if specifically requested or if the project grows complex. 
  - The Visual Assistant is a secondary tool for refinement; do not delegate the initial build to it.
  
  CONTEXT & ASSETS:
  - You MUST scan and analyze the 'Current files' provided to you carefully before proposing changes. Your 'thinking' should reflect your understanding of the existing codebase.
  - If you find 3D models in 'models/' or visual assets in 'assets/', INTEGRATE them into your code.
  - The preview window environment supports ES modules (type="module") and has an import map configured.
  - You can use 'import' statements to access Three.js and its examples:
    - import * as THREE from 'three';
    - import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
    - import { Timer } from 'three/examples/jsm/misc/Timer.js';
  - You can also import other generated JS files:
    - import { carModel } from './models/car.js';
  - Tailwind CSS is also pre-loaded.
  
  THREE.JS BEST PRACTICES:
  - NEVER use THREE.Clock as it is deprecated. Use the 'Timer' mentioned above or performance.now().
  - When creating a scene, prioritize a "Playground" or "Viewer" structure that can dynamically load models.
  
  CORE PRINCIPLES:
  1. Partial Updates: Return ONLY the files you modified or created. Files you don't return are preserved by the client.
  2. Asset Preservation: NEVER return files from the 'models/' or 'assets/' folders unless you are explicitly asked to modify them. The client will keep them.
  3. Logical Consistency: Maintain the overall logical framework.
  4. Redesign Scope: Only if the user explicitly asks for a "complete redesign" should you consider returning a completely fresh set of core files (index.html, etc.).
  
  CRITICAL: Always include a 'README.md' file in the 'files' array if it's new or needs an update. 
  
  Example thinking: "I've updated the script.js to include the 3D torus from models/torus.json into the scene..."
  `;

  const attachmentParts = attachments && attachments.length > 0 
    ? attachments.map(a => {
        if (a.type.startsWith('image/') || a.type === 'application/pdf') {
          return {
            inlineData: {
              data: a.content.split(',')[1] || a.content,
              mimeType: a.type
            }
          };
        }
        return { text: `File: ${a.name}\nContent: ${a.content}` };
      })
    : [];

  const historyContext = history.length > 0
    ? `\n\nChat History:\n${history.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}`
    : '';

  if (signal?.aborted) throw new Error('Aborted');

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { text: `Current files: ${JSON.stringify(currentFiles)}${historyContext}\n\nUser Request: ${prompt}` },
        ...attachmentParts
      ]
    },
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  if (signal?.aborted) throw new Error('Aborted');

  return JSON.parse(response.text || '{"files":[], "thinking":""}');
};

export const fixCode = async (error: string, currentFiles: any[], signal?: AbortSignal): Promise<AIResponse> => {
  const model = "gemini-3-flash-preview";
  const systemInstruction = `You are an expert debugger. 
  Given the current files and a runtime error, fix the code to resolve the error.
  Return the updated files in the same JSON object format with 'files' and 'thinking' properties.
  
  CORE PRINCIPLES:
  1. Partial Updates: Return ONLY the files you modified.
  2. Asset Preservation: Do NOT return files from 'models/' or 'assets/' unless specifically fixing them.
  3. Logical Consistency: Maintain the overall logical framework.
  
  CRITICAL: Update the 'README.md' file if changes warrant it.`;

  if (signal?.aborted) throw new Error('Aborted');

  const response = await ai.models.generateContent({
    model,
    contents: `Error: ${error}\n\nCurrent files: ${JSON.stringify(currentFiles)}`,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  if (signal?.aborted) throw new Error('Aborted');

  return JSON.parse(response.text || '{"files":[], "thinking":""}');
};

export const reviewCode = async (currentFiles: any[], signal?: AbortSignal): Promise<AIResponse> => {
  const model = "gemini-3-flash-preview";
  const systemInstruction = `You are a code reviewer. 
  Review the current web UI files and suggest improvements or fix potential issues.
  Return the updated files in the same JSON object format with 'files' and 'thinking' properties.
  
  CORE PRINCIPLES:
  1. Partial Updates: Return ONLY the files you modified.
  2. Asset Preservation: Do NOT return files from 'models/' or 'assets/' unless specifically improving them.
  3. Logical Consistency: Maintain the overall logical framework.
  
  CRITICAL: Update the 'README.md' file if improvements warrant it.`;

  if (signal?.aborted) throw new Error('Aborted');

  const response = await ai.models.generateContent({
    model,
    contents: `Current files: ${JSON.stringify(currentFiles)}`,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  if (signal?.aborted) throw new Error('Aborted');

  return JSON.parse(response.text || '{"files":[], "thinking":""}');
};

const PROJECT_MONITOR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING, description: "Your response message to the user." },
    files: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          content: { type: Type.STRING },
          language: { type: Type.STRING },
        },
        required: ["name", "content", "language"],
      },
      description: "Updated or new files. Use this ONLY for Three.js models (.js, .json) or generated visual assets (SVG).",
    },
  },
  required: ["text"],
};

export const chatWithAssistant = async (prompt: string, currentFiles: any[], logs: any[], history: ChatMessage[] = [], attachments?: { name: string; content: string; type: string }[]): Promise<{ text: string, files?: any[] }> => {
  const model = "gemini-3-flash-preview"; // Using flash for quicker monitor responses
  const systemInstruction = `You are a specialized Visual Assistant (formerly Project Monitor).
  
  YOUR SCOPE & PERMISSIONS:
  1. You can answer user questions and provide solutions related to their web project.
  2. You can analyze screenshots or images provided by the user.
  3. COORDINATION: Watch the chat history for 'visualTask' requests from the Main AI Assistant. 
     If a task is suggested at a specific path (e.g., models/car.json), you MUST fulfill that exact request.
  4. FILE LINKAGE (MANDATORY): You are a high-precision file editor. When a 'visualTask' specifies a path (e.g., models/car.json), and you see that file in 'Current files' (likely containing a placeholder), your response MUST include that exact file path in its 'files' array with your generated content. This acts as a direct "Save" operation to that file.
  5. IMPORTANT: You have specific PERMISSION to write to any file provided in the 'files' list by the Main Assistant, but ONLY for:
     a) Generating visual assets (e.g., SVG files at 'assets/*.svg').
     b) Generating Three.js model data (strictly as .json or .js files at 'models/*.js' or 'models/*.json').
  6. You are FORBIDDEN from modifying general application logic, HTML, or CSS unless it is strictly part of an SVG or Three.js exported file.
  7. Your primary goal is to be a visual and 3D modeling assistant that fulfills delegated tasks by rewriting placeholders.
  
  ENVIRONMENT & IMPORTS:
  - The environment supports ES modules and an import map for Three.js.
  - MODULE EXPORTS (STRICT): When generating '.js' files, you MUST use 'export' syntax.
    - Example: If the file is 'models/car.js', use 'export const carModel = [...];'
  - Recommended imports for your own logic if needed:
    - import * as THREE from 'three';
    - import { Timer } from 'three/examples/jsm/misc/Timer.js';
  
  THREE.JS BEST PRACTICES:
  - NEVER use THREE.Clock. Use THREE.Timer or performance.now() to handle time and deltas.
  - When fulfilling a 'visualTask', produce data structures that are easy to integrate (e.g., arrays of mesh definitions or functions that build a group).
  
  3D MODEL FORMAT (.js preference):
  Prefer exporting a constant containing the data structure:
  'export const modelData = [ { "type": "box", ... } ];'

  RESPONSE FORMAT:
  - If fulfilling a 'visualTask', the 'files' you return MUST match the name in the task.
  - Ensure the content includes 'export const ...' so the main logic can import it.
  
  Example output:
  {
    "text": "Generated the specialized 3D car model.",
    "files": [
      { "name": "models/car.js", "content": "export const carModel = [{\"type\": \"box\", \"color\": \"#ff0000\", \"position\": [0,0,0], \"scale\": [2,1,4]}];", "language": "javascript" }
    ]
  }`;

  const historyContext = history.length > 0
    ? `\n\nChat History:\n${history.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}`
    : '';

  const attachmentParts = attachments && attachments.length > 0 
    ? attachments.map(a => {
        if (a.type.startsWith('image/') || a.type === 'application/pdf') {
          return {
            inlineData: {
              data: a.content.split(',')[1] || a.content,
              mimeType: a.type
            }
          };
        }
        return { text: `File: ${a.name}\nContent: ${a.content}` };
      })
    : [];

  const contents: any = {
    parts: [
      { text: `Current files: ${JSON.stringify(currentFiles)}${historyContext}\n\nUser Message: ${prompt}` },
      ...attachmentParts
    ]
  };

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: PROJECT_MONITOR_SCHEMA,
    },
  });

  try {
    return JSON.parse(response.text || '{"text":"I encountered an error."}');
  } catch (e) {
    return { text: response.text || "I'm sorry, I couldn't process that." };
  }
};
