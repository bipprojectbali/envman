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
  Pagination,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDebouncedValue, useLocalStorage } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  TbCheck,
  TbChevronLeft,
  TbChevronRight,
  TbCopy,
  TbEdit,
  TbFileCode,
  TbFiles,
  TbInfoCircle,
  TbLayoutGrid,
  TbLayoutList,
  TbPlus,
  TbSearch,
  TbSortAscending,
  TbTag,
  TbTrash,
  TbX,
} from 'react-icons/tb'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { MultiSelectChips, MultiSelectChipsRow } from '@/frontend/components/MultiSelectChips'
import { apiFetch } from '@/frontend/lib/api'
import { getLangColor } from '@/frontend/lib/languages'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { FileCard, HOVER_STYLES, absoluteTime, relTime } from './FileCard'
import { FileForm, type ProjectFile } from './FileForm'

export interface FilesPanelProps {
  slug: string
  isOwner: boolean
  myUserId: string
  canEdit: boolean
}

export function FilesPanel({ slug, isOwner, myUserId, canEdit }: FilesPanelProps) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)
  const { tab, fileId, fileNew, viewFileId } = useSearch({ from: '/envmanager/$slug/' })

  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useLocalStorage<string[]>({ key: `envman:files:${slug}:tagFilter`, defaultValue: [] })
  const [sort, setSort] = useLocalStorage<'updated' | 'created'>({ key: `envman:files:${slug}:sort`, defaultValue: 'updated' })
  const [groupByTag, setGroupByTag] = useLocalStorage<boolean>({ key: `envman:files:${slug}:groupByTag`, defaultValue: true })
  const [view, setView] = useLocalStorage<'list' | 'grid'>({ key: `envman:files:${slug}:view`, defaultValue: 'list' })
  const [debouncedSearch] = useDebouncedValue(search, 150)
  const [activeViewTab, setActiveViewTab] = useState(0)

  const navBase = { tab, fileId: undefined as string | undefined, fileNew: false, viewFileId: undefined as string | undefined, aliasId: undefined as string | undefined, aliasNew: false, viewAliasId: undefined as string | undefined, noteId: undefined as string | undefined, noteNew: false, viewNoteId: undefined as string | undefined }
  const navTo = (extra: Partial<typeof navBase>) => navigate({ to: '/envmanager/$slug', params: { slug }, search: { ...navBase, ...extra } })

  const openView = (id: string) => navTo({ viewFileId: id })
  const closeView = () => navTo({})
  const closeForm = () => navTo({})
  const openEdit = (f: ProjectFile) => navTo({ fileId: f.id })
  const openCreate = () => navTo({ fileNew: true })
  const addTagFilter = (tag: string) => setTagFilter((prev) => (prev.includes(tag) ? prev : [...prev, tag]))

  const { data, isLoading, isError } = useQuery<{ files: ProjectFile[] }>({
    queryKey: ['envman', 'files', slug],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/files`),
    staleTime: 60_000,
  })
  const files = data?.files ?? []
  const editingFile = fileId ? (files.find((f) => f.id === fileId) ?? null) : null
  const formOpen = fileNew || !!editingFile

  const allTags = useMemo(() => [...new Set(files.flatMap((f) => f.tags))].sort(), [files])

  const filtered = useMemo(() => {
    let list = [...files]
    if (tagFilter.length > 0) list = list.filter((f) => tagFilter.every((t) => f.tags.includes(t)))
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q) ||
          f.files.some((e) => e.filename.toLowerCase().includes(q) || e.content.toLowerCase().includes(q)) ||
          f.tags.some((t) => t.includes(q)),
      )
    }
    list.sort((a, b) =>
      sort === 'updated'
        ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    return list
  }, [files, tagFilter, debouncedSearch, sort])

  const FILES_PER_PAGE = 12
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [])
  const totalPages = Math.ceil(filtered.length / FILES_PER_PAGE)
  const paginated = filtered.slice((page - 1) * FILES_PER_PAGE, page * FILES_PER_PAGE)
  const canManageFile = (authorId: string) => isOwner || authorId === myUserId

  const deleteFile = (f: ProjectFile) => {
    const modalId = `delete-file-${f.id}`
    modals.open({
      modalId,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md"><TbTrash size={13} /></ThemeIcon>
          <Text fw={600} size="sm">Hapus file</Text>
        </Group>
      ),
      children: (
        <Stack gap="sm">
          <Text size="sm">Hapus <strong>{f.title}</strong>?</Text>
          <Box p="xs" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', background: 'var(--mantine-color-default-hover)' }}>
            <Group gap={4} mb={4}>
              {f.files.map((e) => <Badge key={e.filename} size="xs" variant="dot" color={getLangColor(e.language)}>{e.filename}</Badge>)}
            </Group>
            <Text size="xs" c="dimmed">{f.files.length} file · dibuat {absoluteTime(f.createdAt)}</Text>
          </Box>
          <Text size="xs" c="dimmed">Tindakan ini tidak dapat dibatalkan.</Text>
          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" color="gray" onClick={() => modals.close(modalId)}>Batal</Button>
            <Button color="red" leftSection={<TbTrash size={13} />}
              onClick={() => apiFetch(`/api/envman/projects/${slug}/files/${f.id}`, { method: 'DELETE' })
                .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'files', slug] }); notifyOk('File dihapus'); modals.close(modalId) })
                .catch(notifyErr)}>
              Hapus Permanen
            </Button>
          </Group>
        </Stack>
      ),
    })
  }

  if (viewFileId) {
    const viewingFile = isLoading ? null : (files.find((f) => f.id === viewFileId) ?? null)
    const currentViewFile = viewingFile?.files[activeViewTab] ?? viewingFile?.files[0]
    return (
      <Stack gap="lg">
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={closeView}><TbChevronLeft size={15} /></ActionIcon>
          <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={closeView}>Files</Anchor>
          <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
          <Text size="sm" fw={600} lineClamp={1}>{viewingFile?.title ?? '...'}</Text>
        </Group>
        <Divider />
        {isLoading && <Skeleton height={300} radius="md" />}
        {!isLoading && !viewingFile && <Text size="sm" c="dimmed">File tidak ditemukan.</Text>}
        {viewingFile && (
          <Stack gap="sm">
            {viewingFile.description && <Text size="sm" c="dimmed">{viewingFile.description}</Text>}
            <Tabs value={String(activeViewTab)} onChange={(v) => setActiveViewTab(Number(v))} variant="outline">
              <Tabs.List>
                {viewingFile.files.map((f, i) => (
                  <Tabs.Tab key={f.filename} value={String(i)} leftSection={<TbFileCode size={12} />}>
                    <Group gap={4}><Text size="xs">{f.filename}</Text><Badge size="xs" variant="dot" color={getLangColor(f.language)}>{f.language}</Badge></Group>
                  </Tabs.Tab>
                ))}
              </Tabs.List>
              {viewingFile.files.map((f, i) => (
                <Tabs.Panel key={f.filename} value={String(i)} pt="xs">
                  <Box p="md" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', maxHeight: 500, overflowY: 'auto' }}>
                    <MarkdownRenderer fontSize={13}>
                      {f.language === 'markdown' ? f.content || '_Kosong_' : `\`\`\`${f.language}\n${f.content || ''}\n\`\`\``}
                    </MarkdownRenderer>
                  </Box>
                </Tabs.Panel>
              ))}
            </Tabs>
            <Group gap={4} wrap="wrap">
              {viewingFile.tags.map((t) => <Badge key={t} size="xs" variant="outline" color="gray">{t}</Badge>)}
              <Text size="xs" c="dimmed" ml="auto">oleh {viewingFile.author.name} · {relTime(viewingFile.updatedAt)}</Text>
            </Group>
            <Divider />
            <Group justify="space-between">
              <CopyButton value={currentViewFile?.content ?? ''} timeout={2000}>
                {({ copied, copy }) => (
                  <Button type="button" size="xs" variant="subtle" color={copied ? 'teal' : 'gray'}
                    leftSection={copied ? <TbCheck size={13} /> : <TbCopy size={13} />} onClick={copy}>
                    {copied ? 'Tersalin!' : `Copy ${currentViewFile?.filename ?? ''}`}
                  </Button>
                )}
              </CopyButton>
              {canManageFile(viewingFile.author.id) && (
                <Button type="button" size="xs" leftSection={<TbEdit size={13} />} onClick={() => openEdit(viewingFile)}>Edit</Button>
              )}
            </Group>
          </Stack>
        )}
      </Stack>
    )
  }

  if (formOpen) {
    return (
      <Stack gap="lg">
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={closeForm}><TbChevronLeft size={15} /></ActionIcon>
          <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={closeForm}>Files</Anchor>
          <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
          <Text size="sm" fw={600}>{editingFile ? 'Edit File' : 'Buat File Baru'}</Text>
        </Group>
        <Divider />
        <FileForm slug={slug} file={editingFile ?? undefined} onClose={closeForm} />
      </Stack>
    )
  }

  const renderCards = (items: typeof filtered) =>
    view === 'grid' ? (
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
        {items.map((f) => (
          <FileCard key={f.id} file={f} slug={slug} canManage={canManageFile(f.author.id)}
            onView={() => openView(f.id)} onEdit={() => openEdit(f)} onDelete={() => deleteFile(f)} onTagClick={addTagFilter} />
        ))}
      </SimpleGrid>
    ) : (
      <Stack gap="xs">
        {items.map((f) => (
          <FileCard key={f.id} file={f} slug={slug} canManage={canManageFile(f.author.id)}
            onView={() => openView(f.id)} onEdit={() => openEdit(f)} onDelete={() => deleteFile(f)} onTagClick={addTagFilter} />
        ))}
      </Stack>
    )

  return (
    <Box>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      <Group mb="md" justify="space-between" wrap="nowrap" align="flex-start">
        <Group gap="sm" style={{ minWidth: 0 }}>
          <ThemeIcon size={38} radius="md" variant="light" color="blue"><TbFiles size={20} /></ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={700} size="lg" lh={1.2}>Files</Text>
            <Text size="xs" c="dimmed">
              {isLoading ? 'Memuat...' : files.length === 0 ? 'Snippets, config, dan script untuk project ini' : `${files.length} file`}
            </Text>
          </Box>
        </Group>
        {canEdit && (
          <Button variant="light" type="button" size="sm" color="blue" leftSection={<TbPlus size={14} />} onClick={openCreate}>New File</Button>
        )}
      </Group>

      <Alert variant="light" color="blue" radius="md" mb="xs" p="xs" icon={<TbInfoCircle size={15} />}
        styles={{ message: { fontSize: 'var(--mantine-font-size-xs)' }, body: { gap: 4 } }}>
        <Stack gap={4}>
          <Text size="xs">
            Simpan scripts, snippets, dan config files per project. Jalankan: <Code fz="xs">envman -- bash {slug}:scripts/deploy.sh</Code>. Mendukung multi-file dan preview Markdown.
          </Text>
          <Text size="xs">
            Bun scripts (.ts / .js) otomatis install npm packages — tidak perlu <Code fz="xs">bun install</Code>. Pin versi:{' '}
            <Code fz="xs">{'import { z } from "zod@^3.22"'}</Code>
          </Text>
        </Stack>
      </Alert>

      {!isLoading && files.length > 0 && (
        <Stack gap="xs" mb="md">
          <TextInput
            maw={540}
            ref={searchRef}
            size="sm"
            placeholder="Cari judul, deskripsi, filename, isi, atau tag..."
            leftSection={<TbSearch size={13} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            rightSection={search ? <ActionIcon size="xs" variant="subtle" onClick={() => setSearch('')}><TbX size={11} /></ActionIcon> : undefined}
            radius="md"
          />
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="xs" wrap="wrap">
              <MultiSelectChips value={tagFilter} onChange={setTagFilter} options={allTags.map((v) => ({ value: v, label: v }))}
                label="Tags" icon={<TbTag size={12} />} width={120} disabled={allTags.length === 0} />
              <Select size="xs" value={sort} onChange={(v) => setSort((v ?? 'updated') as 'updated' | 'created')}
                data={[{ value: 'updated', label: 'Terbaru diupdate' }, { value: 'created', label: 'Terbaru dibuat' }]}
                leftSection={<TbSortAscending size={13} />} allowDeselect={false} w={160} />
            </Group>
            <Group gap={4}>
              <Tooltip label="List view">
                <ActionIcon size="sm" variant={view === 'list' ? 'filled' : 'subtle'} color="blue" onClick={() => setView('list')}><TbLayoutList size={14} /></ActionIcon>
              </Tooltip>
              <Tooltip label="Grid view">
                <ActionIcon size="sm" variant={view === 'grid' ? 'filled' : 'subtle'} color="blue" onClick={() => setView('grid')}><TbLayoutGrid size={14} /></ActionIcon>
              </Tooltip>
              {allTags.length > 0 && (
                <Tooltip label={groupByTag ? 'Nonaktifkan group by tag' : 'Group by tag'}>
                  <ActionIcon size="sm" variant={groupByTag ? 'filled' : 'subtle'} color={groupByTag ? 'grape' : 'gray'} onClick={() => setGroupByTag((v) => !v)}>
                    <TbTag size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Group>
          {tagFilter.length > 0 && <MultiSelectChipsRow value={tagFilter} onChange={setTagFilter} />}
        </Stack>
      )}

      {isLoading && (
        view === 'grid' ? (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={156} radius="md" />)}
          </SimpleGrid>
        ) : (
          <Stack gap="xs">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={76} radius="md" />)}</Stack>
        )
      )}

      {!isLoading && !isError && files.length === 0 && (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="blue" mx="auto" mb="sm"><TbFiles size={24} /></ThemeIcon>
          <Text fw={600} mb={4}>Belum ada file</Text>
          <Text size="sm" c="dimmed" mb="md" maw={400} mx="auto">Simpan snippets, config files, script, atau template untuk project ini. Mendukung multi-file dan preview Markdown.</Text>
          {canEdit && <Button type="button" size="xs" color="blue" leftSection={<TbPlus size={13} />} onClick={openCreate}>Buat File Pertama</Button>}
        </Box>
      )}

      {!isLoading && !isError && files.length > 0 && filtered.length === 0 && (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
          <ThemeIcon size={44} radius="xl" variant="light" color="gray" mx="auto" mb="sm"><TbSearch size={22} /></ThemeIcon>
          <Text fw={500} size="sm" mb={4}>Tidak ada file yang cocok</Text>
          <Text size="xs" c="dimmed" mb="sm">Coba ubah filter atau kata kunci pencarian.</Text>
          <Button type="button" size="xs" variant="light" leftSection={<TbX size={11} />} onClick={() => { setSearch(''); setTagFilter([]) }}>Reset filter</Button>
        </Box>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <>
          {groupByTag && allTags.length > 0 ? (() => {
            const grouped = new Map<string, typeof filtered>()
            const untagged: typeof filtered = []
            for (const f of filtered) {
              if (f.tags.length === 0) { untagged.push(f); continue }
              const tag = f.tags[0]
              if (!grouped.has(tag)) grouped.set(tag, [])
              grouped.get(tag)!.push(f)
            }
            const groups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
            return (
              <Stack gap="md">
                {groups.map(([tag, items]) => (
                  <Stack key={tag} gap="xs">
                    <Group gap={6} align="center">
                      <Badge size="xs" variant="filled" color="grape" leftSection={<TbTag size={9} />}>{tag}</Badge>
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
          })() : renderCards(paginated)}
          {!groupByTag && totalPages > 1 && (
            <Group justify="center" mt="md"><Pagination value={page} onChange={setPage} total={totalPages} size="sm" /></Group>
          )}
        </>
      )}
    </Box>
  )
}
