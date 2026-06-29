import { Box } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import 'github-markdown-css/github-markdown.css'
import { buildDocs, darkModeCSS } from '@/frontend/lib/docs-guide'

export const Route = createFileRoute('/envmanager/docs')({
  component: DocsPage,
})

function DocsPage() {
  const origin = window.location.origin
  return (
    <Box
      className="markdown-body"
      style={{ maxWidth: 800, margin: '0 auto', padding: '0 0 48px', backgroundColor: 'transparent', color: 'inherit' }}
    >
      <style>{darkModeCSS}</style>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{buildDocs(origin)}</ReactMarkdown>
    </Box>
  )
}
