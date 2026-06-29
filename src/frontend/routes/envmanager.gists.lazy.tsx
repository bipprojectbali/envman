import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Kbd,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core'
import { useDebouncedValue, useHotkeys, useLocalStorage, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useQueryClient } from '@tanstack/react-query'
import { createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { TbBrandGithub, TbChevronLeft, TbPlus, TbSearch, TbTag, TbTrash, TbX } from 'react-icons/tb'
import { InfiniteList } from '@/frontend/components/InfiniteList'
import { GistCard } from '@/frontend/components/gists/GistCard'
import { GistDetailView } from '@/frontend/components/gists/GistDetailView'
import { GistForm } from '@/frontend/components/gists/GistForm'
import { GistToolbar } from '@/frontend/components/gists/GistToolbar'
import { absoluteTime, type Gist } from '@/frontend/components/gists/gist-types'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { useGistsInfinite } from '@/frontend/hooks/useGistsInfinite'
import { apiFetch } from '@/frontend/lib/api'
import { getLangColor } from '@/frontend/lib/languages'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

export const Route = createLazyFileRoute('/envmanager/gists')({ component: GistsPage })

const HOVER_STYLES = `
.envman-gist-card {
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.15s ease;
}
.envman-gist-card:hover {
  transform: translateY(-1px);
  border-color: var(--mantine-color-primary);
  box-shadow: var(--mantine-shadow-sm);
}
.envman-gist-card:focus-visible {
  outline: 2px solid var(--mantine-color-primary);
  outline-offset: 2px;
  border-color: var(--mantine-color-primary);
}
.envman-gist-tag {
  cursor: pointer;
  transition: transform 0.1s ease;
}
.envman-gist-tag:hover {
  transform: scale(1.05);
}
`

function GistsPage() {
  const navigate = useNavigate()
  const { gist: gistParam, edit: editParam } = Route.useSearch()
  const { data: sessionData } = useSession()
  const myUserId = sessionData?.user?.id ?? ''
  const isSuperAdmin = sessionData?.user?.role === 'SUPER_ADMIN'
  const canCreateGist = hasCapability(sessionData?.user, 'gist:create')
  const canManageGist = (gistUserId: string) => gistUserId === myUserId || isSuperAdmin
  const qc = useQueryClient()
  const _isMobile = useMediaQuery('(max-width: 48em)')

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useLocalStorage<'all' | 'mine' | 'public' | 'private'>({
    key: 'envman:gists:filter',
    defaultValue: 'all',
  })
  const [tagFilter, setTagFilter] = useLocalStorage<string[]>({ key: 'envman:gists:tagFilter', defaultValue: [] })
  const [sort, setSort] = useLocalStorage<'updated' | 'created'>({ key: 'envman:gists:sort', defaultValue: 'updated' })
  const [view, setView] = useLocalStorage<'list' | 'grid'>({ key: 'envman:gists:view', defaultValue: 'list' })
  const [groupByTag, setGroupByTag] = useLocalStorage<boolean>({ key: 'envman:gists:groupByTag', defaultValue: true })
  const [debouncedSearch] = useDebouncedValue(search, 150)
  const searchRef = useRef<HTMLInputElement>(null)

  useHotkeys([['/', () => { searchRef.current?.focus(); searchRef.current?.select() }]])

  const addTagFilter = (tag: string) => setTagFilter((prev) => (prev.includes(tag) ? prev : [...prev, tag]))

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useGistsInfinite()
  const gists: Gist[] = useMemo(() => data?.pages.flatMap((p) => p.gists) ?? [], [data])
  const allTags = useMemo(() => [...new Set(gists.flatMap((g) => g.tags))].sort(), [gists])

  const filtered = useMemo(() => {
    let list = [...gists]
    if (filter === 'mine') list = list.filter((g) => g.user.id === myUserId)
    if (filter === 'public') list = list.filter((g) => g.isPublic)
    if (filter === 'private') list = list.filter((g) => !g.isPublic && g.user.id === myUserId)
    if (tagFilter.length > 0) list = list.filter((g) => tagFilter.every((t) => g.tags.includes(t)))
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.description.toLowerCase().includes(q) ||
          g.files.some((f) => f.filename.toLowerCase().includes(q) || f.content.toLowerCase().includes(q)) ||
          g.tags.some((t) => t.includes(q)),
      )
    }
    list.sort((a, b) =>
      sort === 'updated'
        ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    return list
  }, [gists, filter, tagFilter, debouncedSearch, sort, myUserId])

  const goToList = () => navigate({ to: '/envmanager/gists', search: { gist: undefined, edit: undefined } })
  const goToNew = () => navigate({ to: '/envmanager/gists', search: { gist: 'new', edit: undefined } })
  const goToView = (id: string) => navigate({ to: '/envmanager/gists', search: { gist: id, edit: undefined } })
  const goToEdit = (id: string) => navigate({ to: '/envmanager/gists', search: { gist: id, edit: true } })

  const selectedGist = gistParam && gistParam !== 'new' ? gists.find((g) => g.id === gistParam) : undefined

  // ─── Inline pages (early return) ─────────────────────────────────────────────

  if (gistParam === 'new') {
    return (
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group gap={6} align="center">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={goToList}>
              <TbChevronLeft size={15} />
            </ActionIcon>
            <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={goToList}>
              Gists
            </Text>
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
    if (isLoading || (!selectedGist && data === undefined)) {
      return (
        <Stack gap="md">
          <Group gap={6}>
            <Skeleton h={22} w={22} radius="sm" />
            <Skeleton h={16} w={200} />
          </Group>
          <Skeleton h={300} radius="md" />
        </Stack>
      )
    }
    if (selectedGist) {
      return (
        <GistDetailView
          gist={selectedGist}
          onBack={goToList}
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

  // ─── Delete modal ─────────────────────────────────────────────────────────────

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
          <Text size="sm">
            Hapus gist <strong>{g.title}</strong>?
          </Text>
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

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const mineCount = gists.filter((g) => g.user.id === myUserId).length
  const publicCount = gists.filter((g) => g.isPublic).length
  const privateCount = gists.filter((g) => !g.isPublic && g.user.id === myUserId).length
  const hasFilter = debouncedSearch.trim().length > 0 || tagFilter.length > 0 || filter !== 'all'
  const resetFilter = () => { setSearch(''); setTagFilter([]); setFilter('all') }

  const renderCards = (list: typeof filtered) =>
    view === 'list' ? (
      <Stack gap="xs">
        {list.map((g) => (
          <GistCard
            key={g.id}
            gist={g}
            isOwner={canManageGist(g.user.id)}
            onView={() => goToView(g.id)}
            onEdit={() => goToEdit(g.id)}
            onDelete={() => deleteGist(g)}
            onTagClick={addTagFilter}
          />
        ))}
      </Stack>
    ) : (
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
        {list.map((g) => (
          <GistCard
            key={g.id}
            gist={g}
            isOwner={canManageGist(g.user.id)}
            onView={() => goToView(g.id)}
            onEdit={() => goToEdit(g.id)}
            onDelete={() => deleteGist(g)}
            onTagClick={addTagFilter}
          />
        ))}
      </SimpleGrid>
    )

  return (
    <Box>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      {/* Header */}
      <Group mb="md" justify="space-between" wrap="nowrap" align="flex-start">
        <Group gap="sm" style={{ minWidth: 0 }}>
          <ThemeIcon size={38} radius="md" variant="light" color="primary">
            <TbBrandGithub size={20} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={700} size="lg" lh={1.2}>Gists</Text>
            {isLoading ? (
              <Text size="xs" c="dimmed" mt={2}>Memuat...</Text>
            ) : gists.length === 0 ? (
              <Text size="xs" c="dimmed" mt={2}>Snippets, config, atau script untuk tim</Text>
            ) : (
              <Group gap={4} mt={2} wrap="wrap">
                <Text size="xs" c="dimmed">{gists.length} gist</Text>
                <Text size="xs" c="dimmed">·</Text>
                <Text size="xs" c="dimmed">{publicCount} public</Text>
                <Text size="xs" c="dimmed">·</Text>
                <Text size="xs" c="dimmed">{mineCount} milik saya</Text>
              </Group>
            )}
          </Box>
        </Group>
        {canCreateGist && (
          <Button type="button" size="sm" color="primary" leftSection={<TbPlus size={14} />} onClick={goToNew}>
            New Gist
          </Button>
        )}
      </Group>

      {/* Info */}
      {!isLoading && (
        <Alert variant="light" color="blue" mb="md" p="sm" radius="md" icon={<TbBrandGithub size={16} />}>
          <Text size="sm" fw={500} mb={4}>Apa itu Gists?</Text>
          <Text size="xs" c="dimmed" lh={1.6}>
            Gists adalah tempat menyimpan <strong>snippet, config, atau script</strong> yang bisa diakses oleh tim.
            Setiap gist bisa berisi satu atau beberapa file dengan syntax highlighting. Gist <strong>Public</strong>{' '}
            terlihat oleh semua member; <strong>Private</strong> hanya terlihat oleh pembuatnya. Gunakan{' '}
            <Kbd size="xs">K</Kbd> untuk membuka pencarian, atau klik <strong>New Gist</strong> untuk mulai membuat.
          </Text>
        </Alert>
      )}

      {/* Toolbar */}
      {!isLoading && gists.length > 0 && (
        <GistToolbar
          searchRef={searchRef}
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={setFilter}
          tagFilter={tagFilter}
          onTagFilterChange={setTagFilter}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
          groupByTag={groupByTag}
          onGroupByTagToggle={() => setGroupByTag((v) => !v)}
          allTags={allTags}
          totalCount={gists.length}
          filteredCount={filtered.length}
          mineCount={mineCount}
          publicCount={publicCount}
          privateCount={privateCount}
          hasFilter={hasFilter}
          onReset={resetFilter}
        />
      )}

      {/* List */}
      {isLoading ? (
        view === 'grid' ? (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} height={160} radius="md" />
            ))}
          </SimpleGrid>
        ) : (
          <Stack gap="xs">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={120} radius="md" />
            ))}
          </Stack>
        )
      ) : gists.length === 0 ? (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="primary" mx="auto" mb="sm">
            <TbBrandGithub size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Belum ada gists</Text>
          <Text size="sm" c="dimmed" mb="md" maw={420} mx="auto">
            Gist untuk simpan snippets kode, config file, atau script yang sering dipakai. Dukung Markdown, syntax
            highlighting, dan multi-file.
          </Text>
          {canCreateGist ? (
            <Button type="button" size="sm" color="primary" leftSection={<TbPlus size={14} />} onClick={goToNew}>
              Buat Gist Pertama
            </Button>
          ) : (
            <Text size="xs" c="dimmed">Tidak punya izin create gist. Hubungi SUPER_ADMIN.</Text>
          )}
        </Box>
      ) : filtered.length === 0 ? (
        <Box p="md" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
          <ThemeIcon size={44} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
            <TbSearch size={22} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Tidak ada hasil</Text>
          <Text size="sm" c="dimmed" mb="md">Tidak ada gist yang cocok dengan filter saat ini.</Text>
          <Button type="button" size="xs" variant="subtle" leftSection={<TbX size={11} />} onClick={resetFilter}>
            Reset filter
          </Button>
        </Box>
      ) : (
        <InfiniteList
          fetchNextPage={fetchNextPage}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isLoading={isLoading}
        >
          {(() => {
            if (!groupByTag || allTags.length === 0) return renderCards(filtered)

            const grouped = new Map<string, typeof filtered>()
            const untagged: typeof filtered = []
            for (const g of filtered) {
              if (g.tags.length === 0) { untagged.push(g); continue }
              const tag = g.tags[0]
              if (!grouped.has(tag)) grouped.set(tag, [])
              grouped.get(tag)!.push(g)
            }
            const groups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
            return (
              <Stack gap="md">
                {groups.map(([tag, items]) => (
                  <Stack key={tag} gap="xs">
                    <Group gap={6} align="center">
                      <Badge size="xs" variant="filled" color="grape" leftSection={<TbTag size={9} />}>
                        {tag}
                      </Badge>
                      <Divider style={{ flex: 1 }} />
                    </Group>
                    {renderCards(items)}
                  </Stack>
                ))}
                {untagged.length > 0 && (
                  <Stack gap="xs">
                    <Group gap={6} align="center">
                      <Text size="xs" c="dimmed" fw={500}>Tanpa tag</Text>
                      <Divider style={{ flex: 1 }} />
                    </Group>
                    {renderCards(untagged)}
                  </Stack>
                )}
              </Stack>
            )
          })()}
        </InfiniteList>
      )}
    </Box>
  )
}
