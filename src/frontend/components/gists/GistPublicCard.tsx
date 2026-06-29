import {
  ActionIcon,
  Badge,
  Box,
  CopyButton,
  Divider,
  Group,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import {
  TbBrandGithub,
  TbCheck,
  TbCopy,
  TbExternalLink,
  TbGlobe,
  TbMaximize,
  TbUser,
} from 'react-icons/tb'

const LANG_COLORS: Record<string, string> = {
  javascript: 'yellow',
  typescript: 'blue',
  python: 'green',
  go: 'cyan',
  rust: 'orange',
  bash: 'gray',
  sql: 'violet',
  json: 'teal',
  yaml: 'lime',
  html: 'red',
  css: 'indigo',
  markdown: 'gray',
  dockerfile: 'blue',
  prisma: 'violet',
  toml: 'orange',
  plaintext: 'gray',
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

export type GistUser = { id: string; name: string }
export type PublicGist = {
  id: string
  title: string
  description: string
  files: { filename: string; content: string; language: string }[]
  tags: string[]
  createdAt: string
  updatedAt: string
  user: GistUser
}

export function GistPublicCard({ gist, onClick }: { gist: PublicGist; onClick: () => void }) {
  const langs = [...new Set(gist.files.map((f) => f.language))]
  return (
    <Box
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-md)',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s',
        overflow: 'hidden',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.boxShadow = ''
      }}
    >
      <Box p="sm">
        <Group justify="space-between" wrap="nowrap" mb={4}>
          <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
            <ThemeIcon size={26} radius="sm" variant="light" color="primary">
              <TbBrandGithub size={14} />
            </ThemeIcon>
            <Text fw={700} size="sm" truncate style={{ flex: 1 }}>
              {gist.title}
            </Text>
          </Group>
          <Badge size="xs" variant="light" color="teal" leftSection={<TbGlobe size={9} />}>
            public
          </Badge>
        </Group>
        {gist.description && (
          <Text size="xs" c="dimmed" lineClamp={2} mb={6}>
            {gist.description}
          </Text>
        )}
        <Group gap={6} wrap="wrap" mb={6}>
          {langs.map((lang) => (
            <Group key={lang} gap={4}>
              <Box
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: `var(--mantine-color-${getLangColor(lang)}-5)`,
                }}
              />
              <Text size="xs" c="dimmed">
                {lang}
              </Text>
            </Group>
          ))}
          {gist.tags.map((tag) => (
            <Badge key={tag} size="xs" variant="outline" color="gray">
              {tag}
            </Badge>
          ))}
        </Group>
        <Group justify="space-between" gap="xs">
          <Text size="xs" c="dimmed">
            {gist.files.length} file{gist.files.length > 1 ? 's' : ''}
          </Text>
          <Group gap={4}>
            <TbUser size={11} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed">
              {gist.user.name}
            </Text>
            <Text size="xs" c="dimmed">
              ·
            </Text>
            <Text size="xs" c="dimmed">
              {relTime(gist.updatedAt)}
            </Text>
          </Group>
        </Group>
      </Box>

      <Divider />
      <Box px="sm" py={6} onClick={(e) => e.stopPropagation()}>
        <Group gap={4} wrap="wrap">
          {gist.files.map((f) => (
            <Group
              key={f.filename}
              gap={2}
              wrap="nowrap"
              style={{
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 6,
                padding: '2px 6px',
                background: 'var(--mantine-color-default-hover)',
              }}
            >
              <Box
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: `var(--mantine-color-${getLangColor(f.language)}-5)`,
                  flexShrink: 0,
                }}
              />
              <Text
                size="xs"
                style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {f.filename}
              </Text>
              <Tooltip label="Preview">
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  component="a"
                  href={`/gists/${gist.id}/files/${encodeURIComponent(f.filename)}`}
                >
                  <TbMaximize size={11} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Raw">
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  component="a"
                  href={`/api/public/gists/${gist.id}/raw/${encodeURIComponent(f.filename)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <TbExternalLink size={11} />
                </ActionIcon>
              </Tooltip>
              <CopyButton value={f.content} timeout={2000}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Tersalin!' : 'Copy'}>
                    <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                      {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
          ))}
        </Group>
      </Box>
    </Box>
  )
}
