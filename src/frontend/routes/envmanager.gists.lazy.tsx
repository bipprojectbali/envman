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
import { useLocalStorage, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createLazyFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { apiFetch } from '@/frontend/lib/api'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { useSession, hasCapability } from '@/frontend/hooks/useAuth'
import { useGistsInfinite } from '@/frontend/hooks/useGistsInfinite'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { InfiniteList } from '@/frontend/components/InfiniteList'
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

export const Route = createLazyFileRoute('/envmanager/gists')({ component: GistsPage })

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

const LANG_EXT: Record<string, string> = {
  plaintext: 'txt', bash: 'sh', javascript: 'js', typescript: 'ts',
  python: 'py', go: 'go', rust: 'rs', java: 'java', kotlin: 'kt',
  swift: 'swift', c: 'c', cpp: 'cpp', csharp: 'cs', php: 'php',
  ruby: 'rb', elixir: 'ex', haskell: 'hs', scala: 'scala', r: 'r',
  sql: 'sql', html: 'html', css: 'css', scss: 'scss', json: 'json',
  yaml: 'yml', toml: 'toml', xml: 'xml', markdown: 'md',
  dockerfile: 'Dockerfile', nginx: 'conf', prisma: 'prisma', graphql: 'graphql',
}
const getExt = (lang: string) => LANG_EXT[lang] ?? 'txt'

// Update filename extension saat language berubah.
// - filename "file1.txt" + lang "txt" → "json" => "file1.json"
// - filename "myname" (no ext) → "py" => "myname.py"
// - filename "custom.weird" (unknown ext) => leave as is (user sudah custom)
function adjustFilenameForLang(filename: string, oldLang: string, newLang: string): string {
  const oldExt = getExt(oldLang)
  const newExt = getExt(newLang)
  if (oldExt === newExt) return filename
  // Dockerfile case: tidak punya extension (filename = "Dockerfile")
  if (newExt === 'Dockerfile') return 'Dockerfile'
  if (filename === 'Dockerfile' && oldLang === 'dockerfile') return `file.${newExt}`
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) {
    return filename ? `${filename}.${newExt}` : `file.${newExt}`
  }
  const base = filename.slice(0, lastDot)
  const currentExt = filename.slice(lastDot + 1)
  if (currentExt === oldExt) {
    return `${base}.${newExt}`
  }
  return filename
}

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
      qc.invalidateQueries({ queryKey: ['envman', 'gists', 'infinite'] })
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

  // Insert 2 spaces saat tab di textarea (bukan focus jump)
  const handleEditorKeyDown = (i: number, content: string) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter → save
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (canSave) save.mutate()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const target = e.currentTarget
      const start = target.selectionStart
      const end = target.selectionEnd
      const next = content.slice(0, start) + '  ' + content.slice(end)
      updateFile(i, { content: next })
      // Restore cursor after insert (setTimeout to wait for re-render)
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2
      }, 0)
    }
  }

  const totalLines = files.reduce((sum, f) => sum + (f.content ? f.content.split('\n').length : 0), 0)
  const totalChars = files.reduce((sum, f) => sum + f.content.length, 0)
  const canSave = !!title.trim() && files.every(f => f.filename.trim())
  const isEditMode = !!gist

  return (
    <Stack gap="md">
      {/* ─── Header section: Title + Description ─────────── */}
      <Stack gap="xs">
        <TextInput
          label={
            <Group gap={6} component="span">
              <Text component="span" size="sm" fw={600}>Judul</Text>
              <Text component="span" size="xs" c="red">*</Text>
            </Group>
          }
          placeholder="Nama gist (contoh: Postgres backup script)"
          value={title}
          onChange={e => setTitle(e.target.value)}
          autoFocus={!isEditMode}
          onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
          size="md"
          required
        />
        <TextInput
          label="Deskripsi"
          placeholder="Deskripsi singkat — apa fungsi snippet ini, kapan dipakai (opsional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
          size="sm"
        />
      </Stack>

      <Divider />

      {/* ─── Files section ──────────────────────────────── */}
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <ThemeIcon size={22} radius="md" variant="light" color="violet">
              <TbFileCode size={13} />
            </ThemeIcon>
            <Text size="sm" fw={600}>Files</Text>
            <Badge size="xs" variant="light" color="gray">{files.length}</Badge>
          </Group>
          <Button
            type="button"
            size="xs"
            variant="light"
            color="violet"
            leftSection={<TbFilePlus size={13} />}
            onClick={addFile}
          >
            Tambah file
          </Button>
        </Group>

        <Tabs
          value={String(activeFile)}
          onChange={v => setActiveFile(Number(v))}
          variant="outline"
          radius="md"
        >
          <Tabs.List>
            {files.map((f, i) => (
              <Tabs.Tab
                key={i}
                value={String(i)}
                leftSection={
                  <Box
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: `var(--mantine-color-${getLangColor(f.language)}-5)`,
                    }}
                  />
                }
                rightSection={files.length > 1 ? (
                  <Tooltip label="Hapus file" position="top" withArrow>
                    <ActionIcon
                      component="div"
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={e => { e.stopPropagation(); removeFile(i) }}
                    >
                      <TbX size={10} />
                    </ActionIcon>
                  </Tooltip>
                ) : undefined}
              >
                <Text size="xs" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.filename || `file${i + 1}`}
                </Text>
              </Tabs.Tab>
            ))}
          </Tabs.List>

          {files.map((f, i) => (
            <Tabs.Panel key={i} value={String(i)} pt="sm">
              <Stack gap="xs">
                {/* Toolbar: filename + language + write/preview */}
                <Group gap="xs" align="flex-end" wrap="nowrap">
                  <TextInput
                    label="Filename"
                    size="xs"
                    placeholder="filename.ext"
                    value={f.filename}
                    onChange={e => updateFile(i, { filename: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
                    style={{ flex: 1 }}
                    leftSection={<TbFileCode size={12} />}
                  />
                  <Select
                    label="Language"
                    size="xs"
                    value={f.language}
                    onChange={v => {
                      const newLang = v ?? 'plaintext'
                      updateFile(i, {
                        language: newLang,
                        filename: adjustFilenameForLang(f.filename, f.language, newLang),
                      })
                    }}
                    data={LANGUAGES}
                    searchable
                    allowDeselect={false}
                    style={{ width: 160 }}
                  />
                  <SegmentedControl
                    size="xs"
                    value={preview}
                    onChange={v => setPreview(v as 'write' | 'preview')}
                    data={[
                      { label: <Group gap={4} wrap="nowrap"><TbEdit size={11} /><span>Tulis</span></Group>, value: 'write' },
                      { label: <Group gap={4} wrap="nowrap"><TbEye size={11} /><span>Preview</span></Group>, value: 'preview' },
                    ]}
                  />
                </Group>

                <Text size="xs" c="dimmed" mt={-4}>
                  Tip: ekstensi filename akan otomatis menyesuaikan saat kamu ganti language.
                </Text>

                {/* Editor / Preview area */}
                {preview === 'write' ? (
                  <Box>
                    <Textarea
                      placeholder={
                        f.language === 'markdown'
                          ? '# Heading\n\nKonten markdown di sini...'
                          : f.language === 'bash'
                          ? '#!/usr/bin/env bash\nset -euo pipefail\n\n# script di sini...'
                          : `Isi konten ${f.language} di sini...`
                      }
                      value={f.content}
                      onChange={e => updateFile(i, { content: e.target.value })}
                      onKeyDown={handleEditorKeyDown(i, f.content)}
                      minRows={14}
                      maxRows={26}
                      autosize
                      styles={{
                        input: {
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontSize: 13,
                          lineHeight: 1.6,
                          tabSize: 2,
                        },
                      }}
                    />
                    {/* Stats bar */}
                    <Group justify="space-between" mt={4} px={4}>
                      <Group gap="xs">
                        <Badge size="xs" variant="dot" color={getLangColor(f.language)}>
                          {f.language}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {f.content ? `${f.content.split('\n').length} baris · ${f.content.length} karakter` : 'Kosong'}
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed">
                        <Code fz={10}>Tab</Code> = indent 2 spasi · <Code fz={10}>⌘ + Enter</Code> = simpan
                      </Text>
                    </Group>
                  </Box>
                ) : (
                  <Paper withBorder p="md" mih={220} radius="md">
                    {f.content ? (
                      <MarkdownRenderer fontSize={13}>
                        {f.language === 'markdown'
                          ? f.content
                          : `\`\`\`${f.language}\n${f.content}\n\`\`\``}
                      </MarkdownRenderer>
                    ) : (
                      <Group justify="center" py="xl">
                        <Stack gap={4} align="center">
                          <TbEye size={20} opacity={0.3} />
                          <Text size="sm" c="dimmed">Belum ada konten untuk preview.</Text>
                        </Stack>
                      </Group>
                    )}
                  </Paper>
                )}
              </Stack>
            </Tabs.Panel>
          ))}
        </Tabs>
      </Stack>

      <Divider />

      {/* ─── Metadata: Tags + Visibility ─────────────────── */}
      <Stack gap="sm">
        <MultiSelect
          label="Tags"
          description="Tekan Enter untuk menambah tag baru. Tag membantu pencarian dan pengelompokan."
          placeholder="Ketik tag lalu Enter..."
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
        />

        <Box>
          <Text size="sm" fw={500} mb={6}>Visibility</Text>
          <SimpleGrid cols={2} spacing="xs">
            <Card
              withBorder
              p="sm"
              radius="md"
              style={{
                cursor: 'pointer',
                borderColor: !isPublic ? 'var(--mantine-color-violet-5)' : undefined,
                background: !isPublic ? 'var(--mantine-color-violet-light)' : undefined,
              }}
              onClick={() => setIsPublic(false)}
            >
              <Group gap="xs" wrap="nowrap">
                <ThemeIcon size={28} radius="md" variant="light" color={!isPublic ? 'violet' : 'gray'}>
                  <TbLock size={14} />
                </ThemeIcon>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={600}>Private</Text>
                  <Text size="xs" c="dimmed">Hanya kamu yang bisa lihat</Text>
                </Box>
                {!isPublic && <TbCheck size={16} color="var(--mantine-color-violet-6)" />}
              </Group>
            </Card>
            <Card
              withBorder
              p="sm"
              radius="md"
              style={{
                cursor: 'pointer',
                borderColor: isPublic ? 'var(--mantine-color-violet-5)' : undefined,
                background: isPublic ? 'var(--mantine-color-violet-light)' : undefined,
              }}
              onClick={() => setIsPublic(true)}
            >
              <Group gap="xs" wrap="nowrap">
                <ThemeIcon size={28} radius="md" variant="light" color={isPublic ? 'violet' : 'gray'}>
                  <TbGlobe size={14} />
                </ThemeIcon>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={600}>Public</Text>
                  <Text size="xs" c="dimmed">Semua user envmanager bisa lihat</Text>
                </Box>
                {isPublic && <TbCheck size={16} color="var(--mantine-color-violet-6)" />}
              </Group>
            </Card>
          </SimpleGrid>
        </Box>
      </Stack>

      <Divider />

      {/* ─── Footer: summary + actions ───────────────────── */}
      <Group justify="space-between" align="center">
        <Text size="xs" c="dimmed">
          {files.length} file · {totalLines} baris · {totalChars} karakter
        </Text>
        <Group gap="xs">
          <Button type="button" variant="subtle" color="gray" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="button"
            leftSection={<TbCheck size={14} />}
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!canSave}
            color="violet"
          >
            {isEditMode ? 'Simpan perubahan' : 'Buat Gist'}
          </Button>
        </Group>
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
  const isMobile = useMediaQuery('(max-width: 48em)')

  if (!gist) return null
  const file = gist.files[activeFile] ?? gist.files[0]

  return (
    <Modal
      opened={gist !== null}
      onClose={onClose}
      title={
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <TbBrandGithub size={16} style={{ flexShrink: 0 }} />
          <Text fw={700} lineClamp={1}>{gist.title}</Text>
          <Badge size="xs" variant="light" color={gist.isPublic ? 'teal' : 'gray'} leftSection={gist.isPublic ? <TbGlobe size={10} /> : <TbLock size={10} />} style={{ flexShrink: 0 }}>
            {gist.isPublic ? 'Public' : 'Private'}
          </Badge>
        </Group>
      }
      size="xl"
      fullScreen={isMobile}
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
              <Paper withBorder p="md" style={{ maxHeight: 400, overflowY: 'auto' }}>
                <MarkdownRenderer fontSize={13}>
                  {f.language === 'markdown'
                    ? (f.content || '_Kosong_')
                    : `\`\`\`${f.language}\n${f.content || ''}\n\`\`\``}
                </MarkdownRenderer>
              </Paper>
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
  const isSuperAdmin = sessionData?.user?.role === 'SUPER_ADMIN'
  const canCreateGist = hasCapability(sessionData?.user, 'gist:create')
  // SUPER_ADMIN bisa manage gist siapa pun. User biasa hanya gist sendiri.
  const canManageGist = (gistUserId: string) => gistUserId === myUserId || isSuperAdmin
  const qc = useQueryClient()
  const isMobile = useMediaQuery('(max-width: 48em)')

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'mine' | 'public' | 'private'>('all')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [sort, setSort] = useState<'updated' | 'created'>('updated')
  const [view, setView] = useLocalStorage<'list' | 'grid'>({ key: 'envman:gists:view', defaultValue: 'list' })
  const [formModal, setFormModal] = useState<Gist | null | 'new'>(null)
  const [viewGist, setViewGist] = useState<Gist | null>(null)

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useGistsInfinite()
  const gists: Gist[] = useMemo(() => data?.pages.flatMap(p => p.gists) ?? [], [data])

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
          .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'gists', 'infinite'] }); notifyOk('Gist dihapus') })
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
        size={isMobile ? undefined : '90vw'}
        fullScreen={isMobile}
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
        isOwner={viewGist ? canManageGist(viewGist.user.id) : false}
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
        {canCreateGist && (
          <Button type="button" size="xs" leftSection={<TbPlus size={13} />} onClick={() => setFormModal('new')}>
            New Gist
          </Button>
        )}
      </Group>

      {/* Filter pills */}
      <Group gap="xs" mb="sm">
        {([
          { value: 'all', label: `Semua (${gists.length})` },
          { value: 'mine', label: `Milik saya (${mineCount})` },
          { value: 'public', label: `Public (${publicCount})` },
          { value: 'private', label: `Private (${mineCount - gists.filter((g: Gist) => g.isPublic && g.user.id === myUserId).length})` },
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
      <Group gap="xs" mb="md" wrap="wrap">
        <TextInput
          size="xs"
          placeholder="Cari gists..."
          leftSection={<TbSearch size={13} />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          rightSection={search ? <ActionIcon size="xs" variant="subtle" onClick={() => setSearch('')}><TbX size={11} /></ActionIcon> : undefined}
          style={{ flex: 1, minWidth: 120 }}
        />
        {!isMobile && allTags.length > 0 && (
          <MultiSelect
            size="xs"
            placeholder="Filter tag..."
            data={allTags}
            value={tagFilter}
            onChange={setTagFilter}
            leftSection={<TbTag size={13} />}
            clearable
            maw={180}
            style={{ flex: 1 }}
          />
        )}
        <Select
          size="xs"
          w={isMobile ? 115 : 130}
          leftSection={<TbSortAscending size={13} />}
          value={sort}
          onChange={v => setSort((v ?? 'updated') as typeof sort)}
          data={[
            { label: 'Terbaru edit', value: 'updated' },
            { label: 'Terbaru buat', value: 'created' },
          ]}
          allowDeselect={false}
        />
        <Group gap={2} wrap="nowrap">
          <ActionIcon size="sm" variant={view === 'list' ? 'filled' : 'subtle'} color={view === 'list' ? 'violet' : 'gray'} onClick={() => setView('list')}>
            <TbLayoutList size={14} />
          </ActionIcon>
          <ActionIcon size="sm" variant={view === 'grid' ? 'filled' : 'subtle'} color={view === 'grid' ? 'violet' : 'gray'} onClick={() => setView('grid')}>
            <TbLayoutGrid size={14} />
          </ActionIcon>
        </Group>
      </Group>

      {/* List */}
      {!isLoading && gists.length === 0 ? (
        <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
          <ThemeIcon size={40} radius="xl" variant="light" color="violet" mx="auto" mb="sm">
            <TbBrandGithub size={20} />
          </ThemeIcon>
          <Text fw={500} mb={4}>Belum ada gists</Text>
          <Text size="sm" c="dimmed" mb="md">Simpan snippets, config, atau script yang sering dipakai.</Text>
          {canCreateGist ? (
            <Button type="button" size="xs" leftSection={<TbPlus size={13} />} onClick={() => setFormModal('new')}>
              Buat Gist Pertama
            </Button>
          ) : (
            <Text size="xs" c="dimmed">Tidak punya izin create gist. Hubungi SUPER_ADMIN.</Text>
          )}
        </Card>
      ) : !isLoading && filtered.length === 0 ? (
        <Card withBorder p="md" ta="center" style={{ borderStyle: 'dashed' }}>
          <Text size="sm" c="dimmed">Tidak ada gist yang cocok.</Text>
          <Button type="button" size="xs" variant="subtle" mt="xs" onClick={() => { setSearch(''); setTagFilter([]); setFilter('all') }}>Reset Filter</Button>
        </Card>
      ) : view === 'list' ? (
        <InfiniteList
          fetchNextPage={fetchNextPage}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isLoading={isLoading}
        >
          <Stack gap="xs">
            {filtered.map(g => (
              <GistCard
                key={g.id}
                gist={g}
                isOwner={canManageGist(g.user.id)}
                onView={() => setViewGist(g)}
                onEdit={() => setFormModal(g)}
                onDelete={() => deleteGist(g)}
              />
            ))}
          </Stack>
        </InfiniteList>
      ) : (
        <InfiniteList
          fetchNextPage={fetchNextPage}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isLoading={isLoading}
        >
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
            {filtered.map(g => (
              <GistCard
                key={g.id}
                gist={g}
                isOwner={canManageGist(g.user.id)}
                onView={() => setViewGist(g)}
                onEdit={() => setFormModal(g)}
                onDelete={() => deleteGist(g)}
              />
            ))}
          </SimpleGrid>
        </InfiniteList>
      )}
    </Box>
  )
}
