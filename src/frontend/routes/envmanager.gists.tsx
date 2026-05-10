import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Code,
  CopyButton,
  Divider,
  Group,
  Modal,
  MultiSelect,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { apiFetch } from '@/frontend/lib/api'
import { useSession } from '@/frontend/hooks/useAuth'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import {
  TbBrandGithub,
  TbCheck,
  TbCopy,
  TbEdit,
  TbEye,
  TbFileCode,
  TbFilePlus,
  TbGlobe,
  TbLayoutGrid,
  TbLayoutList,
  TbLock,
  TbPlus,
  TbSearch,
  TbSortAscending,
  TbTag,
  TbTrash,
  TbX,
} from 'react-icons/tb'

export const Route = createFileRoute('/envmanager/gists')({
  component: GistsPage,
})

// ─── Types ────────────────────────────────────────────────────────────────────

interface GistFile {
  filename: string
  content: string
  language: string
}

interface Gist {
  id: string
  title: string
  description: string
  files: GistFile[]
  isPublic: boolean
  tags: string[]
  createdAt: string
  updatedAt: string
  user: { id: string; name: string }
}

// ─── Language list ─────────────────────────────────────────────────────────

const LANGUAGES = [
  'plaintext', 'bash', 'javascript', 'typescript', 'python', 'go', 'rust',
  'java', 'kotlin', 'swift', 'c', 'cpp', 'csharp', 'php', 'ruby', 'elixir',
  'haskell', 'scala', 'r', 'sql', 'html', 'css', 'scss', 'json', 'yaml',
  'toml', 'xml', 'markdown', 'dockerfile', 'nginx', 'prisma', 'graphql',
]

