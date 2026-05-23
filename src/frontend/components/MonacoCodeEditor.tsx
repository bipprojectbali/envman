// MonacoCodeEditor — wrapper Monaco Editor dengan Mantine theme sync,
// language detection dari filename extension, dan mobile fallback.
//
// Lazy-load: component ini di-import via React.lazy() supaya Monaco (~800KB
// gzipped) hanya download saat user buka editor, bukan di initial bundle.
// Lihat MonacoCodeEditor.lazy.tsx.

import { useMantineColorScheme } from '@mantine/core'
import Editor, { loader, type OnMount } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { useEffect, useRef } from 'react'

// Setup Monaco environment sekali. Self-hosted (tidak load dari CDN).
let monacoConfigured = false
function configureMonacoOnce() {
  if (monacoConfigured) return
  monacoConfigured = true
  ;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
    getWorker(_workerId, label) {
      if (label === 'json') return new jsonWorker()
      if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
      if (label === 'typescript' || label === 'javascript') return new tsWorker()
      return new editorWorker()
    },
  }
  loader.config({ monaco })
}

// Map filename extension → Monaco language id. Monaco's known language list
// covers most cases natively (typescript, yaml, shell, sql, dll).
const EXT_LANGUAGE: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'json',
  yaml: 'yaml', yml: 'yaml',
  md: 'markdown', markdown: 'markdown',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sql: 'sql',
  html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less',
  xml: 'xml',
  toml: 'ini',
  ini: 'ini', env: 'ini',
  dockerfile: 'dockerfile',
  graphql: 'graphql', gql: 'graphql',
  proto: 'proto',
  lua: 'lua',
  swift: 'swift',
  kt: 'kotlin', kts: 'kotlin',
  prisma: 'sql', // closest mantra
}

export function detectLanguage(filenameOrLang?: string): string {
  if (!filenameOrLang) return 'plaintext'
  const lower = filenameOrLang.toLowerCase()
  // Special filenames
  if (lower === 'dockerfile' || lower.endsWith('/dockerfile')) return 'dockerfile'
  if (lower === 'makefile' || lower.endsWith('/makefile')) return 'shell'
  if (lower.includes('compose') && (lower.endsWith('.yml') || lower.endsWith('.yaml'))) return 'yaml'
  // Direct language id
  if (Object.values(EXT_LANGUAGE).includes(lower)) return lower
  // Extension lookup
  const dot = lower.lastIndexOf('.')
  if (dot >= 0) {
    const ext = lower.slice(dot + 1)
    if (EXT_LANGUAGE[ext]) return EXT_LANGUAGE[ext]
  }
  // Whole token lookup (e.g., user passed "typescript" or "yaml" directly)
  if (EXT_LANGUAGE[lower]) return EXT_LANGUAGE[lower]
  return 'plaintext'
}

export interface MonacoCodeEditorProps {
  value: string
  onChange?: (value: string) => void
  language?: string
  filename?: string
  readOnly?: boolean
  height?: number | string
  minHeight?: number
  placeholder?: string
  className?: string
  // Hide line numbers untuk editor sederhana (mis. .env)
  noLineNumbers?: boolean
  // Hide minimap untuk editor kecil
  noMinimap?: boolean
}

export default function MonacoCodeEditor({
  value,
  onChange,
  language,
  filename,
  readOnly = false,
  height = 400,
  minHeight = 200,
  noLineNumbers = false,
  noMinimap = false,
}: MonacoCodeEditorProps) {
  const { colorScheme } = useMantineColorScheme()
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    configureMonacoOnce()
  }, [])

  const lang = language ?? detectLanguage(filename)
  const isDark = colorScheme === 'dark' || (colorScheme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
  }

  // Effective height (clamp to minHeight)
  const effectiveHeight = typeof height === 'number' ? Math.max(height, minHeight) : height

  return (
    <Editor
      height={effectiveHeight}
      language={lang}
      value={value}
      theme={isDark ? 'vs-dark' : 'vs'}
      onChange={(v) => onChange?.(v ?? '')}
      onMount={handleMount}
      options={{
        readOnly,
        fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
        minimap: { enabled: !noMinimap },
        lineNumbers: noLineNumbers ? 'off' : 'on',
        scrollBeyondLastLine: false,
        renderWhitespace: 'selection',
        tabSize: 2,
        insertSpaces: true,
        automaticLayout: true,
        wordWrap: 'on',
        padding: { top: 8, bottom: 8 },
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        // Disable some heavy features untuk performance
        formatOnPaste: false,
        formatOnType: false,
        // Mobile-friendly defaults
        mouseWheelZoom: false,
      }}
      loading={
        <div style={{
          height: effectiveHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--mantine-color-dimmed)',
          fontSize: 13,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
          background: isDark ? '#1e1e1e' : '#fff',
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 4,
        }}>
          Loading editor…
        </div>
      }
    />
  )
}
