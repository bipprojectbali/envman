import {
  ActionIcon,
  Box,
  Button,
  Container,
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
import {
  TbBrandGithub,
  TbLayoutDashboard,
  TbLogin,
  TbSearch,
  TbX,
} from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { type PublicGist, GistPublicCard } from '@/frontend/components/gists/GistPublicCard'
import { getDefaultRoute, useSession } from '@/frontend/hooks/useAuth'

export const Route = createLazyFileRoute('/gists/')({ component: PublicGistsPage })

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
      return fetch(`/api/public/gists?${params}`).then((r) => r.json()) as Promise<{
        gists: PublicGist[]
        nextCursor?: string
      }>
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
  })

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '200px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const gists = data?.pages.flatMap((p) => p.gists) ?? []

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
        <Stack gap="lg">
          <Box>
            <Text size="xl" fw={800} mb={4}>
              Public Gists
            </Text>
            <Text size="sm" c="dimmed">
              Snippets dan konfigurasi yang dibagikan publik.
            </Text>
          </Box>

          <TextInput
            placeholder="Cari gist..."
            leftSection={<TbSearch size={14} />}
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            size="sm"
            rightSection={
              q ? (
                <ActionIcon size="xs" variant="subtle" onClick={() => setQ('')}>
                  <TbX size={11} />
                </ActionIcon>
              ) : undefined
            }
            maw={540}
          />

          {isLoading ? (
            <Stack gap="sm">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={100} radius="md" />
              ))}
            </Stack>
          ) : gists.length === 0 ? (
            <Box
              p="xl"
              ta="center"
              style={{
                border: '1px dashed var(--mantine-color-default-border)',
                borderRadius: 'var(--mantine-radius-md)',
              }}
            >
              <ThemeIcon size={36} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
                <TbBrandGithub size={18} />
              </ThemeIcon>
              <Text size="sm" fw={500}>
                Belum ada gist publik
              </Text>
              <Text size="xs" c="dimmed">
                {q ? 'Coba kata kunci lain.' : 'Gist publik akan muncul di sini.'}
              </Text>
            </Box>
          ) : (
            <Stack gap="sm">
              {gists.map((g) => (
                <GistPublicCard
                  key={g.id}
                  gist={g}
                  onClick={() => navigate({ to: '/gists/$id', params: { id: g.id } })}
                />
              ))}
              <div ref={sentinelRef} />
              {isFetchingNextPage && <Skeleton height={80} radius="md" />}
              {!hasNextPage && gists.length > 0 && (
                <Text size="xs" c="dimmed" ta="center">
                  Semua gist sudah dimuat ({gists.length} total)
                </Text>
              )}
            </Stack>
          )}
        </Stack>
      </Container>
    </Box>
  )
}
