import React from 'react';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';
import 'prismjs/themes/prism-tomorrow.css';

interface CodeEditorProps {
  content: string;
  language: string;
  onChange: (content: string) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ content, language, onChange }) => {
  const getPrismLanguage = (lang: string) => {
    switch (lang.toLowerCase()) {
      case 'html': return languages.markup;
      case 'css': return languages.css;
      case 'javascript':
      case 'js': return languages.javascript;
      default: return languages.markup;
    }
  };

  return (
    <div className="flex-1 h-full overflow-auto bg-zinc-950 font-mono text-sm">
      <Editor
        value={content}
        onValueChange={onChange}
        highlight={code => highlight(code, getPrismLanguage(language), language)}
        padding={20}
        style={{
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          fontSize: 14,
          minHeight: '100%',
          backgroundColor: 'transparent',
        }}
        className="code-editor"
      />
    </div>
  );
};
