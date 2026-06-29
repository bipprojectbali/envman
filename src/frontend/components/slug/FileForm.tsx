import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  TbCheck,
  TbEdit,
  TbEye,
  TbFileCode,
  TbFilePlus,
  TbTag,
  TbX,
} from 'react-icons/tb'
import { CodeEditor } from '@/frontend/components/CodeEditor'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { apiFetch } from '@/frontend/lib/api'
import { LANGUAGES, adjustFilenameForLang, getLangColor } from '@/frontend/lib/languages'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

export interface FileEntry {
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

function slugifyPrefix(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function FileForm({ slug, file, onClose }: { slug: string; file?: ProjectFile; onClose: () => void }) {
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
      const body = { title, description, prefix: prefix.trim() || null, files, tags }
      return file
        ? apiFetch(`/api/envman/projects/${slug}/files/${file.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : apiFetch(`/api/envman/projects/${slug}/files`, { method: 'POST', body: JSON.stringify(body) })
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
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
          required
        />
        <TextInput
          label="Prefix CLI"
          description={
            prefix ? (
              <span>CLI path: <Code fz="xs">{slug}:prefix/filename.ext</Code> atau <Code fz="xs">files:{prefix}/filename</Code></span>
            ) : (
              'Auto-generate dari judul. Tidak berubah saat rename judul.'
            )
          }
          placeholder="compose-dev"
          value={prefix}
          onChange={(e) => { setPrefixManual(true); setPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
          styles={{ input: { fontFamily: 'ui-monospace, monospace' } }}
        />
        <TextInput
          label="Deskripsi"
          placeholder="Deskripsi singkat — apa fungsi file ini (opsional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
          size="sm"
        />
      </Stack>

      <Divider />

      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <ThemeIcon size={22} radius="md" variant="light" color="blue"><TbFileCode size={13} /></ThemeIcon>
            <Text size="sm" fw={600}>Files</Text>
            <Badge size="xs" variant="light" color="gray">{files.length}</Badge>
          </Group>
          <Button type="button" size="xs" variant="light" color="blue" leftSection={<TbFilePlus size={13} />} onClick={addFile}>
            Tambah file
          </Button>
        </Group>

        <Tabs value={String(activeFile)} onChange={(v) => setActiveFile(Number(v))} variant="outline" radius="md">
          <Tabs.List>
            {files.map((f, i) => (
              <Tabs.Tab
                key={f.filename || i}
                value={String(i)}
                leftSection={<Box style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: `var(--mantine-color-${getLangColor(f.language)}-5)` }} />}
                rightSection={
                  files.length > 1 ? (
                    <Tooltip label="Hapus file" position="top" withArrow>
                      <ActionIcon component="div" size="xs" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); removeFile(i) }}>
                        <TbX size={10} />
                      </ActionIcon>
                    </Tooltip>
                  ) : undefined
                }
              >
                <Text size="xs" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                    label="Filename" size="xs" placeholder="filename.ext" value={f.filename}
                    onChange={(e) => updateFile(i, { filename: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                    style={{ flex: 1 }} leftSection={<TbFileCode size={12} />}
                  />
                  <Select
                    label="Language" size="xs" value={f.language}
                    onChange={(v) => {
                      const newLang = v ?? 'plaintext'
                      updateFile(i, { language: newLang, filename: adjustFilenameForLang(f.filename, f.language, newLang) })
                    }}
                    data={LANGUAGES} searchable allowDeselect={false} style={{ width: 160 }}
                  />
                  <SegmentedControl
                    size="xs" value={preview} onChange={(v) => setPreview(v as 'write' | 'preview')}
                    data={[
                      { label: <Group gap={4} wrap="nowrap"><TbEdit size={11} /><span>Tulis</span></Group>, value: 'write' },
                      { label: <Group gap={4} wrap="nowrap"><TbEye size={11} /><span>Preview</span></Group>, value: 'preview' },
                    ]}
                  />
                </Group>

                {preview === 'write' ? (
                  <Box>
                    <CodeEditor
                      value={f.content} onChange={(v) => updateFile(i, { content: v })}
                      language={f.language} filename={f.filename}
                      placeholder={f.language === 'markdown' ? '# Heading\n\nKonten markdown...' : `Isi konten ${f.language} di sini...`}
                      height={400}
                    />
                    <Group justify="space-between" mt={4} px={4}>
                      <Group gap="xs">
                        <Badge size="xs" variant="dot" color={getLangColor(f.language)}>{f.language}</Badge>
                        <Text size="xs" c="dimmed">
                          {f.content ? `${f.content.split('\n').length} baris · ${f.content.length} karakter` : 'Kosong'}
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed">Monaco editor · syntax highlight</Text>
                    </Group>
                    {(f.language === 'typescript' || f.language === 'javascript') && (
                      <Text size="xs" c="dimmed" mt={4} px={4}>
                        Bun auto-install: npm imports langsung dipakai tanpa <Code fz="xs">bun install</Code>. Pin versi:{' '}
                        <Code fz="xs">{'import { z } from "zod@^3.22"'}</Code>
                      </Text>
                    )}
                  </Box>
                ) : (
                  <Box p="md" mih={220} style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}>
                    {f.content ? (
                      <MarkdownRenderer fontSize={13}>
                        {f.language === 'markdown' ? f.content : `\`\`\`${f.language}\n${f.content}\n\`\`\``}
                      </MarkdownRenderer>
                    ) : (
                      <Group justify="center" py="xl">
                        <Stack gap={4} align="center"><TbEye size={20} opacity={0.3} /><Text size="sm" c="dimmed">Belum ada konten untuk preview.</Text></Stack>
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
              const t = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
              if (t && !tags.includes(t)) setTags((prev) => [...prev, t])
              setTagInput('')
            }
          }}
        />
        {tags.length > 0 && (
          <Group gap={4} wrap="wrap">
            {tags.map((t) => (
              <Badge key={t} size="xs" variant="light" color="blue" pr={3}
                rightSection={
                  <ActionIcon size={12} variant="transparent" color="inherit" onClick={() => setTags((prev) => prev.filter((x) => x !== t))}>
                    <TbX size={9} />
                  </ActionIcon>
                }>
                {t}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>

      <Divider />

      <Group justify="space-between">
        <Text size="xs" c="dimmed">{files.length} file · {totalLines} baris · {totalChars} karakter</Text>
        <Group gap="xs">
          <Button type="button" variant="subtle" color="gray" onClick={onClose}>Batal</Button>
          <Button type="button" leftSection={<TbCheck size={14} />} onClick={() => save.mutate()} loading={save.isPending} disabled={!canSave} color="blue">
            {file ? 'Simpan perubahan' : 'Buat File'}
          </Button>
        </Group>
      </Group>
    </Stack>
  )
}
