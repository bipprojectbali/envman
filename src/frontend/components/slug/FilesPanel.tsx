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
import { useDebouncedValue, useLocalStorage, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  TbCheck,
  TbChevronLeft,
  TbChevronRight,
  TbCopy,
  TbEdit,
  TbEye,
  TbFileCode,
  TbFilePlus,
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
import { CodeEditor } from '@/frontend/components/CodeEditor'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { MultiSelectChips, MultiSelectChipsRow } from '@/frontend/components/MultiSelectChips'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileEntry {
  filename: string
  content: string
  language: string
}

export interface ProjectFile {
  id: string
  title: string
  description: string
  prefix: string | null
  files: FileEntry[]
  tags: string[]
  createdAt: string
  updatedAt: string
  author: { id: string; name: string }
}

export interface FilesPanelProps {
  slug: string
  isOwner: boolean
  myUserId: string
  canEdit: boolean
}

// ─── Language constants ───────────────────────────────────────────────────────

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

function adjustFilenameForLang(filename: string, oldLang: string, newLang: string): string {
  const oldExt = getExt(oldLang)
  const newExt = getExt(newLang)
  if (oldExt === newExt) return filename
  if (newExt === 'Dockerfile') return 'Dockerfile'
  if (filename === 'Dockerfile' && oldLang === 'dockerfile') return `file.${newExt}`
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return filename ? `${filename}.${newExt}` : `file.${newExt}`
  const base = filename.slice(0, lastDot)
  const currentExt = filename.slice(lastDot + 1)
  if (currentExt === oldExt) return `${base}.${newExt}`
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
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
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
.envman-file-card {
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.15s ease;
}
.envman-file-card:hover {
  transform: translateY(-1px);
  border-color: var(--mantine-color-blue-5);
  box-shadow: var(--mantine-shadow-sm);
}
.envman-file-card:focus-visible {
  outline: 2px solid var(--mantine-color-blue-5);
  outline-offset: 2px;
}
`

// ─── FileForm ─────────────────────────────────────────────────────────────────

function slugifyPrefix(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function FileForm({ slug, file, onClose }: { slug: string; file?: ProjectFile; onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(file?.title ?? '')
  const [description, setDescription] = useState(file?.description ?? '')
  const [prefix, setPrefix] = useState(file?.prefix ?? '')
  const [prefixManual, setPrefixManual] = useState(!!file?.prefix)
  const [tags, setTags] = useState<string[]>(file?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [files, setFiles] = useState<FileEntry[]>(
    file?.files.length ? file.files : [{ filename: 'file1.txt', content: '', language: 'plaintext' }],
  )
  const [activeFile, setActiveFile] = useState(0)
  const [preview, setPreview] = useState<'write' | 'preview'>('write')

  const handleTitleChange = (val: string) => {
    setTitle(val)
    if (!prefixManual) setPrefix(slugifyPrefix(val))
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title,
        description,
        prefix: prefix.trim() || null,
        files,
        tags,
      }
      return file
        ? apiFetch(`/api/envman/projects/${slug}/files/${file.id}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
        : apiFetch(`/api/envman/projects/${slug}/files`, {
            method: 'POST',
            body: JSON.stringify(body),
          })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'files', slug] })
      notifyOk(file ? 'File diperbarui' : 'File dibuat')
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

  const updateFile = (i: number, patch: Partial<FileEntry>) =>
    setFiles((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))

  const totalLines = files.reduce((sum, f) => sum + (f.content ? f.content.split('\n').length : 0), 0)
  const totalChars = files.reduce((sum, f) => sum + f.content.length, 0)
  const canSave = !!title.trim() && files.every((f) => f.filename.trim())

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <TextInput
          label="Judul"
          placeholder="Nama file (contoh: Docker Compose production)"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          autoFocus={!file}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
          required
        />
        <TextInput
          label="Prefix CLI"
          description={
            prefix ? (
              <span>
                CLI path: <Code fz="xs">{slug}:prefix/filename.ext</Code> atau{' '}
                <Code fz="xs">files:{prefix}/filename</Code>
              </span>
            ) : (
              'Auto-generate dari judul. Tidak berubah saat rename judul.'
            )
          }
          placeholder="compose-dev"
          value={prefix}
          onChange={(e) => {
            setPrefixManual(true)
            setPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
          styles={{ input: { fontFamily: 'ui-monospace, monospace' } }}
        />
        <TextInput
          label="Deskripsi"
          placeholder="Deskripsi singkat — apa fungsi file ini (opsional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
          size="sm"
        />
      </Stack>

      <Divider />

      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <ThemeIcon size={22} radius="md" variant="light" color="blue">
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
            color="blue"
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
                  style={{
                    maxWidth: 140,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.filename || `file${i + 1}`}
                </Text>
              </Tabs.Tab>
            ))}
          </Tabs.List>

          {files.map((f, i) => (
            <Tabs.Panel key={f.filename || i} value={String(i)} pt="sm">
              <Stack gap="xs">
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

                {preview === 'write' ? (
                  <Box>
                    <CodeEditor
                      value={f.content}
                      onChange={(v) => updateFile(i, { content: v })}
                      language={f.language}
                      filename={f.filename}
                      placeholder={
                        f.language === 'markdown'
                          ? '# Heading\n\nKonten markdown...'
                          : `Isi konten ${f.language} di sini...`
                      }
                      height={400}
                    />
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
                    {(f.language === 'typescript' || f.language === 'javascript') && (
                      <Text size="xs" c="dimmed" mt={4} px={4}>
                        Bun auto-install: npm imports langsung dipakai tanpa <Code fz="xs">bun install</Code>. Pin
                        versi: <Code fz="xs">{'import { z } from "zod@^3.22"'}</Code>
                      </Text>
                    )}
                  </Box>
                ) : (
                  <Box
                    p="md"
                    mih={220}
                    style={{
                      borderRadius: 'var(--mantine-radius-md)',
                      border: '1px solid var(--mantine-color-default-border)',
                    }}
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

      <Stack gap="xs">
        <TextInput
          label="Tags"
          description="Ketik tag lalu tekan Enter atau koma"
          placeholder="config, docker, ci..."
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          leftSection={<TbTag size={13} />}
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
        />
        {tags.length > 0 && (
          <Group gap={4} wrap="wrap">
            {tags.map((t) => (
              <Badge
                key={t}
                size="xs"
                variant="light"
                color="blue"
                pr={3}
                rightSection={
                  <ActionIcon
                    size={12}
                    variant="transparent"
                    color="inherit"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                  >
                    <TbX size={9} />
                  </ActionIcon>
                }
              >
                {t}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>

      <Divider />

      <Group justify="space-between">
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
            color="blue"
          >
            {file ? 'Simpan perubahan' : 'Buat File'}
          </Button>
        </Group>
      </Group>
    </Stack>
  )
}

// ─── FileCard ─────────────────────────────────────────────────────────────────

function FileCard({
  file,
  slug,
  canManage,
  onEdit,
  onDelete,
  onView,
  onTagClick,
}: {
  file: ProjectFile
  slug: string
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
  onView: () => void
  onTagClick?: (tag: string) => void
}) {
  const firstFile = file.files[0]
  return (
    <Box
      p="sm"
      className="envman-file-card"
      role="article"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onView()
        }
      }}
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        border: '1px solid var(--mantine-color-default-border)',
        cursor: 'pointer',
      }}
    >
      <Group justify="space-between" wrap="nowrap" mb={4}>
        <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon size={28} radius="sm" variant="light" color="blue">
            <TbFiles size={15} />
          </ThemeIcon>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text
              fw={700}
              size="sm"
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {file.title}
            </Text>
            {file.description && (
              <Text size="xs" c="dimmed" lineClamp={1}>
                {file.description}
              </Text>
            )}
          </Box>
        </Group>
        <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
          <CopyButton value={file.files.map((f) => `// ${f.filename}\n${f.content}`).join('\n\n')} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Tersalin!' : 'Salin semua file'} position="left">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color={copied ? 'teal' : 'gray'}
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
          {canManage && (
            <>
              <Tooltip label="Edit" position="left">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="blue"
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

      {/* Prefix + per-file copy path */}
      {file.prefix && (
        <Group gap={4} mb={6} wrap="wrap" align="center" onClick={(e) => e.stopPropagation()}>
          <Code fz="xs" c="dimmed">
            {slug}:{file.prefix}/…
          </Code>
          {file.files.map((f) => {
            const path = `${slug}:${file.prefix}/${f.filename}`
            return (
              <CopyButton key={f.filename} value={path} timeout={2000}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Disalin!' : path} withArrow>
                    <Badge
                      size="xs"
                      variant={copied ? 'filled' : 'light'}
                      color={copied ? 'teal' : getLangColor(f.language)}
                      style={{ cursor: 'pointer' }}
                      rightSection={copied ? <TbCheck size={9} /> : <TbCopy size={9} />}
                      onClick={(e) => {
                        e.stopPropagation()
                        copy()
                      }}
                    >
                      {f.filename}
                    </Badge>
                  </Tooltip>
                )}
              </CopyButton>
            )
          })}
        </Group>
      )}

      {firstFile && (
        <Code
          block
          style={{
            fontSize: 11,
            maxHeight: 80,
            overflow: 'hidden',
            marginBottom: 6,
          }}
        >
          {firstFile.content.split('\n').slice(0, 4).join('\n') || '(kosong)'}
        </Code>
      )}

      <Group gap={4} wrap="wrap" align="center">
        {!file.prefix &&
          file.files.slice(0, 3).map((f) => (
            <Tooltip key={f.filename} label={`${f.language} · ${f.content.split('\n').length} baris`}>
              <Badge size="xs" variant="dot" color={getLangColor(f.language)}>
                {f.filename}
              </Badge>
            </Tooltip>
          ))}
        {file.files.length > 3 && (
          <Tooltip
            label={file.files
              .slice(3)
              .map((f) => f.filename)
              .join(', ')}
          >
            <Badge size="xs" variant="default">
              +{file.files.length - 3}
            </Badge>
          </Tooltip>
        )}
        {file.tags.slice(0, 3).map((t) => (
          <Badge
            key={t}
            size="xs"
            variant="outline"
            color="gray"
            style={{ cursor: 'pointer' }}
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
        {file.tags.length > 3 && (
          <Tooltip label={file.tags.slice(3).join(', ')}>
            <Text size="xs" c="dimmed">
              +{file.tags.length - 3}
            </Text>
          </Tooltip>
        )}
        <Tooltip label={`Diperbarui ${absoluteTime(file.updatedAt)} oleh ${file.author.name}`}>
          <Text size="xs" c="dimmed" ml="auto">
            {file.author.name} · {relTime(file.updatedAt)}
          </Text>
        </Tooltip>
      </Group>
    </Box>
  )
}

// ─── FilesPanel ───────────────────────────────────────────────────────────────

export function FilesPanel({ slug, isOwner, myUserId, canEdit }: FilesPanelProps) {
  const qc = useQueryClient()
  const _isMobile = useMediaQuery('(max-width: 48em)')
  const searchRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useLocalStorage<string[]>({
    key: `envman:files:${slug}:tagFilter`,
    defaultValue: [],
  })
  const [sort, setSort] = useLocalStorage<'updated' | 'created'>({
    key: `envman:files:${slug}:sort`,
    defaultValue: 'updated',
  })
  const [groupByTag, setGroupByTag] = useLocalStorage<boolean>({
    key: `envman:files:${slug}:groupByTag`,
    defaultValue: true,
  })
  const [view, setView] = useLocalStorage<'list' | 'grid'>({
    key: `envman:files:${slug}:view`,
    defaultValue: 'list',
  })
  const [debouncedSearch] = useDebouncedValue(search, 150)
  const navigate = useNavigate()
  const { tab, fileId, fileNew, viewFileId } = useSearch({
    from: '/envmanager/$slug/',
  })

  const canManageFile = (authorId: string) => isOwner || authorId === myUserId

  const openView = (id: string) =>
    navigate({
      to: '/envmanager/$slug',
      params: { slug },
      search: {
        tab,
        fileId: undefined,
        fileNew: false,
        viewFileId: id,
        aliasId: undefined,
        aliasNew: false,
        viewAliasId: undefined,
        noteId: undefined,
        noteNew: false,
        viewNoteId: undefined,
      },
    })
  const closeView = () =>
    navigate({
      to: '/envmanager/$slug',
      params: { slug },
      search: {
        tab,
        fileId: undefined,
        fileNew: false,
        viewFileId: undefined,
        aliasId: undefined,
        aliasNew: false,
        viewAliasId: undefined,
        noteId: undefined,
        noteNew: false,
        viewNoteId: undefined,
      },
    })

  const { data, isLoading, isError } = useQuery<{ files: ProjectFile[] }>({
    queryKey: ['envman', 'files', slug],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/files`),
    staleTime: 60_000,
  })

  const files = data?.files ?? []
  const editingFile = fileId ? (files.find((f) => f.id === fileId) ?? null) : null
  const formOpen = fileNew || !!editingFile
  const closeForm = () =>
    navigate({
      to: '/envmanager/$slug',
      params: { slug },
      search: {
        tab,
        fileId: undefined,
        fileNew: false,
        viewFileId: undefined,
        aliasId: undefined,
        aliasNew: false,
        viewAliasId: undefined,
        noteId: undefined,
        noteNew: false,
        viewNoteId: undefined,
      },
    })

  const allTags = useMemo(() => [...new Set(files.flatMap((f) => f.tags))].sort(), [files])

  const addTagFilter = (tag: string) => setTagFilter((prev) => (prev.includes(tag) ? prev : [...prev, tag]))

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
  const [activeViewTab, setActiveViewTab] = useState(0)
  useEffect(() => setPage(1), [])
  const totalPages = Math.ceil(filtered.length / FILES_PER_PAGE)
  const paginated = filtered.slice((page - 1) * FILES_PER_PAGE, page * FILES_PER_PAGE)

  const openEdit = (file: ProjectFile) =>
    navigate({
      to: '/envmanager/$slug',
      params: { slug },
      search: {
        tab,
        fileId: file.id,
        fileNew: false,
        viewFileId: undefined,
        aliasId: undefined,
        aliasNew: false,
        viewAliasId: undefined,
        noteId: undefined,
        noteNew: false,
        viewNoteId: undefined,
      },
    })
  const openCreate = () =>
    navigate({
      to: '/envmanager/$slug',
      params: { slug },
      search: {
        tab,
        fileNew: true,
        fileId: undefined,
        viewFileId: undefined,
        aliasId: undefined,
        aliasNew: false,
        viewAliasId: undefined,
        noteId: undefined,
        noteNew: false,
        viewNoteId: undefined,
      },
    })

  const deleteFile = (f: ProjectFile) => {
    const modalId = `delete-file-${f.id}`
    modals.open({
      modalId,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md">
            <TbTrash size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">
            Hapus file
          </Text>
        </Group>
      ),
      children: (
        <Stack gap="sm">
          <Text size="sm">
            Hapus <strong>{f.title}</strong>?
          </Text>
          <Box
            p="xs"
            style={{
              borderRadius: 'var(--mantine-radius-md)',
              border: '1px solid var(--mantine-color-default-border)',
              background: 'var(--mantine-color-default-hover)',
            }}
          >
            <Group gap={4} mb={4}>
              {f.files.map((e) => (
                <Badge key={e.filename} size="xs" variant="dot" color={getLangColor(e.language)}>
                  {e.filename}
                </Badge>
              ))}
            </Group>
            <Text size="xs" c="dimmed">
              {f.files.length} file · dibuat {absoluteTime(f.createdAt)}
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
                apiFetch(`/api/envman/projects/${slug}/files/${f.id}`, {
                  method: 'DELETE',
                })
                  .then(() => {
                    qc.invalidateQueries({
                      queryKey: ['envman', 'files', slug],
                    })
                    notifyOk('File dihapus')
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

  const _hasFilter = debouncedSearch.trim().length > 0 || tagFilter.length > 0
  const resetFilter = () => {
    setSearch('')
    setTagFilter([])
  }

  if (viewFileId) {
    const viewingFile = isLoading ? null : (files.find((f) => f.id === viewFileId) ?? null)
    const currentViewFile = viewingFile?.files[activeViewTab] ?? viewingFile?.files[0]
    return (
      <Stack gap="lg">
        {/* Breadcrumb */}
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={closeView}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={closeView}>
            Files
          </Anchor>
          <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
          <Text size="sm" fw={600} lineClamp={1}>
            {viewingFile?.title ?? '...'}
          </Text>
        </Group>
        <Divider />

        {isLoading && <Skeleton height={300} radius="md" />}
        {!isLoading && !viewingFile && (
          <Text size="sm" c="dimmed">
            File tidak ditemukan.
          </Text>
        )}
        {viewingFile && (
          <Stack gap="sm">
            {viewingFile.description && (
              <Text size="sm" c="dimmed">
                {viewingFile.description}
              </Text>
            )}

            <Tabs value={String(activeViewTab)} onChange={(v) => setActiveViewTab(Number(v))} variant="outline">
              <Tabs.List>
                {viewingFile.files.map((f, i) => (
                  <Tabs.Tab key={f.filename} value={String(i)} leftSection={<TbFileCode size={12} />}>
                    <Group gap={4}>
                      <Text size="xs">{f.filename}</Text>
                      <Badge size="xs" variant="dot" color={getLangColor(f.language)}>
                        {f.language}
                      </Badge>
                    </Group>
                  </Tabs.Tab>
                ))}
              </Tabs.List>
              {viewingFile.files.map((f, i) => (
                <Tabs.Panel key={f.filename} value={String(i)} pt="xs">
                  <Box
                    p="md"
                    style={{
                      borderRadius: 'var(--mantine-radius-md)',
                      border: '1px solid var(--mantine-color-default-border)',
                      maxHeight: 500,
                      overflowY: 'auto',
                    }}
                  >
                    <MarkdownRenderer fontSize={13}>
                      {f.language === 'markdown'
                        ? f.content || '_Kosong_'
                        : `\`\`\`${f.language}\n${f.content || ''}\n\`\`\``}
                    </MarkdownRenderer>
                  </Box>
                </Tabs.Panel>
              ))}
            </Tabs>

            <Group gap={4} wrap="wrap">
              {viewingFile.tags.map((t) => (
                <Badge key={t} size="xs" variant="outline" color="gray">
                  {t}
                </Badge>
              ))}
              <Text size="xs" c="dimmed" ml="auto">
                oleh {viewingFile.author.name} · {relTime(viewingFile.updatedAt)}
              </Text>
            </Group>

            <Divider />

            <Group justify="space-between">
              <CopyButton value={currentViewFile?.content ?? ''} timeout={2000}>
                {({ copied, copy }) => (
                  <Button
                    type="button"
                    size="xs"
                    variant="subtle"
                    color={copied ? 'teal' : 'gray'}
                    leftSection={copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                    onClick={copy}
                  >
                    {copied ? 'Tersalin!' : `Copy ${currentViewFile?.filename ?? ''}`}
                  </Button>
                )}
              </CopyButton>
              {canManageFile(viewingFile.author.id) && (
                <Button
                  type="button"
                  size="xs"
                  leftSection={<TbEdit size={13} />}
                  onClick={() => {
                    navigate({
                      to: '/envmanager/$slug',
                      params: { slug },
                      search: {
                        tab,
                        fileId: viewingFile.id,
                        fileNew: false,
                        viewFileId: undefined,
                        aliasId: undefined,
                        aliasNew: false,
                        viewAliasId: undefined,
                        noteId: undefined,
                        noteNew: false,
                        viewNoteId: undefined,
                      },
                    })
                  }}
                >
                  Edit
                </Button>
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
        {/* Breadcrumb */}
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={closeForm}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={closeForm}>
            Files
          </Anchor>
          <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
          <Text size="sm" fw={600}>
            {editingFile ? 'Edit File' : 'Buat File Baru'}
          </Text>
        </Group>
        <Divider />
        <FileForm slug={slug} file={editingFile ?? undefined} onClose={closeForm} />
      </Stack>
    )
  }

  return (
    <Box>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      {/* Header */}
      <Group mb="md" justify="space-between" wrap="nowrap" align="flex-start">
        <Group gap="sm" style={{ minWidth: 0 }}>
          <ThemeIcon size={38} radius="md" variant="light" color="blue">
            <TbFiles size={20} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={700} size="lg" lh={1.2}>
              Files
            </Text>
            <Text size="xs" c="dimmed">
              {isLoading
                ? 'Memuat...'
                : files.length === 0
                  ? 'Snippets, config, dan script untuk project ini'
                  : `${files.length} file`}
            </Text>
          </Box>
        </Group>
        {canEdit && (
          <Button
            variant="light"
            type="button"
            size="sm"
            color="blue"
            leftSection={<TbPlus size={14} />}
            onClick={openCreate}
          >
            New File
          </Button>
        )}
      </Group>

      <Alert
        variant="light"
        color="blue"
        radius="md"
        mb="xs"
        p="xs"
        icon={<TbInfoCircle size={15} />}
        styles={{
          message: { fontSize: 'var(--mantine-font-size-xs)' },
          body: { gap: 4 },
        }}
      >
        <Stack gap={4}>
          <Text size="xs">
            Simpan scripts, snippets, dan config files per project. File dapat dieksekusi langsung dari CLI tanpa
            download. Jalankan: <Code fz="xs">envman -- bash {slug}:scripts/deploy.sh</Code>. Mendukung multi-file per
            entry dan preview Markdown.
          </Text>
          <Text size="xs">
            Bun scripts (.ts / .js) otomatis install npm packages saat dijalankan — tidak perlu{' '}
            <Code fz="xs">bun install</Code>. Pin versi inline:{' '}
            <Code fz="xs">{'import { z } from "zod@^3.22"'}</Code>
          </Text>
        </Stack>
      </Alert>

      {/* Toolbar */}
      {!isLoading && files.length > 0 && (
        <Stack gap="xs" mb="md">
          <TextInput
            maw={'540'}
            ref={searchRef}
            size="sm"
            placeholder="Cari judul, deskripsi, filename, isi, atau tag..."
            leftSection={<TbSearch size={13} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            rightSection={
              search ? (
                <ActionIcon size="xs" variant="subtle" onClick={() => setSearch('')}>
                  <TbX size={11} />
                </ActionIcon>
              ) : undefined
            }
            radius="md"
          />
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="xs" wrap="wrap">
              <MultiSelectChips
                value={tagFilter}
                onChange={setTagFilter}
                options={allTags}
                label="Tags"
                icon={<TbTag size={12} />}
                width={120}
                disabled={allTags.length === 0}
              />
              <Select
                size="xs"
                value={sort}
                onChange={(v) => setSort((v ?? 'updated') as 'updated' | 'created')}
                data={[
                  { value: 'updated', label: 'Terbaru diupdate' },
                  { value: 'created', label: 'Terbaru dibuat' },
                ]}
                leftSection={<TbSortAscending size={13} />}
                allowDeselect={false}
                w={160}
              />
            </Group>
            <Group gap={4}>
              <Tooltip label="List view">
                <ActionIcon
                  size="sm"
                  variant={view === 'list' ? 'filled' : 'subtle'}
                  color="blue"
                  onClick={() => setView('list')}
                >
                  <TbLayoutList size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Grid view">
                <ActionIcon
                  size="sm"
                  variant={view === 'grid' ? 'filled' : 'subtle'}
                  color="blue"
                  onClick={() => setView('grid')}
                >
                  <TbLayoutGrid size={14} />
                </ActionIcon>
              </Tooltip>
              {allTags.length > 0 && (
                <Tooltip label={groupByTag ? 'Nonaktifkan group by tag' : 'Group by tag'}>
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
          {tagFilter.length > 0 && <MultiSelectChipsRow value={tagFilter} onChange={setTagFilter} />}
        </Stack>
      )}

      {/* Skeleton */}
      {isLoading &&
        (view === 'grid' ? (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} height={156} radius="md" />
            ))}
          </SimpleGrid>
        ) : (
          <Stack gap="xs">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={76} radius="md" />
            ))}
          </Stack>
        ))}

      {/* Empty state */}
      {!isLoading && !isError && files.length === 0 && (
        <Box
          p="xl"
          ta="center"
          style={{
            border: '1px dashed var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-md)',
          }}
        >
          <ThemeIcon size={48} radius="xl" variant="light" color="blue" mx="auto" mb="sm">
            <TbFiles size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>
            Belum ada file
          </Text>
          <Text size="sm" c="dimmed" mb="md" maw={400} mx="auto">
            Simpan snippets, config files, script, atau template untuk project ini. Mendukung multi-file dan preview
            Markdown.
          </Text>
          {canEdit && (
            <Button type="button" size="xs" color="blue" leftSection={<TbPlus size={13} />} onClick={openCreate}>
              Buat File Pertama
            </Button>
          )}
        </Box>
      )}

      {/* No filter results */}
      {!isLoading && !isError && files.length > 0 && filtered.length === 0 && (
        <Box
          p="xl"
          ta="center"
          style={{
            border: '1px dashed var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-md)',
          }}
        >
          <ThemeIcon size={44} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
            <TbSearch size={22} />
          </ThemeIcon>
          <Text fw={500} size="sm" mb={4}>
            Tidak ada file yang cocok
          </Text>
          <Text size="xs" c="dimmed" mb="sm">
            Coba ubah filter atau kata kunci pencarian.
          </Text>
          <Button type="button" size="xs" variant="light" leftSection={<TbX size={11} />} onClick={resetFilter}>
            Reset filter
          </Button>
        </Box>
      )}

      {/* List */}
      {!isLoading && !isError && filtered.length > 0 && (
        <>
          {groupByTag && allTags.length > 0 ? (
            (() => {
              const grouped = new Map<string, typeof filtered>()
              const untagged: typeof filtered = []
              for (const f of filtered) {
                if (f.tags.length === 0) {
                  untagged.push(f)
                  continue
                }
                const tag = f.tags[0]
                if (!grouped.has(tag)) grouped.set(tag, [])
                grouped.get(tag)!.push(f)
              }
              const groups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
              const renderCards = (items: typeof filtered) =>
                view === 'grid' ? (
                  <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
                    {items.map((f) => (
                      <FileCard
                        key={f.id}
                        file={f}
                        slug={slug}
                        canManage={canManageFile(f.author.id)}
                        onView={() => openView(f.id)}
                        onEdit={() => openEdit(f)}
                        onDelete={() => deleteFile(f)}
                        onTagClick={addTagFilter}
                      />
                    ))}
                  </SimpleGrid>
                ) : (
                  <Stack gap="xs">
                    {items.map((f) => (
                      <FileCard
                        key={f.id}
                        file={f}
                        slug={slug}
                        canManage={canManageFile(f.author.id)}
                        onView={() => openView(f.id)}
                        onEdit={() => openEdit(f)}
                        onDelete={() => deleteFile(f)}
                        onTagClick={addTagFilter}
                      />
                    ))}
                  </Stack>
                )
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
            })()
          ) : view === 'grid' ? (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
              {paginated.map((f) => (
                <FileCard
                  key={f.id}
                  file={f}
                  slug={slug}
                  canManage={canManageFile(f.author.id)}
                  onView={() => openView(f.id)}
                  onEdit={() => openEdit(f)}
                  onDelete={() => deleteFile(f)}
                  onTagClick={addTagFilter}
                />
              ))}
            </SimpleGrid>
          ) : (
            <Stack gap="xs">
              {paginated.map((f) => (
                <FileCard
                  key={f.id}
                  file={f}
                  slug={slug}
                  canManage={canManageFile(f.author.id)}
                  onView={() => openView(f.id)}
                  onEdit={() => openEdit(f)}
                  onDelete={() => deleteFile(f)}
                  onTagClick={addTagFilter}
                />
              ))}
            </Stack>
          )}
          {!groupByTag && totalPages > 1 && (
            <Group justify="center" mt="md">
              <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
            </Group>
          )}
        </>
      )}
    </Box>
  )
}
