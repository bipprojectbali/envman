import {
  ActionIcon,
  Badge,
  Box,
  Code,
  CopyButton,
  Divider,
  Group,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from '@mantine/core'
import { TbCheck, TbCopy, TbExternalLink, TbGlobe, TbMaximize, TbUser } from 'react-icons/tb'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'

const LANG_COLORS: Record<string, string> = {
  javascript: 'yellow', typescript: 'blue', python: 'green', go: 'cyan',
  rust: 'orange', bash: 'gray', sql: 'violet', json: 'teal', yaml: 'lime',
  html: 'red', css: 'indigo', markdown: 'gray', dockerfile: 'blue',
  prisma: 'violet', toml: 'orange', plaintext: 'gray',
}
export const getLangColor = (lang: string) => LANG_COLORS[lang] ?? 'gray'

export function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m}m lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}h lalu`
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export type GistFile = { filename: string; content: string; language: string }
export type PublicGist = {
  id: string; title: string; description: string
  files: GistFile[]; tags: string[]
  createdAt: string; updatedAt: string
  user: { id: string; name: string }
}

export function GistDetailContent({ gist }: { gist: PublicGist }) {
  return (
    <Stack gap="md">
      <Box>
        <Group gap="xs" mb={4} align="center">
          <Text size="xl" fw={800}>{gist.title}</Text>
          <Badge size="sm" variant="light" color="teal" leftSection={<TbGlobe size={9} />}>public</Badge>
        </Group>
        {gist.description && <Text size="sm" c="dimmed" mb={8}>{gist.description}</Text>}
        <Group gap={8}>
          <Group gap={4}>
            <TbUser size={13} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed">{gist.user.name}</Text>
          </Group>
          <Text size="xs" c="dimmed">·</Text>
          <Text size="xs" c="dimmed">Diperbarui {relTime(gist.updatedAt)}</Text>
          {gist.tags.map((tag) => (
            <Badge key={tag} size="xs" variant="outline" color="gray">{tag}</Badge>
          ))}
        </Group>
      </Box>

      <Divider />

      <Tabs defaultValue={gist.files[0]?.filename}>
        <Tabs.List>
          {gist.files.map((f) => (
            <Tabs.Tab key={f.filename} value={f.filename}>
              <Group gap={6}>
                <Box style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--mantine-color-${getLangColor(f.language)}-5)` }} />
                <Code fz={11}>{f.filename}</Code>
              </Group>
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {gist.files.map((f) => (
          <Tabs.Panel key={f.filename} value={f.filename} pt="sm">
            <FilePanel gistId={gist.id} file={f} />
          </Tabs.Panel>
        ))}
      </Tabs>
    </Stack>
  )
}

function FilePanel({ gistId, file }: { gistId: string; file: GistFile }) {
  const rawUrl = `/api/public/gists/${gistId}/raw/${encodeURIComponent(file.filename)}`
  const previewUrl = `/gists/${gistId}/files/${encodeURIComponent(file.filename)}`
  const isMarkdown = file.language === 'markdown'

  return (
    <Box style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)', overflow: 'hidden' }}>
      <Group justify="space-between" px="sm" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group gap={6}>
          <Badge size="xs" variant="dot" color={getLangColor(file.language)}>{file.language}</Badge>
          <Text size="xs" c="dimmed">{file.content.split('\n').length} lines</Text>
        </Group>
        <Group gap={4}>
          <CopyButton value={file.content} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Tersalin!' : 'Salin konten'}>
                <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                  {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
          <Tooltip label="Preview full page">
            <ActionIcon size="sm" variant="subtle" color="gray" component="a" href={previewUrl}>
              <TbMaximize size={13} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Buka raw">
            <ActionIcon size="sm" variant="subtle" color="gray" component="a" href={rawUrl} target="_blank" rel="noopener noreferrer">
              <TbExternalLink size={13} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Box p="sm">
        {isMarkdown ? (
          <MarkdownRenderer>{file.content}</MarkdownRenderer>
        ) : (
          <Box component="pre" style={{ margin: 0, padding: 0, fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 13, lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre', color: 'var(--mantine-color-text)' }}>
            {file.content}
          </Box>
        )}
      </Box>
    </Box>
  )
}
