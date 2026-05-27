import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  CopyButton,
  Group,
  Modal,
  SimpleGrid,
  Skeleton,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useLocalStorage } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { TbCheck, TbCopy, TbInfoCircle, TbLayoutGrid, TbLayoutList, TbPencil, TbPlus, TbSearch, TbTag, TbTerminal2, TbTrash } from 'react-icons/tb'
import { MultiSelectChips, MultiSelectChipsRow } from '@/frontend/components/MultiSelectChips'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

export interface Alias {
  id: string
  name: string
  args: string
  description: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
  creator: { id: string; name: string }
}

interface FormState {
  name: string
  args: string
  description: string
  tags: string[]
}

const emptyForm = (): FormState => ({ name: '', args: '', description: '', tags: [] })

interface AliasModalProps {
  slug: string
  opened: boolean
  editing: Alias | null
  onClose: () => void
}

function AliasForm({ slug, editing, onClose }: { slug: string; editing: Alias | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(
    editing
      ? { name: editing.name, args: editing.args, description: editing.description ?? '', tags: editing.tags }
      : emptyForm(),
  )

  const save = useMutation({
    mutationFn: () => editing
      ? apiFetch(`/api/envman/projects/${slug}/aliases/${editing.name}`, {
          method: 'PATCH',
          body: JSON.stringify({ args: form.args, description: form.description, tags: form.tags }),
        })
      : apiFetch(`/api/envman/projects/${slug}/aliases`, {
          method: 'POST',
          body: JSON.stringify({ name: form.name, args: form.args, description: form.description, tags: form.tags }),
        }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'aliases', slug] })
      notifyOk(editing ? 'Alias diperbarui' : 'Alias dibuat')
      onClose()
    },
    onError: (e) => notifyErr(e),
  })

  return (
    <Stack gap="sm">
      {!editing && (
        <TextInput
          label="Nama alias"
          description="Huruf kecil, angka, tanda hubung. Contoh: deploy, start-dev"
          placeholder="deploy"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          required
        />
      )}
      <Textarea
        label="Args"
        description="Argumen yang disimpan — apa yang biasanya kamu ketik setelah envman"
        placeholder="-e myapp:production -- docker compose up -d"
        value={form.args}
        onChange={e => setForm(f => ({ ...f, args: e.target.value }))}
        autosize
        minRows={2}
        required
      />
      {form.name && !editing && (
        <Box>
          <Text size="xs" c="dimmed" mb={4}>Preview perintah:</Text>
          <Code block fz="xs">envman run {slug}:{form.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}</Code>
        </Box>
      )}
      <TextInput
        label="Deskripsi"
        description="Opsional — penjelasan singkat apa yang dilakukan alias ini"
        placeholder="Deploy ke production dengan rebuild image"
        value={form.description}
        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
      />
      <TagsInput
        label="Tags"
        description="Opsional — untuk organisasi dan filter. Tekan Enter untuk tambah tag."
        placeholder="ci, deploy, docker"
        value={form.tags}
        onChange={v => setForm(f => ({ ...f, tags: v }))}
      />
      <Group justify="flex-end" mt="xs">
        <Button variant="default" onClick={onClose}>Batal</Button>
        <Button
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!form.args.trim() || (!editing && !form.name.trim())}
        >
          {editing ? 'Simpan perubahan' : 'Buat alias'}
        </Button>
      </Group>
    </Stack>
  )
}

function AliasModal({ slug, opened, editing, onClose }: AliasModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? `Edit alias: ${editing.name}` : 'Tambah alias baru'}
      size="lg"
    >
      {opened && <AliasForm slug={slug} editing={editing} onClose={onClose} />}
    </Modal>
  )
}

export interface AliasesPanelProps {
  slug: string
  isOwner: boolean
}

