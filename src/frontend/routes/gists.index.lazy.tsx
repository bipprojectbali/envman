import {
  ActionIcon,
  Box,
  Container,
  Group,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useInfiniteQuery } from '@tanstack/react-query'
import { createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { TbBrandGithub, TbSearch, TbX } from 'react-icons/tb'
import { type PublicGist, GistPublicCard } from '@/frontend/components/gists/GistPublicCard'
import { GistPublicNavbar } from '@/frontend/components/gists/GistPublicNavbar'

export const Route = createLazyFileRoute('/gists/')({ component: PublicGistsPage })

function PublicGistsPage() {
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

  return (
    <Box style={{ minHeight: '100vh', background: 'var(--mantine-color-body)' }}>
      <GistPublicNavbar />

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
