import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  CopyButton,
  Divider,
  Group,
  Kbd,
  Modal,
  MultiSelect,
  Paper,
  SegmentedControl,
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
import { useDebouncedValue, useHotkeys, useLocalStorage, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import {
  TbArrowsMaximize,
  TbBrandGithub,
  TbCheck,
  TbChevronLeft,
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
  TbShare,
  TbSortAscending,
  TbTag,
  TbTrash,
  TbX,
} from 'react-icons/tb'
import { CodeEditor } from '@/frontend/components/CodeEditor'
import { InfiniteList } from '@/frontend/components/InfiniteList'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { MultiSelectChips, MultiSelectChipsRow } from '@/frontend/components/MultiSelectChips'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { useGistsInfinite } from '@/frontend/hooks/useGistsInfinite'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

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
  'plaintext',
  'bash',
  'javascript',
  'typescript',
  'python',
  'go',
  'rust',
  'java',
  'kotlin',
  'swift',
  'c',
  'cpp',
  'csharp',
  'php',
  'ruby',
  'elixir',
  'haskell',
  'scala',
  'r',
  'sql',
  'html',
  'css',
  'scss',
  'json',
  'yaml',
  'toml',
  'xml',
  'markdown',
  'dockerfile',
  'nginx',
  'prisma',
  'graphql',
]