const LANG_COLORS: Record<string, string> = {
  javascript: 'yellow', typescript: 'blue', python: 'green', go: 'cyan',
  rust: 'orange', bash: 'gray', sql: 'violet', json: 'teal', yaml: 'lime',
  html: 'red', css: 'indigo', markdown: 'gray', dockerfile: 'blue',
  prisma: 'violet', toml: 'orange', plaintext: 'gray',
}
const getLangColor = (lang: string) => LANG_COLORS[lang] ?? 'gray'

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m}m lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}h lalu`
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── GistForm ─────────────────────────────────────────────────────────────────

function GistForm({ gist, onClose }: { gist?: Gist; onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(gist?.title ?? '')
  const [description, setDescription] = useState(gist?.description ?? '')
  const [isPublic, setIsPublic] = useState(gist?.isPublic ?? false)
  const [tags, setTags] = useState<string[]>(gist?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [files, setFiles] = useState<GistFile[]>(
    gist?.files.length ? gist.files : [{ filename: 'file1.txt', content: '', language: 'plaintext' }]
  )
  const [activeFile, setActiveFile] = useState(0)
  const [preview, setPreview] = useState<'write' | 'preview'>('write')

  const save = useMutation({
    mutationFn: () => {
      const body = { title, description, files, isPublic, tags }
      return gist
        ? apiFetch(`/api/envman/gists/${gist.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : apiFetch('/api/envman/gists', { method: 'POST', body: JSON.stringify(body) })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'gists'] })
      notifyOk(gist ? 'Gist diperbarui' : 'Gist dibuat')
      onClose()
    },
    onError: (e) => notifyErr(e),
  })

  const addFile = () => {
    const n = files.length + 1
    setFiles(f => [...f, { filename: `file${n}.txt`, content: '', language: 'plaintext' }])
    setActiveFile(files.length)
  }

  const removeFile = (i: number) => {
    if (files.length === 1) return
    setFiles(f => f.filter((_, idx) => idx !== i))
    setActiveFile(Math.max(0, i - 1))
  }

  const updateFile = (i: number, patch: Partial<GistFile>) =>
    setFiles(f => f.map((x, idx) => idx === i ? { ...x, ...patch } : x))

  const cur = files[activeFile] ?? files[0]

  return (
    <Stack gap="sm">
      <Group grow gap="sm">
        <TextInput
          label="Judul"
          placeholder="Nama gist..."
          value={title}
          onChange={e => setTitle(e.target.value)}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
          required
        />
        <TextInput
          label="Deskripsi"
          placeholder="Deskripsi singkat (opsional)..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
        />
      </Group>

      {/* Files tabs */}
      <Box>
        <Group gap="xs" mb={4} align="center">
          <Text size="sm" fw={500}>Files</Text>
          <ActionIcon size="xs" variant="subtle" color="violet" onClick={addFile}>
            <TbFilePlus size={13} />
          </ActionIcon>
        </Group>
        <Tabs
          value={String(activeFile)}
          onChange={v => setActiveFile(Number(v))}
          variant="outline"
        >
          <Tabs.List>
            {files.map((f, i) => (
              <Tabs.Tab
                key={i}
                value={String(i)}
                rightSection={files.length > 1 ? (
                  <ActionIcon size="xs" variant="subtle" color="red" onClick={e => { e.stopPropagation(); removeFile(i) }}>
                    <TbX size={10} />
                  </ActionIcon>
                ) : undefined}
              >
                <Text size="xs" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.filename || `file${i + 1}`}
                </Text>
              </Tabs.Tab>
            ))}
          </Tabs.List>

          {files.map((f, i) => (
            <Tabs.Panel key={i} value={String(i)} pt="xs">
              <Group grow gap="sm" mb="xs">
                <TextInput
                  size="xs"
                  placeholder="filename.ext"
                  value={f.filename}
                  onChange={e => updateFile(i, { filename: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
                />
                <Select
                  size="xs"
                  value={f.language}
                  onChange={v => updateFile(i, { language: v ?? 'plaintext' })}
                  data={LANGUAGES}
                  searchable
                  allowDeselect={false}
                />
                <Group gap={4} justify="flex-end">
                  <SegmentedControl
                    size="xs"
                    value={preview}
                    onChange={v => setPreview(v as 'write' | 'preview')}
                    data={[
                      { label: <Group gap={4}><TbEdit size={11} /><span>Write</span></Group>, value: 'write' },
                      { label: <Group gap={4}><TbEye size={11} /><span>Preview</span></Group>, value: 'preview' },
                    ]}
                  />
                </Group>
              </Group>
              {preview === 'write' ? (
                <Textarea
                  placeholder="Isi konten file..."
                  value={f.content}
                  onChange={e => updateFile(i, { content: e.target.value })}
                  minRows={10}
                  maxRows={20}
                  autosize
                  styles={{ input: { fontFamily: 'monospace', fontSize: 13 } }}
                />
              ) : (
                <Paper withBorder p="md" mih={120}>
                  {f.content ? (
                    f.language === 'markdown' ? (
                      <div className="markdown-body" style={{ fontSize: 13 }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{f.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <Code block style={{ fontSize: 12 }}>{f.content}</Code>
                    )
                  ) : (
                    <Text size="sm" c="dimmed">Tidak ada konten.</Text>
                  )}
                </Paper>
              )}
            </Tabs.Panel>
          ))}
        </Tabs>
      </Box>

      <Group gap="sm" align="flex-end">
        <MultiSelect
          label="Tags"
          placeholder="Ketik lalu Enter..."
          data={tags}
          value={tags}
          onChange={setTags}
          searchable
          searchValue={tagInput}
          onSearchChange={setTagInput}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
              e.preventDefault()
              const t = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
              if (t && !tags.includes(t)) setTags(prev => [...prev, t])
              setTagInput('')
            }
          }}
          leftSection={<TbTag size={13} />}
          clearable
          style={{ flex: 1 }}
        />
        <Switch
          label={isPublic ? 'Public' : 'Private'}
          checked={isPublic}
          onChange={e => setIsPublic(e.currentTarget.checked)}
          color="violet"
          mb={4}
        />
      </Group>

      <Group justify="flex-end" gap="xs">
        <Button type="button" variant="subtle" color="gray" onClick={onClose}>Batal</Button>
        <Button
          type="button"
          leftSection={<TbBrandGithub size={14} />}
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!title.trim() || !files[0]?.filename.trim()}
        >
          {gist ? 'Simpan' : 'Buat Gist'}
        </Button>
      </Group>
    </Stack>
  )
}

// ─── GistCard ─────────────────────────────────────────────────────────────────

