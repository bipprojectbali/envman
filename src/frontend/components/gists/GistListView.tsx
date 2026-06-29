import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Kbd,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core'
import { TbBrandGithub, TbPlus, TbSearch, TbTag, TbX } from 'react-icons/tb'
import { InfiniteList } from '@/frontend/components/InfiniteList'
import { GistCard } from '@/frontend/components/gists/GistCard'
import { GistToolbar } from '@/frontend/components/gists/GistToolbar'
import type { Gist } from '@/frontend/components/gists/gist-types'

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

interface GistListViewProps {
  gists: Gist[]
  filtered: Gist[]
  allTags: string[]
  isLoading: boolean
  view: 'list' | 'grid'
  setView: (v: 'list' | 'grid') => void
  groupByTag: boolean
  setGroupByTag: (v: boolean) => void
  search: string
  setSearch: (s: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  filter: 'all' | 'mine' | 'public' | 'private'
  setFilter: (v: 'all' | 'mine' | 'public' | 'private') => void
  tagFilter: string[]
  setTagFilter: (v: string[]) => void
  sort: 'updated' | 'created'
  setSort: (v: 'updated' | 'created') => void
  mineCount: number
  publicCount: number
  privateCount: number
  hasFilterActive: boolean
  resetFilter: () => void
  canCreateGist: boolean
  canManageGist: (userId: string) => boolean
  addTagFilter: (tag: string) => void
  fetchNextPage: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  goToNew: () => void
  goToView: (id: string) => void
  goToEdit: (id: string) => void
  deleteGist: (g: Gist) => void
}

export function GistListView({
  gists, filtered, allTags, isLoading,
  view, setView, groupByTag, setGroupByTag,
  search, setSearch, searchRef,
  filter, setFilter, tagFilter, setTagFilter, sort, setSort,
  mineCount, publicCount, privateCount, hasFilterActive, resetFilter,
  canCreateGist, canManageGist, addTagFilter,
  fetchNextPage, hasNextPage, isFetchingNextPage,
  goToNew, goToView, goToEdit, deleteGist,
}: GistListViewProps) {
  {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover */}

  const renderCards = (list: Gist[]) =>
    view === 'list' ? (
      <Stack gap="xs">
        {list.map((g) => (
          <GistCard
            key={g.id} gist={g} isOwner={canManageGist(g.user.id)}
            onView={() => goToView(g.id)} onEdit={() => goToEdit(g.id)}
            onDelete={() => deleteGist(g)} onTagClick={addTagFilter}
          />
        ))}
      </Stack>
    ) : (
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
        {list.map((g) => (
          <GistCard
            key={g.id} gist={g} isOwner={canManageGist(g.user.id)}
            onView={() => goToView(g.id)} onEdit={() => goToEdit(g.id)}
            onDelete={() => deleteGist(g)} onTagClick={addTagFilter}
          />
        ))}
      </SimpleGrid>
    )

  return (
    <Box>
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

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

      {!isLoading && gists.length > 0 && (
        <GistToolbar
          searchRef={searchRef}
          search={search} onSearchChange={setSearch}
          filter={filter} onFilterChange={setFilter}
          tagFilter={tagFilter} onTagFilterChange={setTagFilter}
          sort={sort} onSortChange={setSort}
          view={view} onViewChange={setView}
          groupByTag={groupByTag} onGroupByTagToggle={() => setGroupByTag(!groupByTag)}
          allTags={allTags}
          totalCount={gists.length} filteredCount={filtered.length}
          mineCount={mineCount} publicCount={publicCount} privateCount={privateCount}
          hasFilter={hasFilterActive} onReset={resetFilter}
        />
      )}

      {isLoading ? (
        view === 'grid' ? (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={160} radius="md" />)}
          </SimpleGrid>
        ) : (
          <Stack gap="xs">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={120} radius="md" />)}
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

            const grouped = new Map<string, Gist[]>()
            const untagged: Gist[] = []
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
