import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Container,
  CopyButton,
  Group,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { createLazyFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { TbArrowLeft, TbBrandGithub, TbCheck, TbCopy, TbExternalLink, TbLayoutDashboard, TbLogin } from 'react-icons/tb'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute, useSession } from '@/frontend/hooks/useAuth'

export const Route = createLazyFileRoute('/gists/$id/files/$filename')({ component: FilePreviewPage })

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
const getLangColor = (lang: string) => LANG_COLORS[lang] ?? 'gray'

type GistFile = { filename: string; content: string; language: string }
type PublicGist = {
  id: string
  title: string
  description: string
  files: GistFile[]
  tags: string[]
  updatedAt: string
  user: { id: string; name: string }
}

function FilePreviewPage() {
  const { id, filename } = useParams({ from: '/gists/$id/files/$filename' })
  const { data: session } = useSession()
  const navigate = useNavigate()

  const decodedFilename = decodeURIComponent(filename)
  const rawUrl = `/api/public/gists/${id}/raw/${filename}`

  const { data, isLoading, isError } = useQuery<{ gist: PublicGist }>({
    queryKey: ['public', 'gist', id],
    queryFn: () =>
      fetch(`/api/public/gists/${id}`).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`)
        return r.json()
      }),
  })

  const file = data?.gist.files.find((f) => f.filename === decodedFilename)
  const isMarkdown = file?.language === 'markdown'
  const lineCount = file ? file.content.split('\n').length : 0

  const handleNav = () => {
    if (session?.user) navigate({ to: getDefaultRoute(session.user.role) })
    else navigate({ to: '/login' })
  }

  return (
    <Box style={{ minHeight: '100vh', background: 'var(--mantine-color-body)' }}>
      {/* Navbar */}
      <Box
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          background: 'var(--mantine-color-body)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <Container size="lg" py="xs">
          <Group justify="space-between">
            <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => navigate({ to: '/gists' })}>
              <ThemeIcon size={28} variant="gradient" radius="md">
                <TbBrandGithub size={14} />
              </ThemeIcon>
              <Text fw={800} size="sm">
                Public Gists
              </Text>
            </Group>
            <Group gap="xs">
              <ThemeToggle size="sm" />
              {session?.user ? (
                <Tooltip label="Go to dashboard">
                  <ActionIcon variant="subtle" color="gray" onClick={handleNav}>
                    <TbLayoutDashboard size={16} />
                  </ActionIcon>
                </Tooltip>
              ) : (
                <Button size="xs" variant="subtle" leftSection={<TbLogin size={13} />} onClick={handleNav}>
                  Login
                </Button>
              )}
            </Group>
          </Group>
        </Container>
      </Box>

      <Container size="lg" py="xl">
        {/* Breadcrumb */}
        <Group gap="xs" mb="md" wrap="nowrap" style={{ minWidth: 0 }}>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<TbArrowLeft size={13} />}
            onClick={() => navigate({ to: '/gists/$id', params: { id } })}
          >
            {isLoading ? '…' : (data?.gist.title ?? 'Gist')}
          </Button>
          <Text size="xs" c="dimmed">
            /
          </Text>
          <Text size="xs" fw={600} truncate>
            {decodedFilename}
          </Text>
        </Group>

        {isLoading ? (
          <Stack gap="md">
            <Skeleton height={24} width="30%" radius="md" />
            <Skeleton height={400} radius="md" />
          </Stack>
        ) : isError || !data || !file ? (
          <Box
            p="xl"
            ta="center"
            style={{
              border: '1px dashed var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-md)',
            }}
          >
            <Text size="sm" fw={500} c="red">
              {!data ? 'Gist tidak ditemukan atau bersifat private.' : `File "${decodedFilename}" tidak ditemukan.`}
            </Text>
            <Button size="xs" variant="subtle" mt="sm" onClick={() => navigate({ to: '/gists/$id', params: { id } })}>
              Kembali ke gist
            </Button>
          </Box>
        ) : (
          <Stack gap="md">
            {/* File header */}
            <Group justify="space-between" wrap="nowrap">
              <Group gap="xs" style={{ minWidth: 0 }}>
                <Badge size="sm" variant="dot" color={getLangColor(file.language)}>
                  {file.language}
                </Badge>
                <Text size="xs" c="dimmed">
                  {lineCount} lines
                </Text>
                <Text size="xs" c="dimmed">
                  ·
                </Text>
                <Text size="xs" c="dimmed">
                  {new Blob([file.content]).size.toLocaleString()} bytes
                </Text>
              </Group>
              <Group gap={4} wrap="nowrap">
                <CopyButton value={file.content} timeout={2000}>
                  {({ copied, copy }) => (
                    <Button
                      size="xs"
                      variant="subtle"
                      color={copied ? 'teal' : 'gray'}
                      leftSection={copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                      onClick={copy}
                    >
                      {copied ? 'Tersalin!' : 'Copy'}
                    </Button>
                  )}
                </CopyButton>
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  leftSection={<TbExternalLink size={13} />}
                  component="a"
                  href={rawUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Raw
                </Button>
              </Group>
            </Group>

            {/* Content */}
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
                  {/* Line numbers */}
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
                  {/* Code */}
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

            {/* File links in gist */}
            {data.gist.files.length > 1 && (
              <Group gap="xs">
                <Text size="xs" c="dimmed">
                  Files lain:
                </Text>
                {data.gist.files
                  .filter((f) => f.filename !== file.filename)
                  .map((f) => (
                    <Button
                      key={f.filename}
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={() =>
                        navigate({
                          to: '/gists/$id/files/$filename',
                          params: { id, filename: encodeURIComponent(f.filename) },
                          search: { q: undefined, tags: undefined },
                        })
                      }
                    >
                      {f.filename}
                    </Button>
                  ))}
              </Group>
            )}
          </Stack>
        )}
      </Container>
    </Box>
  )
}
