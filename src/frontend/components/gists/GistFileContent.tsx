import { Box } from '@mantine/core'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'

interface Props {
  file: { content: string; language: string }
}

export function GistFileContent({ file }: Props) {
  const isMarkdown = file.language === 'markdown'

  return (
    <Box
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-md)',
        overflow: 'hidden',
      }}
    >
      {isMarkdown ? (
        <Box p="md">
          <MarkdownRenderer>{file.content}</MarkdownRenderer>
        </Box>
      ) : (
        <Box style={{ display: 'flex', fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 13 }}>
          <Box
            style={{
              padding: '16px 12px',
              background: 'var(--mantine-color-default-hover)',
              borderRight: '1px solid var(--mantine-color-default-border)',
              userSelect: 'none',
              minWidth: 48,
              textAlign: 'right',
              color: 'var(--mantine-color-dimmed)',
              lineHeight: 1.6,
              flexShrink: 0,
            }}
          >
            {file.content.split('\n').map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: index is line number
              <div key={i + 1}>{i + 1}</div>
            ))}
          </Box>
          <Box
            component="pre"
            style={{
              margin: 0,
              padding: '16px',
              flex: 1,
              overflowX: 'auto',
              whiteSpace: 'pre',
              lineHeight: 1.6,
              color: 'var(--mantine-color-text)',
            }}
          >
            {file.content}
          </Box>
        </Box>
      )}
    </Box>
  )
}
