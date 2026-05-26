import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Container,
  CopyButton,
  Divider,
  Group,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useInfiniteQuery } from '@tanstack/react-query'
import { createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { TbBrandGithub, TbCheck, TbCopy, TbExternalLink, TbGlobe, TbLayoutDashboard, TbLogin, TbMaximize, TbSearch, TbUser, TbX } from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute, useSession } from '@/frontend/hooks/useAuth'

export const Route = createLazyFileRoute('/gists/')({ component: PublicGistsPage })

const LANG_COLORS: Record<string, string> = {
  javascript: 'yellow', typescript: 'blue', python: 'green', go: 'cyan',
  rust: 'orange', bash: 'gray', sql: 'violet', json: 'teal', yaml: 'lime',
  html: 'red', css: 'indigo', markdown: 'gray', dockerfile: 'blue',
  prisma: 'violet', toml: 'orange', plaintext: 'gray',
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

type GistUser = { id: string; name: string }
type PublicGist = {
  id: string
  title: string
  description: string
  files: { filename: string; content: string; language: string }[]
  tags: string[]
  createdAt: string
  updatedAt: string
  user: GistUser
}

function GistPublicCard({ gist, onClick }: { gist: PublicGist; onClick: () => void }) {
  const langs = [...new Set(gist.files.map(f => f.language))]
  return (
    <Box
      style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)', cursor: 'pointer', transition: 'box-shadow 0.15s', overflow: 'hidden' }}
      onClick={onClick}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '' }}
    >
      <Box p="sm">
        <Group justify="space-between" wrap="nowrap" mb={4}>
          <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
            <ThemeIcon size={26} radius="sm" variant="light" color="primary">
              <TbBrandGithub size={14} />
            </ThemeIcon>
            <Text fw={700} size="sm" truncate style={{ flex: 1 }}>{gist.title}</Text>
          </Group>
          <Badge size="xs" variant="light" color="teal" leftSection={<TbGlobe size={9} />}>public</Badge>
        </Group>
        {gist.description && (
          <Text size="xs" c="dimmed" lineClamp={2} mb={6}>{gist.description}</Text>
        )}
        <Group gap={6} wrap="wrap" mb={6}>
          {langs.map(lang => (
            <Group key={lang} gap={4}>
              <Box style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--mantine-color-${getLangColor(lang)}-5)` }} />
              <Text size="xs" c="dimmed">{lang}</Text>
            </Group>
          ))}
          {gist.tags.map(tag => (
            <Badge key={tag} size="xs" variant="outline" color="gray">{tag}</Badge>
          ))}
        </Group>
        <Group justify="space-between" gap="xs">
          <Text size="xs" c="dimmed">{gist.files.length} file{gist.files.length > 1 ? 's' : ''}</Text>
          <Group gap={4}>
            <TbUser size={11} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed">{gist.user.name}</Text>
            <Text size="xs" c="dimmed">·</Text>
            <Text size="xs" c="dimmed">{relTime(gist.updatedAt)}</Text>
          </Group>
        </Group>
      </Box>

      <Divider />
      <Box px="sm" py={6} onClick={e => e.stopPropagation()}>
        <Group gap={4} wrap="wrap">
          {gist.files.map(f => (
            <Group key={f.filename} gap={2} wrap="nowrap"
              style={{
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 6,
                padding: '2px 6px',
                background: 'var(--mantine-color-default-hover)',
              }}
            >
              <Box style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--mantine-color-${getLangColor(f.language)}-5)`, flexShrink: 0 }} />
              <Text size="xs" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</Text>
              <Tooltip label="Preview">
                <ActionIcon size="xs" variant="subtle" color="gray" component="a"
                  href={`/gists/${gist.id}/files/${encodeURIComponent(f.filename)}`}>
                  <TbMaximize size={11} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Raw">
                <ActionIcon size="xs" variant="subtle" color="gray" component="a"
                  href={`/api/public/gists/${gist.id}/raw/${encodeURIComponent(f.filename)}`}
                  target="_blank" rel="noopener noreferrer">
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

function PublicGistsPage() {
  const { data: session } = useSession()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [debouncedQ] = useDebouncedValue(q, 300)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['public', 'gists', debouncedQ],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' })
      if (debouncedQ) params.set('search', debouncedQ)
      if (pageParam) params.set('cursor', pageParam as string)
      return fetch(`/api/public/gists?${params}`).then(r => r.json()) as Promise<{ gists: PublicGist[]; nextCursor?: string }>
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
  })

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
    }, { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const gists = data?.pages.flatMap(p => p.gists) ?? []

  const handleNav = () => {
    if (session?.user) navigate({ to: getDefaultRoute(session.user.role) })
    else navigate({ to: '/login' })
  }

  return (
    <Box style={{ minHeight: '100vh', background: 'var(--mantine-color-body)' }}>
      {/* Navbar */}
      <Box style={{ borderBottom: '1px solid var(--mantine-color-default-border)', background: 'var(--mantine-color-body)', position: 'sticky', top: 0, zIndex: 100 }}>
        <Container size="lg" py="xs">
          <Group justify="space-between">
            <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => navigate({ to: '/gists' })}>
              <ThemeIcon size={28} variant="gradient" radius="md">
                <TbBrandGithub size={14} />
              </ThemeIcon>
              <Text fw={800} size="sm">Public Gists</Text>
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
        <Stack gap="lg">
          <Box>
            <Text size="xl" fw={800} mb={4}>Public Gists</Text>
            <Text size="sm" c="dimmed">Snippets dan konfigurasi yang dibagikan publik.</Text>
          </Box>

          <TextInput
            placeholder="Cari gist..."
            leftSection={<TbSearch size={14} />}
            value={q}
            onChange={e => setQ(e.currentTarget.value)}
            size="sm"
            rightSection={q ? (
              <ActionIcon size="xs" variant="subtle" onClick={() => setQ('')}>
                <TbX size={11} />
              </ActionIcon>
            ) : undefined}
          />

          {isLoading ? (
            <Stack gap="sm">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} height={100} radius="md" />)}
            </Stack>
          ) : gists.length === 0 ? (
            <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
              <ThemeIcon size={36} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
                <TbBrandGithub size={18} />
              </ThemeIcon>
              <Text size="sm" fw={500}>Belum ada gist publik</Text>
              <Text size="xs" c="dimmed">{q ? 'Coba kata kunci lain.' : 'Gist publik akan muncul di sini.'}</Text>
            </Box>
          ) : (
            <Stack gap="sm">
              {gists.map(g => (
                <GistPublicCard
                  key={g.id}
                  gist={g}
                  onClick={() => navigate({ to: '/gists/$id', params: { id: g.id } })}
                />
              ))}
              <div ref={sentinelRef} />
              {isFetchingNextPage && <Skeleton height={80} radius="md" />}
              {!hasNextPage && gists.length > 0 && (
                <Text size="xs" c="dimmed" ta="center">Semua gist sudah dimuat ({gists.length} total)</Text>
              )}
            </Stack>
          )}
        </Stack>
      </Container>
    </Box>
  )
}
