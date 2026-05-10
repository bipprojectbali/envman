import { Button, Center, Loader, Stack, Text } from '@mantine/core'
import { useEffect, useRef, type ReactNode } from 'react'

interface InfiniteListProps {
  children: ReactNode
  fetchNextPage: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isLoading: boolean
  autoLoad?: boolean
}

export function InfiniteList({
  children,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  autoLoad = true,
}: InfiniteListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!autoLoad) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage() },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [autoLoad, hasNextPage, isFetchingNextPage, fetchNextPage])

  if (isLoading) {
    return <Center py="xl"><Loader size="sm" /></Center>
  }

  return (
    <Stack gap={0}>
      {children}
      <div ref={sentinelRef} />
      {isFetchingNextPage && <Center py="md"><Loader size="xs" /></Center>}
      {!hasNextPage && !isLoading && (
        <div />
      )}
      {hasNextPage && !autoLoad && (
        <Center mt="sm">
          <Button size="xs" variant="subtle" onClick={fetchNextPage} loading={isFetchingNextPage}>
            Muat lebih banyak
          </Button>
        </Center>
      )}
    </Stack>
  )
}
