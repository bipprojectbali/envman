import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Code,
  CopyButton,
  Divider,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import {
  TbCheck,
  TbChevronLeft,
  TbChevronRight,
  TbCopy,
  TbInfoCircle,
  TbLayoutGrid,
  TbLayoutList,
  TbLock,
  TbPencil,
  TbPlus,
  TbSearch,
  TbTag,
  TbTerminal2,
  TbTrash,
} from 'react-icons/tb'
import { MultiSelectChips, MultiSelectChipsRow } from '@/frontend/components/MultiSelectChips'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { AliasDetail } from './AliasDetail'
import { AliasForm } from './AliasForm'
import type { Alias } from './alias-types'

export interface AliasesPanelProps {
  slug: string
  isOwner: boolean
}

export function AliasesPanel({ slug, isOwner }: AliasesPanelProps) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { tab, fileId, fileNew, viewFileId, aliasId, aliasNew, viewAliasId, noteId, noteNew, viewNoteId } = useSearch({
    from: '/envmanager/$slug/',
  })
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useLocalStorage<string[]>({
    key: `envman:aliases:${slug}:tagFilter`,
    defaultValue: [],
  })
  const [view, setView] = useLocalStorage<'list' | 'grid'>({
    key: `envman:aliases:${slug}:view`,
    defaultValue: 'list',
  })
  const [groupByTag, setGroupByTag] = useLocalStorage<boolean>({
    key: `envman:aliases:${slug}:groupByTag`,
    defaultValue: true,
  })

  const { data, isLoading } = useQuery<{ aliases: Alias[] }>({
    queryKey: ['envman', 'aliases', slug],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/aliases`),
    staleTime: 60_000,
  })

  const aliases = data?.aliases ?? []

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of aliases) for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: `${value} (${count})` }))
  }, [aliases])

  const filtered = useMemo(() => {
    let list = [...aliases]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.args.toLowerCase().includes(q) ||
          (a.description?.toLowerCase().includes(q) ?? false) ||
          a.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    if (tagFilter.length > 0) list = list.filter((a) => tagFilter.every((t) => a.tags.includes(t)))
    return list
  }, [aliases, search, tagFilter])

  const remove = useMutation({
    mutationFn: (name: string) => apiFetch(`/api/envman/projects/${slug}/aliases/${name}`, { method: 'DELETE' }),
    onSuccess: (_, name) => {
      qc.invalidateQueries({ queryKey: ['envman', 'aliases', slug] })
      notifyOk(`Alias "${name}" dihapus`)
    },
    onError: (e) => notifyErr(e),
  })

  const navBase = { tab, fileId, fileNew, viewFileId, noteId, noteNew, viewNoteId }

  const openView = (id: string) =>
    navigate({ to: '/envmanager/$slug', params: { slug }, search: { ...navBase, aliasId: undefined, aliasNew: false, viewAliasId: id } })
  const closeView = () =>
    navigate({ to: '/envmanager/$slug', params: { slug }, search: { ...navBase, aliasId: undefined, aliasNew: false, viewAliasId: undefined } })
  const openEdit = (alias: Alias) =>
    navigate({ to: '/envmanager/$slug', params: { slug }, search: { ...navBase, aliasId: alias.id, aliasNew: false, viewAliasId: undefined } })
  const openCreate = () =>
    navigate({ to: '/envmanager/$slug', params: { slug }, search: { ...navBase, aliasId: undefined, aliasNew: true, viewAliasId: undefined } })
  const closeForm = () =>
    navigate({ to: '/envmanager/$slug', params: { slug }, search: { ...navBase, aliasId: undefined, aliasNew: false, viewAliasId: undefined } })

  const confirmDelete = (alias: Alias) => {
    modals.openConfirmModal({
      title: `Hapus alias "${alias.name}"?`,
      children: (
        <Text size="sm" c="dimmed">
          Perintah yang tersimpan tidak bisa dipulihkan. CLI yang menggunakan alias ini akan berhenti bekerja.
        </Text>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(alias.name),
    })
  }

  const formOpen = aliasNew || !!aliasId

  if (viewAliasId) {
    const alias = aliases.find((a) => a.id === viewAliasId)
    if (!alias) return null
    return <AliasDetail alias={alias} slug={slug} isOwner={isOwner} onClose={closeView} onEdit={openEdit} onDelete={confirmDelete} />
  }

  if (formOpen) {
    const editingAlias = aliasId ? (aliases.find((a) => a.id === aliasId) ?? null) : null
    return (
      <Stack gap="lg">
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={closeForm}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={closeForm}>
            Aliases
          </Anchor>
          <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
          <Text size="sm" fw={600}>
            {aliasId ? (editingAlias ? `Edit: ${editingAlias.name}` : '...') : 'Tambah Alias Baru'}
          </Text>
        </Group>
        <Divider />
        {isLoading && aliasId ? (
          <Skeleton height={200} radius="md" />
        ) : (
          <AliasForm slug={slug} editing={editingAlias} onClose={closeForm} />
        )}
      </Stack>
    )
  }

  const renderCards = () => {
    const cards = filtered.map((alias) => (
      <Box
        key={alias.id}
        p="sm"
        role="button"
        tabIndex={0}
        style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)', cursor: 'pointer' }}
        onClick={() => openView(alias.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') openView(alias.id) }}
      >
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Code fz="sm" fw={700}>{alias.name}</Code>
              {alias.deniedEnvs && alias.deniedEnvs.length > 0 && (
                <Tooltip
                  label={`Butuh akses ke env: ${alias.deniedEnvs.map((d) => `${d.project}:${d.env}`).join(', ')}`}
                  withArrow multiline w={240}
                >
                  <Badge size="xs" color="red" variant="light" leftSection={<TbLock size={9} />}>
                    needs {alias.deniedEnvs.map((d) => d.env).join(', ')}
                  </Badge>
                </Tooltip>
              )}
              {!alias.deniedEnvs?.length && (
                <CopyButton value={`envman run ${slug}:${alias.name}`} timeout={2000}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Disalin!' : `Salin: envman run ${slug}:${alias.name}`} withArrow>
                      <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                        {copied ? <TbCheck size={12} /> : <TbCopy size={12} />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              )}
              {alias.tags.length > 0 && (
                <Group gap={4} wrap="wrap" onClick={(e) => e.stopPropagation()}>
                  {alias.tags.map((tag) => (
                    <Badge
                      key={tag}
                      size="xs"
                      variant="light"
                      color="blue"
                      style={{ cursor: 'pointer' }}
                      onClick={() => !tagFilter.includes(tag) && setTagFilter((f) => [...f, tag])}
                    >
                      {tag}
                    </Badge>
                  ))}
                </Group>
              )}
            </Group>
            <Group gap={4} wrap="nowrap" align="flex-start">
              <Code block fz="xs" style={{ wordBreak: 'break-all', flex: 1 }}>envman {alias.args}</Code>
              <CopyButton value={`envman ${alias.args}`} timeout={2000}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Disalin!' : 'Salin perintah'} withArrow>
                    <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                      {copied ? <TbCheck size={14} /> : <TbCopy size={14} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
            {alias.description && <Text size="xs" c="dimmed">{alias.description}</Text>}
            <Text size="xs" c="dimmed">
              dibuat oleh {alias.creator.name} ·{' '}
              {new Date(alias.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </Stack>

          {isOwner && (
            <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              <Tooltip label="Edit alias" withArrow>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => openEdit(alias)}>
                  <TbPencil size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Hapus alias" withArrow>
                <ActionIcon size="sm" variant="subtle" color="red" onClick={() => confirmDelete(alias)}>
                  <TbTrash size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
        </Group>
      </Box>
    ))

    if (groupByTag && allTags.length > 0) {
      const grouped = new Map<string, typeof filtered>()
      const untagged: typeof filtered = []
      for (const a of filtered) {
        if (a.tags.length === 0) { untagged.push(a); continue }
        const tag = a.tags[0]
        if (!grouped.has(tag)) grouped.set(tag, [])
        grouped.get(tag)!.push(a)
      }
      const groups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
      const cardsByName = new Map(filtered.map((a, i) => [a.name, cards[i]]))
      const renderGroup = (items: typeof filtered) =>
        view === 'grid' ? (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs">{items.map((a) => cardsByName.get(a.name))}</SimpleGrid>
        ) : (
          items.map((a) => cardsByName.get(a.name))
        )
      return (
        <Stack gap="md">
          {groups.map(([tag, items]) => (
            <Stack key={tag} gap="xs">
              <Group gap={6} align="center">
                <Badge size="xs" variant="filled" color="grape" leftSection={<TbTag size={9} />}>{tag}</Badge>
                <Divider style={{ flex: 1 }} />
              </Group>
              {renderGroup(items)}
            </Stack>
          ))}
          {untagged.length > 0 && (
            <Stack gap="xs">
              <Group gap={6} align="center">
                <Text size="xs" c="dimmed" fw={500}>Tanpa tag</Text>
                <Divider style={{ flex: 1 }} />
              </Group>
              {renderGroup(untagged)}
            </Stack>
          )}
        </Stack>
      )
    }
    return view === 'grid' ? (
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs">{cards}</SimpleGrid>
    ) : cards
  }

  return (
    <Stack gap="xs">
      <TextInput
        size="sm"
        placeholder="Cari alias, args, atau tags..."
        leftSection={<TbSearch size={13} />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        radius="md"
        maw={540}
      />
      <Group justify="space-between" wrap="wrap" gap="xs">
        <MultiSelectChips
          value={tagFilter}
          onChange={setTagFilter}
          options={allTags}
          label="Tags"
          icon={<TbTag size={12} />}
          width={120}
          disabled={allTags.length === 0}
        />
        <Group gap="xs" wrap="nowrap">
          <Group gap={4}>
            <Tooltip label="List view" withArrow>
              <ActionIcon size="sm" variant={view === 'list' ? 'filled' : 'subtle'} color="blue" onClick={() => setView('list')}>
                <TbLayoutList size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Grid view" withArrow>
              <ActionIcon size="sm" variant={view === 'grid' ? 'filled' : 'subtle'} color="blue" onClick={() => setView('grid')}>
                <TbLayoutGrid size={14} />
              </ActionIcon>
            </Tooltip>
            {allTags.length > 0 && (
              <Tooltip label={groupByTag ? 'Nonaktifkan group by tag' : 'Group by tag'} withArrow>
                <ActionIcon
                  size="sm"
                  variant={groupByTag ? 'filled' : 'subtle'}
                  color={groupByTag ? 'grape' : 'gray'}
                  onClick={() => setGroupByTag((v) => !v)}
                >
                  <TbTag size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
          {isOwner && (
            <Button variant="light" size="sm" leftSection={<TbPlus size={14} />} onClick={openCreate}>
              Tambah alias
            </Button>
          )}
        </Group>
      </Group>

      {tagFilter.length > 0 && <MultiSelectChipsRow value={tagFilter} onChange={setTagFilter} />}

      <Alert
        variant="light"
        color="blue"
        radius="md"
        p="xs"
        icon={<TbInfoCircle size={15} />}
        styles={{ message: { fontSize: 'var(--mantine-font-size-xs)' }, body: { gap: 4 } }}
      >
        Alias menyimpan perintah lengkap agar bisa dijalankan singkat dari terminal. Jalankan dengan:{' '}
        <Code fz="xs">envman run {slug}:nama-alias</Code>. Bisa menyertakan multi-source env, flags, dan perintah apapun.
      </Alert>

      {isLoading && (
        <Stack gap="xs">
          {[0, 1, 2].map((i) => <Skeleton key={i} height={80} radius="md" />)}
        </Stack>
      )}

      {!isLoading && aliases.length === 0 && (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="blue" mx="auto" mb="sm">
            <TbTerminal2 size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Belum ada alias</Text>
          <Text size="sm" c="dimmed" maw={420} mx="auto" mb={isOwner ? 'md' : 0}>
            Alias menyimpan perintah panjang supaya bisa dipanggil singkat via{' '}
            <Code fz="xs">envman run {slug}:nama-alias</Code>.
          </Text>
          {isOwner && (
            <Button size="xs" leftSection={<TbPlus size={14} />} onClick={openCreate} variant="light">
              Buat alias pertama
            </Button>
          )}
        </Box>
      )}

      {!isLoading && aliases.length > 0 && filtered.length === 0 && (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
          <ThemeIcon size={44} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
            <TbSearch size={22} />
          </ThemeIcon>
          <Text fw={500} size="sm" mb={4}>Tidak ada alias yang cocok</Text>
          <Text size="xs" c="dimmed">Coba ubah filter atau kata kunci pencarian.</Text>
        </Box>
      )}

      {!isLoading && filtered.length > 0 && renderCards()}
    </Stack>
  )
}
