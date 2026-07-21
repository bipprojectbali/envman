import { Button, Group, Stack, TagsInput, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { TbPencil } from 'react-icons/tb'

interface Props {
  slug: string
  file: { path: string; tags?: string[] }
  onSuccess: () => void
  onClose: () => void
}

export function StorageRenameModal({ slug, file, onSuccess, onClose }: Props) {
  const currentName = file.path.split('/').pop() ?? file.path
  const [name, setName] = useState(currentName)
  const [tags, setTags] = useState<string[]>(file.tags ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initialTags = file.tags ?? []
  const tagsChanged =
    tags.length !== initialTags.length || tags.some((t, i) => t !== initialTags[i])

  async function handleSave() {
    const newName = name.trim()
    const doRename = newName && newName !== currentName
    if (!doRename && !tagsChanged) { onClose(); return }
    setLoading(true)
    setError(null)
    try {
      // Simpan tags dulu (via meta), lalu rename (yang mengubah path).
      if (tagsChanged) {
        const res = await fetch(`/api/envman/projects/${slug}/storage/meta`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ path: file.path, tags }),
        })
        const json = await res.json()
        if (!res.ok) { setError(json.error ?? 'Simpan tag gagal'); setLoading(false); return }
      }
      if (doRename) {
        const res = await fetch(`/api/envman/projects/${slug}/storage/rename`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ oldPath: file.path, newName }),
        })
        const json = await res.json()
        if (!res.ok) { setError(json.error ?? 'Rename gagal'); setLoading(false); return }
      }
      onSuccess(); onClose()
    } catch {
      setError('Koneksi gagal'); setLoading(false)
    }
  }

  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>{file.path}</Text>
      <TextInput
        label="Nama baru"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
        disabled={loading}
        autoFocus
      />
      <TagsInput
        label="Tags"
        description="Dipakai untuk pencarian & akses per-tag"
        placeholder="tambah tag..."
        value={tags}
        onChange={setTags}
        disabled={loading}
        clearable
      />
      {error && <Text size="xs" c="red">{error}</Text>}
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onClose} disabled={loading}>Batal</Button>
        <Button leftSection={<TbPencil size={14} />} onClick={handleSave} loading={loading}>
          Simpan
        </Button>
      </Group>
    </Stack>
  )
}
