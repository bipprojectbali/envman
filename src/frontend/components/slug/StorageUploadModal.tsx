import { Box, Button, Code, FileInput, Group, Image, Progress, ScrollArea, Stack, TagsInput, Text, TextInput, Textarea } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { TbClipboard, TbCloudUpload } from 'react-icons/tb'
import { fmtBytes, isTextFile } from '@/frontend/lib/storage-format'

interface Props {
  slug: string
  prefix: string
  onSuccess: () => void
  onClose: () => void
}

interface UploadProgress {
  percent: number
  loaded: number
  total: number
  speedBps: number
  etaSec: number | null
}

function fmtEta(sec: number): string {
  if (sec < 60) return `~${Math.ceil(sec)} dtk`
  if (sec < 3600) return `~${Math.ceil(sec / 60)} mnt`
  return `~${(sec / 3600).toFixed(1)} jam`
}

export function StorageUploadModal({ slug, prefix, onSuccess, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [path, setPath] = useState(prefix ? prefix + '/' : '')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState<string | null>(null)
  const startRef = useRef<number>(0)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const fileChangeRef = useRef<(f: File | null) => void>(() => {})

  function handleFileChange(f: File | null) {
    setFile(f)
    if (f && !path.trim()) setPath(prefix ? `${prefix}/${f.name}` : f.name)

    // Reset preview
    setPreviewUrl(null)
    setPreviewText(null)
    if (!f) return

    if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f)
      setPreviewUrl(url)
    } else if (isTextFile(f.type, f.name)) {
      f.text().then((t) => setPreviewText(t.slice(0, 2000))).catch(() => {})
    }
  }

  // Revoke object URL saat file berganti atau modal unmount
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  // Keep ref current so paste handler (closed over empty deps) sees latest state
  fileChangeRef.current = handleFileChange

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (loading) return
      const fileItem = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === 'file')
      if (!fileItem) return
      const pasted = fileItem.getAsFile()
      if (!pasted) return
      e.preventDefault()
      fileChangeRef.current(pasted)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleUpload() {
    if (!file) return
    const finalPath = (path.trim() || file.name).replace(/^\/+/, '')
    if (!finalPath) { setError('Path tidak boleh kosong'); return }

    setLoading(true)
    setError(null)
    setProgress(null)
    startRef.current = Date.now()

    const fd = new FormData()
    fd.append('file', file)
    fd.append('path', finalPath)
    if (description) fd.append('description', description)
    if (tags.length) fd.append('tags', tags.join(','))

    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr

    xhr.upload.addEventListener('progress', (e) => {
      if (!e.lengthComputable) return
      const elapsed = (Date.now() - startRef.current) / 1000
      const speedBps = elapsed > 0 ? e.loaded / elapsed : 0
      const etaSec = speedBps > 0 ? (e.total - e.loaded) / speedBps : null
      setProgress({ percent: Math.round((e.loaded / e.total) * 100), loaded: e.loaded, total: e.total, speedBps, etaSec })
    })

    xhr.addEventListener('load', () => {
      try {
        const json = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) { onSuccess(); onClose() }
        else { setError(json.error ?? `Upload gagal (HTTP ${xhr.status})`); setLoading(false); setProgress(null) }
      } catch { setError('Response tidak valid dari server'); setLoading(false); setProgress(null) }
    })

    xhr.addEventListener('error', () => { setError('Koneksi gagal — cek jaringan'); setLoading(false); setProgress(null) })
    xhr.addEventListener('abort', () => { setLoading(false); setProgress(null) })

    xhr.open('POST', `/api/envman/projects/${slug}/storage/upload`)
    xhr.withCredentials = true
    xhr.send(fd)
  }

  function handleCancel() {
    if (loading) xhrRef.current?.abort()
    onClose()
  }

  return (
    <Stack gap="sm">
      <FileInput label="File" placeholder="Pilih file" required value={file} onChange={handleFileChange}
        description={
          <Group gap={4}>
            <Text size="xs" c="dimmed" inherit>Maks 50 MB per file —</Text>
            <TbClipboard size={11} />
            <Text size="xs" c="dimmed" inherit>Ctrl+V / ⌘V untuk paste gambar atau file</Text>
          </Group>
        }
        disabled={loading} />

      {previewUrl && (
        <Image src={previewUrl} mah={200} fit="contain" radius="md"
          style={{ border: '1px solid var(--mantine-color-default-border)' }} />
      )}
      {previewText !== null && (
        <ScrollArea h={120} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 6 }}>
          <Code block fz="xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {previewText}{previewText.length >= 2000 ? '\n…(dipotong)' : ''}
          </Code>
        </ScrollArea>
      )}

      <TextInput label="Path di storage" placeholder="folder/nama-file.ext" required
        value={path} onChange={(e) => setPath(e.target.value)} disabled={loading}
        description="Path relatif dalam project storage. Contoh: assets/logo.png" />
      <Textarea label="Deskripsi" placeholder="Opsional" value={description}
        onChange={(e) => setDescription(e.target.value)} rows={2} disabled={loading} />
      <TagsInput label="Tags" placeholder="Tambah tag" value={tags} onChange={setTags} disabled={loading} />

      {progress && (
        <Box>
          <Progress value={progress.percent} animated size="md" mb={6} />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">{fmtBytes(progress.loaded)} / {fmtBytes(progress.total)} ({progress.percent}%)</Text>
            <Group gap="xs">
              <Text size="xs" c="dimmed">{fmtBytes(progress.speedBps)}/s</Text>
              {progress.etaSec !== null && <Text size="xs" c="dimmed">{fmtEta(progress.etaSec)}</Text>}
            </Group>
          </Group>
        </Box>
      )}

      {error && <Text size="xs" c="red">{error}</Text>}
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={handleCancel}>
          {loading ? 'Batalkan Upload' : 'Batal'}
        </Button>
        <Button leftSection={<TbCloudUpload size={14} />} onClick={handleUpload} loading={loading} disabled={!file || loading}>
          Upload
        </Button>
      </Group>
    </Stack>
  )
}
