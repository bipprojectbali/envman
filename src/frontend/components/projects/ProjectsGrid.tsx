import { Badge, Box, Group, Pagination, SimpleGrid, Stack, Text } from '@mantine/core'
import { ProjectGridCard } from './ProjectGridCard'
import { ProjectListCard } from './ProjectListCard'
import { groupByPrimaryTag, tagColor } from '@/frontend/lib/project-utils'

interface PaginatedGroup { key: string; label: string | null; items: any[] }

interface Props {
  paginatedGroups: PaginatedGroup[]
  view: 'grid' | 'list'
  pinned: string[]
  groupByTag: boolean
  togglePin: (slug: string) => void
  openEditPage: (slug: string) => void
  deleteProject: (slug: string, name: string) => void
  confirmToggleActive: (slug: string, name: string, isActive: boolean) => void
  addTagFilter: (tag: string) => void
  openProject: (slug: string) => void
  page: number
  setPage: (p: number) => void
  totalPages: number
}

export function ProjectsGrid({ paginatedGroups, view, pinned, groupByTag, togglePin, openEditPage, deleteProject, confirmToggleActive, addTagFilter, openProject, page, setPage, totalPages }: Props) {
  return (
    <>
      <Stack gap="md">
        {paginatedGroups.map((group, gi) => (
          <Box key={group.key}>
            {group.label && (
              <Group gap="xs" mb="xs" mt={gi > 0 ? 4 : 0} align="center">
                <Text size="xs" fw={700} tt="uppercase" c={group.key === 'pinned' ? 'violet.6' : 'dimmed'} style={{ letterSpacing: '0.06em' }}>
                  {group.label}
                </Text>
                <Badge size="xs" variant="light" radius="sm" color={group.key === 'pinned' ? 'violet' : group.key === 'inactive' ? 'gray' : 'teal'}>
                  {group.items.length}
                </Badge>
                <Box style={{ flex: 1, height: 1, background: 'var(--mantine-color-default-border)' }} />
              </Group>
            )}
            {(() => {
              const tagGroups = groupByTag ? groupByPrimaryTag(group.items) : [{ tag: null, items: group.items }]
              const hasSubGroups = groupByTag && tagGroups.length > 1
              return (
                <Stack gap={hasSubGroups ? 'sm' : 'xs'}>
                  {tagGroups.map((tg) => (
                    <Box key={tg.tag ?? '__no_tag__'}>
                      {hasSubGroups && (
                        <Group gap="xs" mb="xs" align="center">
                          {tg.tag ? (
                            <Badge size="xs" variant="dot" color={tagColor(tg.tag)}>{tg.tag}</Badge>
                          ) : (
                            <Text size="xs" c="dimmed" fs="italic">no tag</Text>
                          )}
                          <Badge size="xs" variant="outline" radius="sm" color="gray">{tg.items.length}</Badge>
                          <Box style={{ flex: 1, height: 1, background: 'var(--mantine-color-default-border)', opacity: 0.5 }} />
                        </Group>
                      )}
                      {view === 'list' ? (
                        <Stack gap="xs">
                          {tg.items.map((p) => (
                            <ProjectListCard key={p.slug} project={p} isPinned={pinned.includes(p.slug)}
                              onPin={() => togglePin(p.slug)} onEdit={() => openEditPage(p.slug)}
                              onDelete={() => deleteProject(p.slug, p.name)}
                              onToggleActive={() => confirmToggleActive(p.slug, p.name, p.isActive)}
                              onTagClick={addTagFilter} onClick={() => openProject(p.slug)} />
                          ))}
                        </Stack>
                      ) : (
                        <SimpleGrid cols={{ base: 1, xs: 2, lg: 3 }} spacing={{ base: 'xs', sm: 'sm' }}>
                          {tg.items.map((p) => (
                            <ProjectGridCard key={p.slug} project={p} isPinned={pinned.includes(p.slug)}
                              onPin={() => togglePin(p.slug)} onEdit={() => openEditPage(p.slug)}
                              onDelete={() => deleteProject(p.slug, p.name)}
                              onToggleActive={() => confirmToggleActive(p.slug, p.name, p.isActive)}
                              onTagClick={addTagFilter} onClick={() => openProject(p.slug)} />
                          ))}
                        </SimpleGrid>
                      )}
                    </Box>
                  ))}
                </Stack>
              )
            })()}
          </Box>
        ))}
      </Stack>
      {totalPages > 1 && (
        <Group justify="center" mt="lg">
          <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      )}
    </>
  )
}
