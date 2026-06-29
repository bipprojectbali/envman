import { SimpleGrid, Skeleton, Stack } from '@mantine/core'

export function ProjectsLoadingSkeleton({ view }: { view: 'grid' | 'list' }) {
  if (view === 'grid') {
    return (
      <SimpleGrid cols={{ base: 1, xs: 2, lg: 3 }} spacing={{ base: 'xs', sm: 'sm' }}>
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={172} radius="md" />)}
      </SimpleGrid>
    )
  }
  return (
    <Stack gap="xs">
      {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={76} radius="md" />)}
    </Stack>
  )
}