export function AliasesPanel({ slug, isOwner }: AliasesPanelProps) {
  const qc = useQueryClient()
  const [opened, { open, close }] = useDisclosure(false)
  const [editing, setEditing] = useState<Alias | null>(null)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useLocalStorage<string[]>({ key: `envman:aliases:${slug}:tagFilter`, defaultValue: [] })
  const [view, setView] = useLocalStorage<'list' | 'grid'>({
    key: `envman:aliases:${slug}:view`,
    defaultValue: 'list',
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
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.args.toLowerCase().includes(q) ||
        (a.description?.toLowerCase().includes(q) ?? false) ||
        a.tags.some(t => t.toLowerCase().includes(q)),
      )
    }
    if (tagFilter.length > 0) {
      list = list.filter(a => tagFilter.every(t => a.tags.includes(t)))
    }
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

  const openEdit = (alias: Alias) => { setEditing(alias); open() }
  const openCreate = () => { setEditing(null); open() }

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

  if (isLoading) {
    return (
      <Stack gap="xs">
        {[0, 1, 2].map(i => <Skeleton key={i} height={80} radius="md" />)}
      </Stack>
    )
  }

  return (
    <>
      <Stack gap="xs">
        {/* ── Toolbar ────────────────────────────────── */}
        <TextInput
          size="sm"
          placeholder="Cari alias, args, atau tags..."
          leftSection={<TbSearch size={13} />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          radius="md"
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
            </Group>
            {isOwner && (
              <Button variant='light' size="sm" leftSection={<TbPlus size={14} />} onClick={openCreate}>
                Tambah alias
              </Button>
            )}
          </Group>
        </Group>

        {tagFilter.length > 0 && (
          <MultiSelectChipsRow value={tagFilter} onChange={setTagFilter} />
        )}

        <Alert
          variant="light" color="blue" radius="md" p="xs"
          icon={<TbInfoCircle size={15} />}
          styles={{ message: { fontSize: 'var(--mantine-font-size-xs)' }, body: { gap: 4 } }}
        >
          Alias menyimpan perintah lengkap agar bisa dijalankan singkat dari terminal.
          Jalankan dengan: <Code fz="xs">envman run {slug}:nama-alias</Code>. Bisa menyertakan multi-source env, flags, dan perintah apapun.
        </Alert>

        {/* ── List ───────────────────────────────────── */}
        {aliases.length === 0 ? (
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
        ) : filtered.length === 0 ? (
          <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
            <ThemeIcon size={44} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
              <TbSearch size={22} />
            </ThemeIcon>
            <Text fw={500} size="sm" mb={4}>Tidak ada alias yang cocok</Text>
            <Text size="xs" c="dimmed">Coba ubah filter atau kata kunci pencarian.</Text>
          </Box>
        ) : (
          (() => {
            const cards = filtered.map(alias => (
            <Box key={alias.id} p="sm" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap="xs" wrap="nowrap">
                    <Code fz="sm" fw={700}>{alias.name}</Code>
                    <CopyButton value={`envman run ${slug}:${alias.name}`} timeout={2000}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? 'Disalin!' : `Salin: envman run ${slug}:${alias.name}`} withArrow>
                          <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                            {copied ? <TbCheck size={12} /> : <TbCopy size={12} />}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                    {alias.tags.length > 0 && (
                      <Group gap={4} wrap="wrap">
                        {alias.tags.map(tag => (
                          <Badge
                            key={tag}
                            size="xs"
                            variant="light"
                            color="blue"
                            style={{ cursor: 'pointer' }}
                            onClick={() => !tagFilter.includes(tag) && setTagFilter(f => [...f, tag])}
                          >
                            {tag}
                          </Badge>
                        ))}
                      </Group>
                    )}
                  </Group>
                  <Group gap={4} wrap="nowrap" align="flex-start">
                    <Code block fz="xs" style={{ wordBreak: 'break-all', flex: 1 }}>
                      envman {alias.args}
                    </Code>
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
                  {alias.description && (
                    <Text size="xs" c="dimmed">{alias.description}</Text>
                  )}
                  <Text size="xs" c="dimmed">
                    dibuat oleh {alias.creator.name} · {new Date(alias.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </Stack>

                {isOwner && (
                  <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
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
            return view === 'grid' ? (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs">{cards}</SimpleGrid>
            ) : (
              <>{cards}</>
            )
          })()
        )}
      </Stack>

      <AliasModal slug={slug} opened={opened} editing={editing} onClose={close} />
    </>
  )
}
