import { ActionIcon, Divider, Group, Paper, Skeleton, Stack, Text } from '@mantine/core'
import { createLazyFileRoute } from '@tanstack/react-router'
import { TbChevronLeft } from 'react-icons/tb'
import { GistDetailView } from '@/frontend/components/gists/GistDetailView'
import { GistForm } from '@/frontend/components/gists/GistForm'
import { GistListView } from '@/frontend/components/gists/GistListView'
import { useGistsPage } from '@/frontend/hooks/useGistsPage'
import { useDeleteGist } from '@/frontend/hooks/useDeleteGist'

export const Route = createLazyFileRoute('/envmanager/gists')({ component: GistsPage })

function GistsPage() {
  const { gist: gistParam, edit: editParam } = Route.useSearch()
  const { deleteGist } = useDeleteGist()

  const page = useGistsPage(gistParam, editParam)
  const {
    canCreateGist, canManageGist,
    selectedGist, isLoading,
    gists, allTags, filtered,
    view, setView, groupByTag, setGroupByTag,
    search, setSearch, searchRef,
    filter, setFilter, tagFilter, setTagFilter, sort, setSort,
    mineCount, publicCount, privateCount, hasFilterActive, resetFilter,
    addTagFilter, fetchNextPage, hasNextPage, isFetchingNextPage,
    goToList, goToNew, goToView, goToEdit,
  } = page

  // ─── Inline pages ─────────────────────────────────────────────────────────────

  if (gistParam === 'new') {
    return (
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group gap={6} align="center">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={goToList}>
              <TbChevronLeft size={15} />
            </ActionIcon>
            <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={goToList}>Gists</Text>
            <Text size="sm" c="dimmed">/</Text>
            <Text size="sm" fw={600}>Buat Gist Baru</Text>
          </Group>
          <Divider />
          <GistForm onClose={goToList} />
        </Stack>
      </Paper>
    )
  }

  if (gistParam && editParam && selectedGist) {
    return (
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group gap={6} align="center">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => goToView(gistParam)}>
              <TbChevronLeft size={15} />
            </ActionIcon>
            <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={goToList}>Gists</Text>
            <Text size="sm" c="dimmed">/</Text>
            <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={() => goToView(gistParam)} lineClamp={1}>
              {selectedGist.title}
            </Text>
            <Text size="sm" c="dimmed">/</Text>
            <Text size="sm" fw={600}>Edit</Text>
          </Group>
          <Divider />
          <GistForm gist={selectedGist} onClose={() => goToView(gistParam)} />
        </Stack>
      </Paper>
    )
  }

  if (gistParam && gistParam !== 'new') {
    if (isLoading || (!selectedGist && page.data === undefined)) {
      return (
        <Stack gap="md">
          <Group gap={6}><Skeleton h={22} w={22} radius="sm" /><Skeleton h={16} w={200} /></Group>
          <Skeleton h={300} radius="md" />
        </Stack>
      )
    }
    if (selectedGist) {
      return (
        <GistDetailView
          gist={selectedGist} onBack={goToList}
          isOwner={canManageGist(selectedGist.user.id)}
          onEdit={() => goToEdit(gistParam)}
        />
      )
    }
    return (
      <Stack gap="md">
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={goToList}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={goToList}>Gists</Text>
        </Group>
        <Text size="sm" c="dimmed">Gist tidak ditemukan.</Text>
      </Stack>
    )
  }

  return (
    <GistListView
      gists={gists} filtered={filtered} allTags={allTags} isLoading={isLoading}
      view={view} setView={setView} groupByTag={groupByTag} setGroupByTag={setGroupByTag}
      search={search} setSearch={setSearch} searchRef={searchRef}
      filter={filter} setFilter={setFilter} tagFilter={tagFilter} setTagFilter={setTagFilter}
      sort={sort} setSort={setSort}
      mineCount={mineCount} publicCount={publicCount} privateCount={privateCount}
      hasFilterActive={hasFilterActive} resetFilter={resetFilter}
      canCreateGist={canCreateGist} canManageGist={canManageGist} addTagFilter={addTagFilter}
      fetchNextPage={fetchNextPage} hasNextPage={hasNextPage} isFetchingNextPage={isFetchingNextPage}
      goToNew={goToNew} goToView={goToView} goToEdit={goToEdit} deleteGist={deleteGist}
    />
  )
}
