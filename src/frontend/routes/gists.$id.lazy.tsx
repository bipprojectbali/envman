import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  Container,
  CopyButton,
  Divider,
  Group,
  Skeleton,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { createLazyFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import {
  TbArrowLeft,
  TbBrandGithub,
  TbCheck,
  TbCopy,
  TbExternalLink,
  TbGlobe,
  TbLayoutDashboard,
  TbLogin,
  TbMaximize,
  TbUser,
} from 'react-icons/tb'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute, useSession } from '@/frontend/hooks/useAuth'

export const Route = createLazyFileRoute('/gists/$id')({ component: PublicGistDetailPage })

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

function relTime(iso: string) {
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

type GistFile = { filename: string; content: string; language: string }
type PublicGist = {
  id: string
  title: string
  description: string
  files: GistFile[]
  tags: string[]
  createdAt: string
  updatedAt: string
  user: { id: string; name: string }
}

function PublicGistDetailPage() {
  const { id } = useParams({ from: '/gists/$id' })
  const { data: session } = useSession()
  const navigate = useNavigate()

  const { data, isLoading, isError } = useQuery<{ gist: PublicGist }>({
    queryKey: ['public', 'gist', id],
    queryFn: () =>
      fetch(`/api/public/gists/${id}`).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`)
        return r.json()
      }),
  })

  const handleNav = () => {
    if (session?.user) {
      navigate({ to: getDefaultRoute(session.user.role) })
    } else {
      navigate({ to: '/login' })
    }
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
        <Group gap="xs" mb="md">
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<TbArrowLeft size={13} />}
            onClick={() => navigate({ to: '/gists' })}
          >
            Public Gists
          </Button>
        </Group>

        {isLoading ? (
          <Stack gap="md">
            <Skeleton height={32} width="40%" radius="md" />
            <Skeleton height={20} width="60%" radius="md" />
            <Skeleton height={300} radius="md" />
          </Stack>
        ) : isError || !data ? (
          <Box
            p="xl"
            ta="center"
            style={{
              border: '1px dashed var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-md)',
            }}
          >
            <Text size="sm" fw={500} c="red">
              Gist tidak ditemukan atau bersifat private.
            </Text>
            <Button size="xs" variant="subtle" mt="sm" onClick={() => navigate({ to: '/gists' })}>
              Kembali
            </Button>
          </Box>
        ) : (
          <GistDetail gist={data.gist} />
        )}
      </Container>
    </Box>
  )
}

function GistDetail({ gist }: { gist: PublicGist }) {
  return (
    <Stack gap="md">
      {/* Header */}
      <Box>
        <Group gap="xs" mb={4} align="center">
          <Text size="xl" fw={800}>
            {gist.title}
          </Text>
          <Badge size="sm" variant="light" color="teal" leftSection={<TbGlobe size={9} />}>
            public
          </Badge>
        </Group>
        {gist.description && (
          <Text size="sm" c="dimmed" mb={8}>
            {gist.description}
          </Text>
        )}
        <Group gap={8}>
          <Group gap={4}>
            <TbUser size={13} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed">
              {gist.user.name}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            ·
          </Text>
          <Text size="xs" c="dimmed">
            Diperbarui {relTime(gist.updatedAt)}
          </Text>
          {gist.tags.map((tag) => (
            <Badge key={tag} size="xs" variant="outline" color="gray">
              {tag}
            </Badge>
          ))}
        </Group>
      </Box>

      <Divider />

      {/* Files as tabs */}
      <Tabs defaultValue={gist.files[0]?.filename}>
        <Tabs.List>
          {gist.files.map((f) => (
            <Tabs.Tab key={f.filename} value={f.filename}>
              <Group gap={6}>
                <Box
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: `var(--mantine-color-${getLangColor(f.language)}-5)`,
                  }}
                />
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
    <Box
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-md)',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <Group
        justify="space-between"
        px="sm"
        py="xs"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group gap={6}>
          <Badge size="xs" variant="dot" color={getLangColor(file.language)}>
            {file.language}
          </Badge>
          <Text size="xs" c="dimmed">
            {file.content.split('\n').length} lines
          </Text>
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
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              component="a"
              href={rawUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <TbExternalLink size={13} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Content */}
      <Box p="sm">
        {isMarkdown ? (
          <MarkdownRenderer>{file.content}</MarkdownRenderer>
        ) : (
          <Box
            component="pre"
            style={{
              margin: 0,
              padding: 0,
              fontFamily: 'var(--mantine-font-family-monospace)',
              fontSize: 13,
              lineHeight: 1.6,
              overflowX: 'auto',
              whiteSpace: 'pre',
              color: 'var(--mantine-color-text)',
            }}
          >
            {file.content}
          </Box>
        )}
      </Box>
    </Box>
  )
}