const LANG_EXT: Record<string, string> = {
  plaintext: 'txt',
  bash: 'sh',
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  go: 'go',
  rust: 'rs',
  java: 'java',
  kotlin: 'kt',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  php: 'php',
  ruby: 'rb',
  elixir: 'ex',
  haskell: 'hs',
  scala: 'scala',
  r: 'r',
  sql: 'sql',
  html: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  yaml: 'yml',
  toml: 'toml',
  xml: 'xml',
  markdown: 'md',
  dockerfile: 'Dockerfile',
  nginx: 'conf',
  prisma: 'prisma',
  graphql: 'graphql',
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
  javascript: 'yellow',
  typescript: 'blue',
  python: 'green',
  go: 'cyan',
  rust: 'orange',
  bash: 'gray',
  sql: 'violet',
  json: 'teal',
  yaml: 'lime',
  html: 'red',
  css: 'indigo',
  markdown: 'gray',
  dockerfile: 'blue',
  prisma: 'violet',
  toml: 'orange',
  plaintext: 'gray',
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

function absoluteTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

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

// ─── GistForm ─────────────────────────────────────────────────────────────────

function GistForm({ gist, onClose }: { gist?: Gist; onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(gist?.title ?? '')
  const [description, setDescription] = useState(gist?.description ?? '')
  const [isPublic, setIsPublic] = useState(gist?.isPublic ?? false)
  const [tags, setTags] = useState<string[]>(gist?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [files, setFiles] = useState<GistFile[]>(
    gist?.files.length ? gist.files : [{ filename: 'file1.txt', content: '', language: 'plaintext' }],
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
    setFiles((f) => [...f, { filename: `file${n}.txt`, content: '', language: 'plaintext' }])
    setActiveFile(files.length)
  }

  const removeFile = (i: number) => {
    if (files.length === 1) return
    setFiles((f) => f.filter((_, idx) => idx !== i))
    setActiveFile(Math.max(0, i - 1))
  }

  const updateFile = (i: number, patch: Partial<GistFile>) =>
    setFiles((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))

  const totalLines = files.reduce((sum, f) => sum + (f.content ? f.content.split('\n').length : 0), 0)
  const totalChars = files.reduce((sum, f) => sum + f.content.length, 0)
  const canSave = !!title.trim() && files.every((f) => f.filename.trim())
  const isEditMode = !!gist

  return (
    <Stack gap="md">
      {/* ─── Header section: Title + Description ─────────── */}
      <Stack gap="xs">
        <TextInput
          label={
            <Group gap={6} component="span">
              <Text component="span" size="sm" fw={600}>
                Judul
              </Text>
              <Text component="span" size="xs" c="red">
                *
              </Text>
            </Group>
          }
          placeholder="Nama gist (contoh: Postgres backup script)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={!isEditMode}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
          size="md"
          required
        />
        <TextInput
          label="Deskripsi"
          placeholder="Deskripsi singkat — apa fungsi snippet ini, kapan dipakai (opsional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
          size="sm"
        />
      </Stack>

      <Divider />

      {/* ─── Files section ──────────────────────────────── */}
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <ThemeIcon size={22} radius="md" variant="light" color="primary">
              <TbFileCode size={13} />
            </ThemeIcon>
            <Text size="sm" fw={600}>
              Files
            </Text>
            <Badge size="xs" variant="light" color="gray">
              {files.length}
            </Badge>
          </Group>
          <Button
            type="button"
            size="xs"
            variant="light"
            color="primary"
            leftSection={<TbFilePlus size={13} />}
            onClick={addFile}
          >
            Tambah file
          </Button>
        </Group>

        <Tabs value={String(activeFile)} onChange={(v) => setActiveFile(Number(v))} variant="outline" radius="md">
          <Tabs.List>
            {files.map((f, i) => (
              <Tabs.Tab
                key={f.filename || i}
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
                rightSection={
                  files.length > 1 ? (
                    <Tooltip label="Hapus file" position="top" withArrow>
                      <ActionIcon
                        component="div"
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeFile(i)
                        }}
                      >
                        <TbX size={10} />
                      </ActionIcon>
                    </Tooltip>
                  ) : undefined
                }
              >
                <Text
                  size="xs"
                  style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {f.filename || `file${i + 1}`}
                </Text>
              </Tabs.Tab>
            ))}
          </Tabs.List>

          {files.map((f, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: gist files have no stable id
            <Tabs.Panel key={i} value={String(i)} pt="sm">
              <Stack gap="xs">
                {/* Toolbar: filename + language + write/preview */}
                <Group gap="xs" align="flex-end" wrap="nowrap">
                  <TextInput
                    label="Filename"
                    size="xs"
                    placeholder="filename.ext"
                    value={f.filename}
                    onChange={(e) => updateFile(i, { filename: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.preventDefault()
                    }}
                    style={{ flex: 1 }}
                    leftSection={<TbFileCode size={12} />}
                  />
                  <Select
                    label="Language"
                    size="xs"
                    value={f.language}
                    onChange={(v) => {
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
                    onChange={(v) => setPreview(v as 'write' | 'preview')}
                    data={[
                      {
                        label: (
                          <Group gap={4} wrap="nowrap">
                            <TbEdit size={11} />
                            <span>Tulis</span>
                          </Group>
                        ),
                        value: 'write',
                      },
                      {
                        label: (
                          <Group gap={4} wrap="nowrap">
                            <TbEye size={11} />
                            <span>Preview</span>
                          </Group>
                        ),
                        value: 'preview',
                      },
                    ]}
                  />
                </Group>

                <Text size="xs" c="dimmed" mt={-4}>
                  Tip: ekstensi filename akan otomatis menyesuaikan saat kamu ganti language.
                </Text>

                {/* Editor / Preview area */}
                {preview === 'write' ? (
                  <Box>
                    <CodeEditor
                      value={f.content}
                      onChange={(v) => updateFile(i, { content: v })}
                      language={f.language}
                      filename={f.filename}
                      placeholder={
                        f.language === 'markdown'
                          ? '# Heading\n\nKonten markdown di sini...'
                          : f.language === 'bash'
                            ? '#!/usr/bin/env bash\nset -euo pipefail\n\n# script di sini...'
                            : `Isi konten ${f.language} di sini...`
                      }
                      height={400}
                    />
                    {/* Stats bar */}
                    <Group justify="space-between" mt={4} px={4}>
                      <Group gap="xs">
                        <Badge size="xs" variant="dot" color={getLangColor(f.language)}>
                          {f.language}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {f.content
                            ? `${f.content.split('\n').length} baris · ${f.content.length} karakter`
                            : 'Kosong'}
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed">
                        Monaco editor · syntax highlight
                      </Text>
                    </Group>
                  </Box>
                ) : (
                  <Box
                    style={{
                      border: '1px solid var(--mantine-color-default-border)',
                      borderRadius: 'var(--mantine-radius-md)',
                    }}
                    p="md"
                    mih={220}
                  >
                    {f.content ? (
                      <MarkdownRenderer fontSize={13}>
                        {f.language === 'markdown' ? f.content : `\`\`\`${f.language}\n${f.content}\n\`\`\``}
                      </MarkdownRenderer>
                    ) : (
                      <Group justify="center" py="xl">
                        <Stack gap={4} align="center">
                          <TbEye size={20} opacity={0.3} />
                          <Text size="sm" c="dimmed">
                            Belum ada konten untuk preview.
                          </Text>
                        </Stack>
                      </Group>
                    )}
                  </Box>
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
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
              e.preventDefault()
              const t = tagInput
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, '-')
              if (t && !tags.includes(t)) setTags((prev) => [...prev, t])
              setTagInput('')
            }
          }}
          leftSection={<TbTag size={13} />}
          clearable
        />

        <Box>
          <Text size="sm" fw={500} mb={6}>
            Visibility
          </Text>
          <SimpleGrid cols={2} spacing="xs">
            <Box
              p="sm"
              style={{
                cursor: 'pointer',
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 'var(--mantine-radius-md)',
                borderColor: !isPublic ? 'var(--mantine-color-primary)' : undefined,
                background: !isPublic ? 'var(--mantine-color-violet-light)' : undefined,
              }}
              onClick={() => setIsPublic(false)}
            >
              <Group gap="xs" wrap="nowrap">
                <ThemeIcon size={28} radius="md" variant="light" color={!isPublic ? 'violet' : 'gray'}>
                  <TbLock size={14} />
                </ThemeIcon>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={600}>
                    Private
                  </Text>
                  <Text size="xs" c="dimmed">
                    Hanya kamu yang bisa lihat
                  </Text>
                </Box>
                {!isPublic && <TbCheck size={16} color="var(--mantine-color-primary)" />}
              </Group>
            </Box>
            <Box
              p="sm"
              style={{
                cursor: 'pointer',
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 'var(--mantine-radius-md)',
                borderColor: isPublic ? 'var(--mantine-color-primary)' : undefined,
                background: isPublic ? 'var(--mantine-color-violet-light)' : undefined,
              }}
              onClick={() => setIsPublic(true)}
            >
              <Group gap="xs" wrap="nowrap">
                <ThemeIcon size={28} radius="md" variant="light" color={isPublic ? 'violet' : 'gray'}>
                  <TbGlobe size={14} />
                </ThemeIcon>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={600}>
                    Public
                  </Text>
                  <Text size="xs" c="dimmed">
                    Semua user envmanager bisa lihat
                  </Text>
                </Box>
                {isPublic && <TbCheck size={16} color="var(--mantine-color-primary)" />}
              </Group>
            </Box>
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
            color="primary"
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
  gist,
  isOwner,
  onEdit,
  onDelete,
  onView,
  onTagClick,
}: {
  gist: Gist
  isOwner: boolean
  onEdit: () => void
  onDelete: () => void
  onView: () => void
  onTagClick?: (tag: string) => void
}) {
  const firstFile = gist.files[0]
  return (
    <Paper
      p="sm"
      className="envman-gist-card"
      role="article"
      tabIndex={0}
      aria-label={`Buka gist ${gist.title}`}
      onClick={onView}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onView()
        }
      }}
      style={{ cursor: 'pointer', border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}
    >
      <Group justify="space-between" wrap="nowrap" mb={4}>
        <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon size={28} radius="sm" variant="light" color="primary">
            <TbBrandGithub size={16} />
          </ThemeIcon>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap={6} wrap="nowrap">
              <Text fw={700} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {gist.title}
              </Text>
              <Tooltip
                label={gist.isPublic ? 'Public — semua user bisa lihat' : 'Private — hanya kamu yang bisa lihat'}
              >
                <Badge
                  size="xs"
                  variant="light"
                  color={gist.isPublic ? 'teal' : 'gray'}
                  leftSection={gist.isPublic ? <TbGlobe size={9} /> : <TbLock size={9} />}
                >
                  {gist.isPublic ? 'public' : 'private'}
                </Badge>
              </Tooltip>
            </Group>
            {gist.description && (
              <Text size="xs" c="dimmed" lineClamp={1}>
                {gist.description}
              </Text>
            )}
          </Box>
        </Group>
        <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
          <CopyButton value={gist.files.map((f) => `// ${f.filename}\n${f.content}`).join('\n\n')} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Tersalin!' : 'Salin semua file'} position="left">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color={copied ? 'teal' : 'gray'}
                  aria-label="Salin semua file gist"
                  onClick={(e) => {
                    e.stopPropagation()
                    copy()
                  }}
                >
                  {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
          {gist.isPublic && (
            <CopyButton value={`${window.location.origin}/gists/${gist.id}`} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Link disalin!' : 'Salin public link'} position="left">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color={copied ? 'teal' : 'gray'}
                    aria-label="Salin public link"
                    onClick={(e) => {
                      e.stopPropagation()
                      copy()
                    }}
                  >
                    {copied ? <TbCheck size={13} /> : <TbShare size={13} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          )}
          {isOwner && (
            <>
              <Tooltip label="Edit" position="left">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="blue"
                  aria-label="Edit gist"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit()
                  }}
                >
                  <TbEdit size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Hapus" position="left">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  aria-label="Hapus gist"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                  }}
                >
                  <TbTrash size={13} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      </Group>

      {/* File preview */}
      {firstFile && (
        <Text lineClamp={4} style={{ fontSize: 11, fontFamily: 'monospace', marginBottom: 6, whiteSpace: 'pre-wrap' }}>
          {firstFile.content || '(kosong)'}
        </Text>
      )}

      <Group gap={4} wrap="wrap" align="center">
        {gist.files.slice(0, 3).map((f) => (
          <Tooltip key={f.filename} label={`${f.language} · ${f.content.split('\n').length} baris`}>
            <Badge size="xs" variant="dot" color={getLangColor(f.language)}>
              {f.filename}
            </Badge>
          </Tooltip>
        ))}
        {gist.files.length > 3 && (
          <Tooltip
            label={gist.files
              .slice(3)
              .map((f) => f.filename)
              .join(', ')}
          >
            <Badge size="xs" variant="default">
              +{gist.files.length - 3}
            </Badge>
          </Tooltip>
        )}
        {gist.tags.slice(0, 3).map((t) => (
          <Badge
            key={t}
            size="xs"
            variant="outline"
            color="gray"
            className="envman-gist-tag"
            onClick={
              onTagClick
                ? (e) => {
                    e.stopPropagation()
                    onTagClick(t)
                  }
                : undefined
            }
          >
            {t}
          </Badge>
        ))}
        {gist.tags.length > 3 && (
          <Tooltip label={gist.tags.slice(3).join(', ')}>
            <Text size="xs" c="dimmed">
              +{gist.tags.length - 3}
            </Text>
          </Tooltip>
        )}
        <Tooltip label={`Diperbarui ${absoluteTime(gist.updatedAt)} oleh ${gist.user.name}`}>
          <Text size="xs" c="dimmed" ml="auto">
            {gist.user.name} · {relTime(gist.updatedAt)}
          </Text>
        </Tooltip>
      </Group>
    </Paper>
  )
}

// ─── GistDetailView ───────────────────────────────────────────────────────────

function GistDetailView({
  gist,
  onBack,
  isOwner,
  onEdit,
}: {
  gist: Gist
  onBack: () => void
  isOwner: boolean
  onEdit: () => void
}) {
  const [activeFile, setActiveFile] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const file = gist.files[activeFile] ?? gist.files[0]

  const renderContent = (f: GistFile) =>
    f.language === 'markdown' ? f.content || '_Kosong_' : `\`\`\`${f.language}\n${f.content || ''}\n\`\`\``

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        {/* Breadcrumb */}
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={onBack}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={onBack}>
            Gists
          </Text>
          <Text size="sm" c="dimmed">
            /
          </Text>
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <TbBrandGithub size={14} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
            <Text size="sm" fw={600} lineClamp={1}>
              {gist.title}
            </Text>
            <Badge
              size="xs"
              variant="light"
              color={gist.isPublic ? 'teal' : 'gray'}
              leftSection={gist.isPublic ? <TbGlobe size={10} /> : <TbLock size={10} />}
              style={{ flexShrink: 0 }}
            >
              {gist.isPublic ? 'Public' : 'Private'}
            </Badge>
          </Group>
        </Group>
        <Divider />

        {gist.description && (
          <Text size="sm" c="dimmed">
            {gist.description}
          </Text>
        )}

        <Tabs value={String(activeFile)} onChange={(v) => setActiveFile(Number(v))} variant="outline">
          <Tabs.List>
            {gist.files.map((f, i) => (
              <Tabs.Tab key={f.filename} value={String(i)} leftSection={<TbFileCode size={12} />}>
                <Group gap={4}>
                  <Text size="xs">{f.filename}</Text>
                  <Badge size="xs" variant="dot" color={getLangColor(f.language)}>
                    {f.language}
                  </Badge>
                </Group>
              </Tabs.Tab>
            ))}
            {isOwner && (
              <Tooltip label="Tambah file" withArrow>
                <ActionIcon size="sm" variant="subtle" color="gray" ml={4} my="auto" onClick={onEdit}>
                  <TbPlus size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Tabs.List>
          {gist.files.map((f, i) => (
            <Tabs.Panel key={f.filename} value={String(i)} pt="xs">
              <Group justify="flex-end" gap={4} mb={4}>
                <Tooltip label="Preview layar penuh">
                  <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setFullscreen(true)}>
                    <TbArrowsMaximize size={11} />
                  </ActionIcon>
                </Tooltip>
                <CopyButton value={f.content} timeout={2000}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Tersalin!' : 'Salin konten'}>
                      <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                        {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
                <Tooltip label="Buka raw">
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="gray"
                    component="a"
                    href={
                      gist.isPublic
                        ? `/api/public/gists/${gist.id}/raw/${encodeURIComponent(f.filename)}`
                        : `/api/envman/gists/${gist.id}/raw/${encodeURIComponent(f.filename)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <TbEye size={11} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <Box style={{ maxHeight: 400, overflowY: 'auto' }}>
                <MarkdownRenderer fontSize={13}>{renderContent(f)}</MarkdownRenderer>
              </Box>
            </Tabs.Panel>
          ))}
        </Tabs>

        <Group gap={4} wrap="wrap">
          {gist.tags.map((t) => (
            <Badge key={t} size="xs" variant="outline" color="gray">
              {t}
            </Badge>
          ))}
          <Text size="xs" c="dimmed" ml="auto">
            oleh {gist.user.name} · {relTime(gist.updatedAt)}
          </Text>
        </Group>

        <Divider />

        <Group justify="space-between">
          <Group gap={4}>
            <CopyButton value={file?.content ?? ''} timeout={2000}>
              {({ copied, copy }) => (
                <Button
                  type="button"
                  size="xs"
                  variant="subtle"
                  color={copied ? 'teal' : 'gray'}
                  leftSection={copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                  onClick={copy}
                >
                  {copied ? 'Tersalin!' : `Copy ${file?.filename ?? ''}`}
                </Button>
              )}
            </CopyButton>
            {file && (
              <Button
                type="button"
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<TbEye size={13} />}
                component="a"
                href={
                  gist.isPublic
                    ? `/api/public/gists/${gist.id}/raw/${encodeURIComponent(file.filename)}`
                    : `/api/envman/gists/${gist.id}/raw/${encodeURIComponent(file.filename)}`
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                Raw
              </Button>
            )}
          </Group>
          {isOwner && (
            <Button type="button" size="xs" leftSection={<TbEdit size={13} />} onClick={onEdit}>
              Edit
            </Button>
          )}
        </Group>
      </Stack>

      <Modal
        opened={fullscreen}
        onClose={() => setFullscreen(false)}
        fullScreen
        radius={0}
        title={
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <TbFileCode size={14} style={{ flexShrink: 0 }} />
            <Text size="sm" fw={600} lineClamp={1}>
              {file?.filename}
            </Text>
            {file && (
              <Badge size="xs" variant="dot" color={getLangColor(file.language)} style={{ flexShrink: 0 }}>
                {file.language}
              </Badge>
            )}
          </Group>
        }
        styles={{ body: { paddingTop: 'var(--mantine-spacing-md)' } }}
      >
        {file && <MarkdownRenderer fontSize={13}>{renderContent(file)}</MarkdownRenderer>}
      </Modal>
    </Paper>
  )
}

// ─── GistsPage ────────────────────────────────────────────────────────────────

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

  useHotkeys([
    [
      '/',
      () => {
        searchRef.current?.focus()
        searchRef.current?.select()
      },
    ],
  ])

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

  // ─── Navigation helpers ──────────────────────────────────────────────────────
  const goToList = () => navigate({ to: '/envmanager/gists', search: { gist: undefined, edit: undefined } })
  const goToNew = () => navigate({ to: '/envmanager/gists', search: { gist: 'new', edit: undefined } })
  const goToView = (id: string) => navigate({ to: '/envmanager/gists', search: { gist: id, edit: undefined } })
  const goToEdit = (id: string) => navigate({ to: '/envmanager/gists', search: { gist: id, edit: true } })

  // Resolve gist dari cached data (tidak ada endpoint GET /gists/:id)
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
            <Text size="sm" c="dimmed">
              /
            </Text>
            <Text size="sm" fw={600}>
              Buat Gist Baru
            </Text>
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
            <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={goToList}>
              Gists
            </Text>
            <Text size="sm" c="dimmed">
              /
            </Text>
            <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={() => goToView(gistParam)} lineClamp={1}>
              {selectedGist.title}
            </Text>
            <Text size="sm" c="dimmed">
              /
            </Text>
            <Text size="sm" fw={600}>
              Edit
            </Text>
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
    // Gist tidak ditemukan di data yang sudah di-load
    return (
      <Stack gap="md">
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={goToList}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={goToList}>
            Gists
          </Text>
        </Group>
        <Text size="sm" c="dimmed">
          Gist tidak ditemukan.
        </Text>
      </Stack>
    )
  }

  // ─── Derived counts ──────────────────────────────────────────────────────────
  const deleteGist = (g: Gist) => {
    const modalId = `delete-gist-${g.id}`
    modals.open({
      modalId,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md">
            <TbTrash size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">
            Hapus gist
          </Text>
        </Group>
      ),
      children: (
        <Stack gap="sm">
          <Text size="sm">
            Hapus gist <strong>{g.title}</strong>?
          </Text>
          <Box
            p="xs"
            bg="var(--mantine-color-default-hover)"
            style={{ border: '1px solid var(--mantine-color-default-border)' }}
          >
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
          <Text size="xs" c="dimmed">
            Tindakan ini tidak dapat dibatalkan.
          </Text>
          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" color="gray" onClick={() => modals.close(modalId)}>
              Batal
            </Button>
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

  const mineCount = gists.filter((g) => g.user.id === myUserId).length
  const publicCount = gists.filter((g) => g.isPublic).length
  const hasFilter = debouncedSearch.trim().length > 0 || tagFilter.length > 0 || filter !== 'all'
  const resetFilter = () => {
    setSearch('')
    setTagFilter([])
    setFilter('all')
  }
  const privateCount = gists.filter((g) => !g.isPublic && g.user.id === myUserId).length

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
            <Text fw={700} size="lg" lh={1.2}>
              Gists
            </Text>
            {isLoading ? (
              <Text size="xs" c="dimmed" mt={2}>
                Memuat...
              </Text>
            ) : gists.length === 0 ? (
              <Text size="xs" c="dimmed" mt={2}>
                Snippets, config, atau script untuk tim
              </Text>
            ) : (
              <Group gap={4} mt={2} wrap="wrap">
                <Text size="xs" c="dimmed">
                  {gists.length} gist
                </Text>
                <Text size="xs" c="dimmed">
                  ·
                </Text>
                <Text size="xs" c="dimmed">
                  {publicCount} public
                </Text>
                <Text size="xs" c="dimmed">
                  ·
                </Text>
                <Text size="xs" c="dimmed">
                  {mineCount} milik saya
                </Text>
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
          <Text size="sm" fw={500} mb={4}>
            Apa itu Gists?
          </Text>
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
        <Stack gap="xs" mb="md">
          <TextInput
            ref={searchRef}
            size="sm"
            placeholder="Cari judul, deskripsi, filename, isi, atau tag..."
            leftSection={<TbSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maw={540}
            rightSection={
              search ? (
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  aria-label="Hapus pencarian"
                  onClick={() => setSearch('')}
                >
                  <TbX size={12} />
                </ActionIcon>
              ) : (
                <Tooltip label="Tekan / untuk focus">
                  <Kbd size="xs">/</Kbd>
                </Tooltip>
              )
            }
            rightSectionWidth={36}
            radius="md"
          />

          {/* Filter row — wrap di mobile */}
          <Group gap="xs" wrap="wrap">
            {(
              [
                { value: 'all', label: `Semua (${gists.length})` },
                { value: 'mine', label: `Milik saya (${mineCount})` },
                { value: 'public', label: `Public (${publicCount})` },
                { value: 'private', label: `Private (${privateCount})` },
              ] as const
            ).map((f) => (
              <Badge
                key={f.value}
                size="sm"
                variant={filter === f.value ? 'filled' : 'outline'}
                color="primary"
                style={{ cursor: 'pointer' }}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </Badge>
            ))}
            {allTags.length > 0 && (
              <MultiSelectChips
                size="sm"
                label="Tag"
                icon={<TbTag size={14} />}
                width={130}
                options={allTags}
                value={tagFilter}
                onChange={setTagFilter}
              />
            )}
            <Select
              size="sm"
              w={150}
              leftSection={<TbSortAscending size={14} />}
              value={sort}
              onChange={(v) => setSort((v ?? 'updated') as typeof sort)}
              data={[
                { label: 'Terbaru edit', value: 'updated' },
                { label: 'Terbaru buat', value: 'created' },
              ]}
              allowDeselect={false}
              radius="md"
            />
            <Group gap={4} wrap="nowrap">
              <Tooltip label="Tampilan list" withArrow>
                <ActionIcon
                  size="sm"
                  variant={view === 'list' ? 'filled' : 'subtle'}
                  color={view === 'list' ? 'violet' : 'gray'}
                  aria-label="Tampilan list"
                  onClick={() => setView('list')}
                >
                  <TbLayoutList size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Tampilan grid" withArrow>
                <ActionIcon
                  size="sm"
                  variant={view === 'grid' ? 'filled' : 'subtle'}
                  color={view === 'grid' ? 'violet' : 'gray'}
                  aria-label="Tampilan grid"
                  onClick={() => setView('grid')}
                >
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
          </Group>

          {/* Active tag chips */}
          {tagFilter.length > 0 && (
            <Group gap={6} wrap="wrap" align="center">
              <MultiSelectChipsRow value={tagFilter} onChange={setTagFilter} />
            </Group>
          )}

          {/* Result count + reset */}
          {hasFilter && (
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed">
                {filtered.length === gists.length
                  ? `${gists.length} gist`
                  : `${filtered.length} dari ${gists.length} gist`}
              </Text>
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={<TbX size={11} />}
                onClick={resetFilter}
              >
                Reset filter
              </Button>
            </Group>
          )}
        </Stack>
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
          <Text fw={600} mb={4}>
            Belum ada gists
          </Text>
          <Text size="sm" c="dimmed" mb="md" maw={420} mx="auto">
            Gist untuk simpan snippets kode, config file, atau script yang sering dipakai. Dukung Markdown, syntax
            highlighting, dan multi-file.
          </Text>
          {canCreateGist ? (
            <Button type="button" size="sm" color="primary" leftSection={<TbPlus size={14} />} onClick={goToNew}>
              Buat Gist Pertama
            </Button>
          ) : (
            <Text size="xs" c="dimmed">
              Tidak punya izin create gist. Hubungi SUPER_ADMIN.
            </Text>
          )}
        </Box>
      ) : filtered.length === 0 ? (
        <Box p="md" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
          <ThemeIcon size={44} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
            <TbSearch size={22} />
          </ThemeIcon>
          <Text fw={600} mb={4}>
            Tidak ada hasil
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            Tidak ada gist yang cocok dengan filter saat ini.
          </Text>
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

            if (!groupByTag || allTags.length === 0) return renderCards(filtered)

            const grouped = new Map<string, typeof filtered>()
            const untagged: typeof filtered = []
            for (const g of filtered) {
              if (g.tags.length === 0) {
                untagged.push(g)
                continue
              }
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
                      <Text size="xs" c="dimmed" fw={500}>
                        Tanpa tag
                      </Text>
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
