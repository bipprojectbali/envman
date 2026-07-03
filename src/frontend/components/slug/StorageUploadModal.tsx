import { Button, FileInput, Group, Stack, TagsInput, Text, TextInput, Textarea } from '@mantine/core'
import { useState } from 'react'
import { TbCloudUpload } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'

interface Props {
  slug: string
  prefix: string
  onSuccess: () => void
  onClose: () => void
}

export function StorageUploadModal({ slug, prefix, onSuccess, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [path, setPath] = useState(prefix ? prefix + '/' : '')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload() {
    if (!file) return
    const finalPath = (path.trim() || file.name).replace(/^\/+/, '')
    if (!finalPath) { setError('Path tidak boleh kosong'); return }

    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('path', finalPath)
      if (description) fd.append('description', description)
      if (tags.length) fd.append('tags', tags.join(','))

      const res = await fetch(`/api/envman/projects/${slug}/storage/upload`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Upload gagal'); return }
      onSuccess()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function handleFileChange(f: File | null) {
    setFile(f)
    if (f && !path.trim()) {
      setPath(prefix ? `${prefix}/${f.name}` : f.name)
    }
  }

  return (
    <Stack gap="sm">
      <FileInput
        label="File" placeholder="Pilih file" required value={file} onChange={handleFileChange}
        description="Maks 50 MB per file"
      />
      <TextInput
        label="Path di storage" placeholder="folder/nama-file.ext" required
        value={path} onChange={(e) => setPath(e.target.value)}
        description="Path relatif dalam project storage. Contoh: assets/logo.png"
      />
      <Textarea
        label="Deskripsi" placeholder="Opsional" value={description}
        onChange={(e) => setDescription(e.target.value)} rows={2}
      />
      <TagsInput label="Tags" placeholder="Tambah tag" value={tags} onChange={setTags} />
      {error && <Text size="xs" c="red">{error}</Text>}
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onClose} disabled={loading}>Batal</Button>
        <Button leftSection={<TbCloudUpload size={14} />} onClick={handleUpload} loading={loading} disabled={!file}>
          Upload
        </Button>
      </Group>
    </Stack>
  )
}
