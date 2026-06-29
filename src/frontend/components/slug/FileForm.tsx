import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Group,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCheck, TbFileCode, TbTag, TbX } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { FileTabsEditor } from './FileTabsEditor'

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

      <FileTabsEditor
        files={files} activeFile={activeFile} preview={preview}
        setActiveFile={setActiveFile} setPreview={setPreview}
        addFile={addFile} removeFile={removeFile} updateFile={updateFile}
      />

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
