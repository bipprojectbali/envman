import { Code } from '@mantine/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface MarkdownRendererProps {
  children: string
  fontSize?: number | string
}

export function MarkdownRenderer({ children, fontSize = 14 }: MarkdownRendererProps) {
  return (
    <div className="markdown-body" style={{ fontSize }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children: codeChildren, ...rest }) {
            const lang = /language-(\w+)/.exec(className || '')?.[1]
            const inline = !className
            if (inline) {
              return <code {...rest} className={className}>{codeChildren}</code>
            }
            return lang ? (
              <SyntaxHighlighter
                language={lang}
                style={vscDarkPlus}
                customStyle={{ borderRadius: 6, fontSize: 13, margin: '8px 0' }}
                showLineNumbers={String(codeChildren).split('\n').length > 5}
              >
                {String(codeChildren).trimEnd()}
              </SyntaxHighlighter>
            ) : (
              <Code block style={{ fontSize: 13 }}>{String(codeChildren).trimEnd()}</Code>
            )
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
