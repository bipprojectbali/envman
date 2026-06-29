import { ActionIcon, Badge, Box, Button, Divider, Group, Paper, Skeleton, Stack, Text, ThemeIcon } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useQueryClient } from '@tanstack/react-query'
import { createLazyFileRoute } from '@tanstack/react-router'
import { TbChevronLeft, TbTrash } from 'react-icons/tb'
import { GistDetailView } from '@/frontend/components/gists/GistDetailView'
import { GistForm } from '@/frontend/components/gists/GistForm'
import { GistListView } from '@/frontend/components/gists/GistListView'
import { absoluteTime, type Gist } from '@/frontend/components/gists/gist-types'
import { useGistsPage } from '@/frontend/hooks/useGistsPage'
import { apiFetch } from '@/frontend/lib/api'
import { getLangColor } from '@/frontend/lib/languages'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

export const Route = createLazyFileRoute('/envmanager/gists')({ component: GistsPage })

function GistsPage() {
  const { gist: gistParam, edit: editParam } = Route.useSearch()
  const qc = useQueryClient()

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

  const deleteGist = (g: Gist) => {
    const modalId = `delete-gist-${g.id}`
    modals.open({
      modalId,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md">
            <TbTrash size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">Hapus gist</Text>
        </Group>
      ),
      children: (
        <Stack gap="sm">
          <Text size="sm">Hapus gist <strong>{g.title}</strong>?</Text>
          <Box p="xs" bg="var(--mantine-color-default-hover)" style={{ border: '1px solid var(--mantine-color-default-border)' }}>
            <Group gap={4} mb={4}>
              {g.files.map((f) => (
                <Badge key={f.filename} size="xs" variant="dot" color={getLangColor(f.language)}>
                  {f.filename}
                </Badge>
              ))}
            </Group>
            <Text size="xs" c="dimmed">
              {g.files.length} file · dibuat {absoluteTime(g.createdAt)}
              {g.isPublic ? ' · public' : ' · private'}
            </Text>
          </Box>
          <Text size="xs" c="dimmed">Tindakan ini tidak dapat dibatalkan.</Text>
          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" color="gray" onClick={() => modals.close(modalId)}>Batal</Button>
            <Button
              color="red"
              leftSection={<TbTrash size={13} />}
              onClick={() =>
                apiFetch(`/api/envman/gists/${g.id}`, { method: 'DELETE' })
                  .then(() => {
                    qc.invalidateQueries({ queryKey: ['envman', 'gists', 'infinite'] })
                    notifyOk('Gist dihapus')
                    modals.close(modalId)
                  })
                  .catch(notifyErr)
              }
            >
              Hapus Permanen
            </Button>
          </Group>
        </Stack>
      ),
    })
  }

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