function GistCard({
  gist, isOwner, onEdit, onDelete, onView,
}: {
  gist: Gist; isOwner: boolean
  onEdit: () => void; onDelete: () => void; onView: () => void
}) {
  const firstFile = gist.files[0]
  return (
    <Card withBorder p="sm" style={{ cursor: 'pointer' }} onClick={onView}>
      <Group justify="space-between" wrap="nowrap" mb={4}>
        <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon size={24} radius="sm" variant="light" color="violet">
            <TbBrandGithub size={14} />
          </ThemeIcon>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {gist.title}
            </Text>
            {gist.description && (
              <Text size="xs" c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {gist.description}
              </Text>
            )}
          </Box>
        </Group>
        <Group gap={4} wrap="nowrap" onClick={e => e.stopPropagation()}>
          <Tooltip label={gist.isPublic ? 'Public' : 'Private'} position="left">
            <Box c={gist.isPublic ? 'teal' : 'dimmed'}>
              {gist.isPublic ? <TbGlobe size={14} /> : <TbLock size={14} />}
            </Box>
          </Tooltip>
          <CopyButton value={gist.files.map(f => `// ${f.filename}\n${f.content}`).join('\n\n')} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Tersalin!' : 'Copy semua'} position="left">
                <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={e => { e.stopPropagation(); copy() }}>
                  {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
          {isOwner && (
            <>
              <Tooltip label="Edit" position="left">
                <ActionIcon size="sm" variant="subtle" color="blue" onClick={e => { e.stopPropagation(); onEdit() }}>
                  <TbEdit size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Hapus" position="left">
                <ActionIcon size="sm" variant="subtle" color="red" onClick={e => { e.stopPropagation(); onDelete() }}>
                  <TbTrash size={13} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      </Group>

      {/* File preview */}
      {firstFile && (
        <Code block style={{ fontSize: 11, maxHeight: 80, overflow: 'hidden', marginBottom: 6 }}>
          {firstFile.content.split('\n').slice(0, 4).join('\n') || '(kosong)'}
        </Code>
      )}

      <Group gap={4} wrap="wrap">
        {gist.files.map(f => (
          <Badge key={f.filename} size="xs" variant="dot" color={getLangColor(f.language)}>
            {f.filename}
          </Badge>
        ))}
        {gist.files.length > 1 && (
          <Text size="xs" c="dimmed">{gist.files.length} files</Text>
        )}
        {gist.tags.map(t => (
          <Badge key={t} size="xs" variant="outline" color="gray">{t}</Badge>
        ))}
        <Text size="xs" c="dimmed" ml="auto">
          {gist.user.name} · {relTime(gist.updatedAt)}
        </Text>
      </Group>
    </Card>
  )
}

// ─── GistViewModal ────────────────────────────────────────────────────────────

function GistViewModal({
  gist, onClose, isOwner, onEdit,
}: {
  gist: Gist | null; onClose: () => void; isOwner: boolean; onEdit: () => void
}) {
  const [activeFile, setActiveFile] = useState(0)

  if (!gist) return null
  const file = gist.files[activeFile] ?? gist.files[0]

  return (
    <Modal
      opened={gist !== null}
      onClose={onClose}
      title={
        <Group gap="xs">
          <TbBrandGithub size={16} />
          <Text fw={700}>{gist.title}</Text>
          <Badge size="xs" variant="light" color={gist.isPublic ? 'teal' : 'gray'} leftSection={gist.isPublic ? <TbGlobe size={10} /> : <TbLock size={10} />}>
            {gist.isPublic ? 'Public' : 'Private'}
          </Badge>
        </Group>
      }
      size="xl"
      zIndex={300}
    >
      <Stack gap="sm">
        {gist.description && <Text size="sm" c="dimmed">{gist.description}</Text>}

        <Tabs value={String(activeFile)} onChange={v => setActiveFile(Number(v))} variant="outline">
          <Tabs.List>
            {gist.files.map((f, i) => (
              <Tabs.Tab key={i} value={String(i)} leftSection={<TbFileCode size={12} />}>
                <Group gap={4}>
                  <Text size="xs">{f.filename}</Text>
                  <Badge size="xs" variant="dot" color={getLangColor(f.language)}>{f.language}</Badge>
                </Group>
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {gist.files.map((f, i) => (
            <Tabs.Panel key={i} value={String(i)} pt="xs">
              {f.language === 'markdown' ? (
                <Paper withBorder p="md" style={{ maxHeight: 400, overflowY: 'auto' }}>
                  <div className="markdown-body" style={{ fontSize: 13 }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{f.content || '_Kosong_'}</ReactMarkdown>
                  </div>
                </Paper>
              ) : (
                <Code block style={{ fontSize: 12, maxHeight: 400, overflowY: 'auto', display: 'block' }}>
                  {f.content || '(kosong)'}
                </Code>
              )}
            </Tabs.Panel>
          ))}
        </Tabs>

        <Group gap={4} wrap="wrap">
          {gist.tags.map(t => <Badge key={t} size="xs" variant="outline" color="gray">{t}</Badge>)}
          <Text size="xs" c="dimmed" ml="auto">oleh {gist.user.name} · {relTime(gist.updatedAt)}</Text>
        </Group>

        <Divider />

        <Group justify="space-between">
          <CopyButton value={file?.content ?? ''} timeout={2000}>
            {({ copied, copy }) => (
              <Button type="button" size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} leftSection={copied ? <TbCheck size={13} /> : <TbCopy size={13} />} onClick={copy}>
                {copied ? 'Tersalin!' : `Copy ${file?.filename ?? ''}`}
              </Button>
            )}
          </CopyButton>
          {isOwner && (
            <Button type="button" size="xs" leftSection={<TbEdit size={13} />} onClick={onEdit}>
              Edit
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  )
}

// ─── GistsPage ────────────────────────────────────────────────────────────────

function GistsPage() {
  const { data: sessionData } = useSession()
  const myUserId = sessionData?.user?.id ?? ''
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'mine' | 'public' | 'private'>('all')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [sort, setSort] = useState<'updated' | 'created'>('updated')
  const [view, setView] = useLocalStorage<'list' | 'grid'>({ key: 'envman:gists:view', defaultValue: 'list' })
  const [formModal, setFormModal] = useState<Gist | null | 'new'>(null)
  const [viewGist, setViewGist] = useState<Gist | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['envman', 'gists'],
    queryFn: () => apiFetch<{ gists: Gist[] }>('/api/envman/gists'),
    refetchInterval: 30000,
  })
  const gists: Gist[] = data?.gists ?? []

  const allTags = useMemo(() => [...new Set(gists.flatMap(g => g.tags))].sort(), [gists])

  const filtered = useMemo(() => {
    let list = [...gists]
    if (filter === 'mine') list = list.filter(g => g.user.id === myUserId)
    if (filter === 'public') list = list.filter(g => g.isPublic)
    if (filter === 'private') list = list.filter(g => !g.isPublic && g.user.id === myUserId)
    if (tagFilter.length > 0) list = list.filter(g => tagFilter.every(t => g.tags.includes(t)))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(g =>
        g.title.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.files.some(f => f.filename.toLowerCase().includes(q) || f.content.toLowerCase().includes(q)) ||
        g.tags.some(t => t.includes(q))
      )
    }
    list.sort((a, b) =>
      sort === 'updated'
        ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    return list
  }, [gists, filter, tagFilter, search, sort, myUserId])

  const deleteGist = (g: Gist) =>
    modals.openConfirmModal({
      title: 'Hapus gist',
      children: <Text size="sm">Hapus gist <strong>{g.title}</strong>?</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        apiFetch(`/api/envman/gists/${g.id}`, { method: 'DELETE' })
          .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'gists'] }); notifyOk('Gist dihapus') })
          .catch(notifyErr),
    })

  const mineCount = gists.filter(g => g.user.id === myUserId).length
  const publicCount = gists.filter(g => g.isPublic).length

  return (
    <Box>
      {/* Form modal */}
      <Modal
        opened={formModal !== null}
        onClose={() => setFormModal(null)}
        title={formModal === 'new' ? 'Buat Gist Baru' : 'Edit Gist'}
        size="90vw"
        zIndex={300}
        styles={{ body: { paddingTop: 8 } }}
      >
        {formModal !== null && (
          <GistForm
            gist={formModal === 'new' ? undefined : formModal}
            onClose={() => setFormModal(null)}
          />
        )}
      </Modal>

      {/* View modal */}
      <GistViewModal
        gist={viewGist}
        onClose={() => setViewGist(null)}
        isOwner={viewGist?.user.id === myUserId}
        onEdit={() => { setFormModal(viewGist); setViewGist(null) }}
      />

      {/* Header */}
      <Group mb="md" justify="space-between">
        <Group gap="xs">
          <ThemeIcon size={32} radius="md" variant="light" color="violet">
            <TbBrandGithub size={18} />
          </ThemeIcon>
          <Box>
            <Text fw={700} size="sm">Gists</Text>
            <Text size="xs" c="dimmed">Snippets &amp; konfigurasi</Text>
          </Box>
        </Group>
        <Button type="button" size="xs" leftSection={<TbPlus size={13} />} onClick={() => setFormModal('new')}>
          New Gist
        </Button>
      </Group>

      {/* Filter pills */}
      <Group gap="xs" mb="sm">
        {([
          { value: 'all', label: `Semua (${gists.length})` },
          { value: 'mine', label: `Milik saya (${mineCount})` },
          { value: 'public', label: `Public (${publicCount})` },
          { value: 'private', label: `Private (${mineCount - gists.filter(g => g.isPublic && g.user.id === myUserId).length})` },
        ] as const).map(f => (
          <Badge
            key={f.value}
            size="sm"
            variant={filter === f.value ? 'filled' : 'outline'}
            color="violet"
            style={{ cursor: 'pointer' }}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Badge>
        ))}
      </Group>

      {/* Toolbar */}
      <Group gap="xs" mb="md">
        <TextInput
          size="xs"
          placeholder="Cari gists, file, konten..."
          leftSection={<TbSearch size={13} />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          rightSection={search ? <ActionIcon size="xs" variant="subtle" onClick={() => setSearch('')}><TbX size={11} /></ActionIcon> : undefined}
          style={{ flex: 1 }}
        />
        {allTags.length > 0 && (
          <MultiSelect
            size="xs"
            placeholder="Filter tag..."
            data={allTags}
            value={tagFilter}
            onChange={setTagFilter}
            leftSection={<TbTag size={13} />}
            clearable
            w={180}
          />
        )}
        <Select
          size="xs"
          w={130}
          leftSection={<TbSortAscending size={13} />}
          value={sort}
          onChange={v => setSort((v ?? 'updated') as typeof sort)}
          data={[
            { label: 'Terbaru edit', value: 'updated' },
            { label: 'Terbaru buat', value: 'created' },
          ]}
          allowDeselect={false}
        />
        <Group gap={2}>
          <Tooltip label="List view" position="bottom">
            <ActionIcon size="sm" variant={view === 'list' ? 'filled' : 'subtle'} color={view === 'list' ? 'violet' : 'gray'} onClick={() => setView('list')}>
              <TbLayoutList size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Grid view" position="bottom">
            <ActionIcon size="sm" variant={view === 'grid' ? 'filled' : 'subtle'} color={view === 'grid' ? 'violet' : 'gray'} onClick={() => setView('grid')}>
              <TbLayoutGrid size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* List */}
      {isLoading ? (
        <Stack gap="xs">
          {[1, 2, 3].map(i => <Skeleton key={i} height={100} radius="md" />)}
        </Stack>
      ) : gists.length === 0 ? (
        <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
          <ThemeIcon size={40} radius="xl" variant="light" color="violet" mx="auto" mb="sm">
            <TbBrandGithub size={20} />
          </ThemeIcon>
          <Text fw={500} mb={4}>Belum ada gists</Text>
          <Text size="sm" c="dimmed" mb="md">Simpan snippets, config, atau script yang sering dipakai.</Text>
          <Button type="button" size="xs" leftSection={<TbPlus size={13} />} onClick={() => setFormModal('new')}>
            Buat Gist Pertama
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card withBorder p="md" ta="center" style={{ borderStyle: 'dashed' }}>
          <Text size="sm" c="dimmed">Tidak ada gist yang cocok.</Text>
          <Button type="button" size="xs" variant="subtle" mt="xs" onClick={() => { setSearch(''); setTagFilter([]); setFilter('all') }}>Reset Filter</Button>
        </Card>
      ) : view === 'list' ? (
        <Stack gap="xs">
          {filtered.map(g => (
            <GistCard
              key={g.id}
              gist={g}
              isOwner={g.user.id === myUserId}
              onView={() => setViewGist(g)}
              onEdit={() => setFormModal(g)}
              onDelete={() => deleteGist(g)}
            />
          ))}
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
          {filtered.map(g => (
            <GistCard
              key={g.id}
              gist={g}
              isOwner={g.user.id === myUserId}
              onView={() => setViewGist(g)}
              onEdit={() => setFormModal(g)}
              onDelete={() => deleteGist(g)}
            />
          ))}
        </SimpleGrid>
      )}
    </Box>
  )
}
